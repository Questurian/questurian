"""Shared helpers for image API routes."""

import asyncio
import json
import logging
import os
import re
import time
from collections import Counter
from typing import Any, Dict, List, Optional
from urllib.parse import quote
from urllib.parse import unquote, urlparse

import httpx
from fastapi import HTTPException, UploadFile
from .bfl_client import BflApiError
from .image_processor import (
    VARIANT_SPECS,
    ImageVariantType,
    ProcessedVariant,
    process_image_variants,
    process_single_variant,
)
from .payload_client import (
    PayloadClient,
    PayloadMediaAssetDoc,
    PayloadUploadError,
    upload_image_set,
)


logger = logging.getLogger("images.routes")

MAX_FILE_SIZE = 10 * 1024 * 1024
ALLOWED_BFL_MODEL_IDS = {
    "flux-2-max",
    "flux-2-pro-preview",
    "flux-2-pro",
    "flux-2-flex",
}
MAX_BFL_ADDITIONAL_REFERENCE_IMAGES = 7
MIN_BFL_DIMENSION = 64
BFL_DIMENSION_MULTIPLE = 16
REQUIRED_VARIANT_TYPES = tuple(variant.value for variant in ImageVariantType)
PEXELS_SEARCH_URL = "https://api.pexels.com/v1/search"
PEXELS_ALLOWED_ORIENTATIONS = {"landscape", "portrait", "square"}
UNSPLASH_SEARCH_URL = "https://api.unsplash.com/search/photos"
UNSPLASH_ALLOWED_ORIENTATIONS = {"landscape", "portrait", "square"}
EXTERNAL_IMPORT_ALLOWED_HOSTS = {
    "unsplash": ("images.unsplash.com",),
    "pexels": ("images.pexels.com",),
}
MAX_EXTERNAL_IMPORT_FILE_SIZE = 25 * 1024 * 1024
VARIANT_DIMENSIONS = {
    variant.value: (spec.width, spec.height) for variant, spec in VARIANT_SPECS.items()
}
UPLOAD_ORDER = list(REQUIRED_VARIANT_TYPES)
SOURCE_VARIANT_PRIORITY: Dict[str, int] = {
    "hero": 0,
    "wide": 1,
    "editorial": 2,
    "open_graph": 3,
    "portrait": 4,
    "square": 5,
    "thumbnail": 6,
}


def _build_error_detail(message: str, **context: Any) -> Dict[str, Any]:
    """Build structured API error details while omitting empty values."""
    detail: Dict[str, Any] = {"message": message}

    for key, value in context.items():
        if value is None:
            continue
        if isinstance(value, (str, list, dict)) and not value:
            continue
        detail[key] = value

    return detail


def _raise_http_error(status_code: int, message: str, **context: Any) -> None:
    """Raise a FastAPI HTTPException with structured error context."""
    raise HTTPException(
        status_code=status_code,
        detail=_build_error_detail(message, **context),
    )


def _status_from_payload_error(error: PayloadUploadError) -> int:
    """Map Payload-specific errors into API response status codes."""
    if error.status_code in {401, 403}:
        return error.status_code

    if 400 <= error.status_code < 500:
        return 400

    if error.status_code >= 500:
        return 502

    detail_text = f"{error.detail} {error}".lower()
    if "timed out" in detail_text:
        return 504

    return 503


def _status_from_bfl_error(error: BflApiError) -> int:
    """Map BFL-specific errors into API response status codes."""
    if error.status_code in {400, 402, 403, 422, 429, 500, 503, 504}:
        return error.status_code

    if 400 <= error.status_code < 500:
        return error.status_code

    if error.status_code >= 500:
        return 502

    return 502


def _extract_bearer_token(authorization: Optional[str]) -> str:
    """Extract and validate the JWT from the Authorization header."""
    if not authorization or not authorization.startswith("Bearer "):
        _raise_http_error(
            status_code=401,
            message="Authorization header required with Bearer token",
            step="validate_auth",
        )

    token = authorization.replace("Bearer ", "", 1).strip()
    if not token:
        _raise_http_error(
            status_code=401,
            message="Bearer token is empty",
            step="validate_auth",
        )

    return token


def _validate_flux_prompt(prompt: str) -> str:
    normalized_prompt = prompt.strip()
    if not normalized_prompt:
        _raise_http_error(
            status_code=400,
            message="prompt is required",
            step="validate_flux_prompt",
        )
    return normalized_prompt


def _validate_flux_model_id(model_id: Optional[str]) -> Optional[str]:
    normalized_model_id = (model_id or "").strip()
    if not normalized_model_id:
        return None

    if normalized_model_id not in ALLOWED_BFL_MODEL_IDS:
        _raise_http_error(
            status_code=400,
            message="model_id must target a supported FLUX.2 endpoint",
            step="validate_flux_model_id",
            model_id=model_id,
            allowed_model_ids=sorted(ALLOWED_BFL_MODEL_IDS),
        )

    return normalized_model_id


def _validate_flux_safety_tolerance(safety_tolerance: int) -> int:
    if 0 <= safety_tolerance <= 5:
        return safety_tolerance

    _raise_http_error(
        status_code=400,
        message="safety_tolerance must be between 0 and 5",
        step="validate_flux_safety_tolerance",
        safety_tolerance=safety_tolerance,
        min_value=0,
        max_value=5,
    )


def _validate_flux_dimensions(
    width: Optional[int],
    height: Optional[int],
) -> tuple[Optional[int], Optional[int]]:
    if width is None and height is None:
        return None, None

    if width is None or height is None:
        _raise_http_error(
            status_code=400,
            message="width and height must be provided together",
            step="validate_flux_dimensions",
            width=width,
            height=height,
        )

    if width < MIN_BFL_DIMENSION or height < MIN_BFL_DIMENSION:
        _raise_http_error(
            status_code=400,
            message="width and height must each be at least 64 pixels",
            step="validate_flux_dimensions",
            width=width,
            height=height,
            min_dimension=MIN_BFL_DIMENSION,
        )

    if width % BFL_DIMENSION_MULTIPLE != 0 or height % BFL_DIMENSION_MULTIPLE != 0:
        _raise_http_error(
            status_code=400,
            message="width and height must be multiples of 16",
            step="validate_flux_dimensions",
            width=width,
            height=height,
            multiple=BFL_DIMENSION_MULTIPLE,
        )

    return width, height


def _asset_area(asset: PayloadMediaAssetDoc) -> int:
    width = asset.get("width")
    height = asset.get("height")
    if not isinstance(width, int) or width <= 0:
        return 0
    if not isinstance(height, int) or height <= 0:
        return 0
    return width * height


def _asset_variant_priority(asset: PayloadMediaAssetDoc) -> int:
    variant = asset.get("variant") or ""
    return SOURCE_VARIANT_PRIORITY.get(variant, 999)


def _select_social_source_asset(
    assets: List[PayloadMediaAssetDoc],
) -> Optional[PayloadMediaAssetDoc]:
    if not assets:
        return None

    ranked = sorted(
        assets,
        key=lambda asset: (
            -_asset_area(asset),
            _asset_variant_priority(asset),
            str(asset.get("id", "")),
        ),
    )
    return ranked[0] if ranked else None


async def _download_media_asset_file(
    *,
    payload_client: PayloadClient,
    jwt_token: str,
    filename: str,
) -> bytes:
    encoded_filename = quote(filename, safe="")
    url = f"{payload_client.api_url}/api/media-assets/file/{encoded_filename}"
    headers = {"Authorization": f"JWT {jwt_token}"}

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(url, headers=headers)
    except httpx.ConnectError as exc:
        raise PayloadUploadError(
            step="download_media_asset_file",
            message="Cannot connect to Payload CMS",
            request_url=url,
            detail=f"Is Payload running at {payload_client.api_url}? ({exc})",
        )
    except httpx.TimeoutException as exc:
        raise PayloadUploadError(
            step="download_media_asset_file",
            message="Payload CMS file download timed out (60s)",
            request_url=url,
            detail=str(exc),
        )

    if response.status_code >= 400:
        raise PayloadUploadError(
            step="download_media_asset_file",
            message="Payload rejected media-asset file download",
            status_code=response.status_code,
            response_body=response.text,
            request_url=url,
            detail=response.text[:300] if response.text else "Empty response",
        )

    return response.content


async def _wait_for_bunny_original_url(
    *,
    client: PayloadClient,
    asset_id: str,
    max_attempts: int = 8,
    delay_seconds: float = 0.35,
) -> str:
    """
    Poll Payload for bunny_original_url after upload.

    In practice this field can appear shortly after the asset create response.
    We keep strict Bunny-only behavior and fail if it never appears.
    """
    for attempt in range(max_attempts):
        asset = await client.get_media_asset_by_id(asset_id)
        if asset:
            bunny_url = (asset.get("bunny_original_url") or "").strip()
            if bunny_url:
                return bunny_url

        if attempt < max_attempts - 1:
            await asyncio.sleep(delay_seconds)

    raise PayloadUploadError(
        step="validate_generated_bunny_url",
        message="Generated open_graph asset is missing bunny_original_url",
        status_code=502,
        detail=(
            "Payload did not expose bunny_original_url within retry window. "
            "Ensure 1200x630 sync hook and Bunny hostname are configured."
        ),
    )


def _validate_variant_types(variant_types: List[str]) -> None:
    """Validate that each required variant type appears exactly once."""
    counts = Counter(variant_types)
    required = set(REQUIRED_VARIANT_TYPES)
    provided = set(variant_types)

    invalid_types = sorted(provided - required)
    missing_types = sorted(required - provided)
    duplicate_types = sorted(
        variant_type for variant_type, count in counts.items() if count > 1
    )

    if invalid_types or missing_types or duplicate_types:
        _raise_http_error(
            status_code=400,
            message=("variant_types must include each required variant exactly once"),
            step="validate_variant_types",
            required_types=list(REQUIRED_VARIANT_TYPES),
            invalid_types=invalid_types,
            missing_types=missing_types,
            duplicate_types=duplicate_types,
        )


def _normalize_tag_name(name: str) -> str:
    """Normalize user input to a valid Payload tag name (kebab-case)."""
    normalized = name.lower().strip()
    normalized = re.sub(r'[^a-z0-9]+', '-', normalized)
    return normalized.strip('-')


def _validate_location_ref(location_ref: int) -> Optional[int]:
    """Validate location reference for image metadata. Returns None when 0 (no location)."""
    if location_ref < 0:
        _raise_http_error(
            status_code=400,
            message="location_ref must be a non-negative integer (0 = no location)",
            step="validate_location_ref",
            location_ref=location_ref,
        )
    return location_ref if location_ref > 0 else None


def _parse_tag_ids(tags_json: Optional[str]) -> List[int]:
    """Parse JSON-encoded list of tag IDs. Returns empty list on None or parse failure."""
    if not tags_json:
        return []
    try:
        parsed = json.loads(tags_json)
    except (json.JSONDecodeError, ValueError):
        _raise_http_error(
            status_code=400,
            message="tags must be a JSON-encoded list of integer IDs",
            step="parse_tag_ids",
            tags=tags_json,
        )
    if not isinstance(parsed, list):
        _raise_http_error(
            status_code=400,
            message="tags must be a JSON array",
            step="parse_tag_ids",
        )
    result = []
    for item in parsed:
        if isinstance(item, int) and item > 0:
            result.append(item)
        elif isinstance(item, float) and item.is_integer() and item > 0:
            result.append(int(item))
        else:
            _raise_http_error(
                status_code=400,
                message="Each tag ID must be a positive integer",
                step="parse_tag_ids",
                invalid_value=item,
            )
    return result


def _validate_photographer_credit(photographer_credit: str) -> str:
    """Ensure uploads always include photographer attribution."""
    normalized_credit = photographer_credit.strip()
    if not normalized_credit:
        _raise_http_error(
            status_code=400,
            message="photographer_credit is required",
            step="validate_photographer_credit",
        )
    return normalized_credit


def _validate_alt_text(alt_text: str) -> str:
    """Ensure uploads provide non-empty alt text."""
    normalized_alt_text = alt_text.strip()
    if not normalized_alt_text:
        _raise_http_error(
            status_code=400,
            message="alt_text is required",
            step="validate_alt_text",
        )
    return normalized_alt_text


def _get_pexels_api_key() -> str:
    """Load and validate the Pexels API key from environment variables."""
    api_key = os.getenv("PEXELS_API_KEY", "").strip()
    if not api_key:
        _raise_http_error(
            status_code=500,
            message="PEXELS_API_KEY is not configured",
            step="validate_pexels_key",
            env_var="PEXELS_API_KEY",
        )
    return api_key


def _get_unsplash_access_key() -> str:
    """Load and validate the Unsplash access key from environment."""
    access_key = os.getenv("UNSPLASH_ACCESS_KEY", "").strip()
    if not access_key:
        _raise_http_error(
            status_code=500,
            message="UNSPLASH_ACCESS_KEY is not configured",
            step="validate_unsplash_key",
            env_var="UNSPLASH_ACCESS_KEY",
        )
    return access_key


def _validate_external_provider(provider: str) -> str:
    """Validate provider string used for external image imports."""
    normalized_provider = provider.strip().lower()
    if normalized_provider not in EXTERNAL_IMPORT_ALLOWED_HOSTS:
        _raise_http_error(
            status_code=400,
            message="provider must be unsplash or pexels",
            step="validate_external_provider",
            provider=provider,
        )
    return normalized_provider


def _is_allowed_external_host(hostname: str, allowed_hosts: tuple[str, ...]) -> bool:
    """Return True when host exactly matches or is a subdomain of allowed hosts."""
    normalized_host = hostname.strip().lower()
    for allowed in allowed_hosts:
        if normalized_host == allowed or normalized_host.endswith(f".{allowed}"):
            return True
    return False


def _validate_external_source_url(source_url: str, provider: str) -> str:
    """Validate source URL for external image imports."""
    normalized_source_url = source_url.strip()
    if not normalized_source_url:
        _raise_http_error(
            status_code=400,
            message="source_url is required",
            step="validate_external_source_url",
        )

    parsed = urlparse(normalized_source_url)
    if parsed.scheme.lower() != "https":
        _raise_http_error(
            status_code=400,
            message="source_url must use https",
            step="validate_external_source_url",
            source_url=normalized_source_url,
        )

    hostname = (parsed.hostname or "").strip().lower()
    if not hostname:
        _raise_http_error(
            status_code=400,
            message="source_url must include a hostname",
            step="validate_external_source_url",
            source_url=normalized_source_url,
        )

    allowed_hosts = EXTERNAL_IMPORT_ALLOWED_HOSTS[provider]
    if not _is_allowed_external_host(hostname, allowed_hosts):
        _raise_http_error(
            status_code=400,
            message="source_url host is not allowed for provider",
            step="validate_external_source_url",
            source_url=normalized_source_url,
            hostname=hostname,
            provider=provider,
            allowed_hosts=list(allowed_hosts),
        )

    return normalized_source_url


def _derive_external_filename(
    source_url: str,
    provider: str,
    photo_id: Optional[str],
) -> str:
    """Build a stable filename used for generated variants."""
    parsed = urlparse(source_url)
    candidate = unquote(parsed.path.split("/")[-1]).strip()

    if candidate and "." in candidate:
        sanitized = re.sub(r"[^A-Za-z0-9._-]+", "-", candidate).strip("-")
        if sanitized:
            return sanitized

    fallback_seed = (photo_id or "").strip() or "external-image"
    fallback_seed = re.sub(r"[^A-Za-z0-9_-]+", "-", fallback_seed).strip("-")
    if not fallback_seed:
        fallback_seed = "external-image"
    return f"{provider}-{fallback_seed}.jpg"


async def _download_external_image(source_url: str, provider: str) -> Dict[str, Any]:
    """Download and validate an external image before variant processing."""
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            response = await client.get(
                source_url,
                headers={
                    "User-Agent": "QuesturianStageImporter/1.0",
                    "Accept": "image/*,*/*;q=0.8",
                },
            )
    except httpx.RequestError as exc:
        logger.exception(
            "External image download failed | provider=%s source_url=%s",
            provider,
            source_url,
        )
        _raise_http_error(
            status_code=502,
            message="Failed to download external image",
            step="download_external_image",
            provider=provider,
            source_url=source_url,
            detail=str(exc),
        )

    if response.status_code >= 400:
        _raise_http_error(
            status_code=502,
            message="External image provider returned an error",
            step="download_external_image",
            provider=provider,
            source_url=source_url,
            provider_status_code=response.status_code,
        )

    content_type = (
        response.headers.get("content-type", "").split(";")[0].strip().lower()
    )
    if not content_type.startswith("image/"):
        _raise_http_error(
            status_code=400,
            message="source_url did not return an image",
            step="download_external_image",
            provider=provider,
            source_url=source_url,
            content_type=content_type or None,
        )

    content = response.content
    if not content:
        _raise_http_error(
            status_code=400,
            message="Downloaded external image is empty",
            step="download_external_image",
            provider=provider,
            source_url=source_url,
        )

    if len(content) > MAX_EXTERNAL_IMPORT_FILE_SIZE:
        _raise_http_error(
            status_code=400,
            message="External image is too large",
            step="download_external_image",
            provider=provider,
            source_url=source_url,
            size_bytes=len(content),
            max_size_bytes=MAX_EXTERNAL_IMPORT_FILE_SIZE,
        )

    return {
        "content": content,
        "content_type": content_type,
        "size_bytes": len(content),
    }


async def _read_upload_file(file: UploadFile, step: str) -> bytes:
    """Read and validate uploaded file bytes."""
    if not file.filename:
        _raise_http_error(
            status_code=400,
            message="No file provided",
            step=step,
        )

    content = await file.read()
    if not content:
        _raise_http_error(
            status_code=400,
            message="Empty file",
            step=step,
            filename=file.filename,
        )

    if len(content) > MAX_FILE_SIZE:
        _raise_http_error(
            status_code=400,
            message="File too large (max 10MB)",
            step=step,
            filename=file.filename,
            size_bytes=len(content),
            max_size_bytes=MAX_FILE_SIZE,
        )

    return content


async def _read_additional_reference_images(
    files: List[UploadFile],
) -> List[bytes]:
    normalized_files = [file for file in files if file and file.filename]
    if len(normalized_files) > MAX_BFL_ADDITIONAL_REFERENCE_IMAGES:
        _raise_http_error(
            status_code=400,
            message="FLUX.2 accepts up to 7 additional reference images",
            step="validate_additional_reference_images",
            additional_reference_count=len(normalized_files),
            max_additional_reference_images=MAX_BFL_ADDITIONAL_REFERENCE_IMAGES,
        )

    image_bytes: List[bytes] = []
    for file in normalized_files:
        image_bytes.append(
            await _read_upload_file(
                file,
                step="validate_additional_reference_image",
            )
        )

    return image_bytes
