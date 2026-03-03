"""API routes for image processing and upload."""

import asyncio
import logging
import os
import re
import time
from collections import Counter
from typing import Any, Dict, List, Optional
from urllib.parse import quote
from urllib.parse import unquote, urlparse

import httpx
from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from .alt_text_generator import generate_alt_text
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


router = APIRouter(prefix="/images", tags=["images"])
logger = logging.getLogger("images.routes")

MAX_FILE_SIZE = 10 * 1024 * 1024
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
    variant.value: (spec.width, spec.height)
    for variant, spec in VARIANT_SPECS.items()
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


class GenerateSocialImageRequest(BaseModel):
    featuredAssetId: int = Field(
        ...,
        description="Featured media-asset id selected in Step 2",
    )


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
        variant_type
        for variant_type, count in counts.items()
        if count > 1
    )

    if invalid_types or missing_types or duplicate_types:
        _raise_http_error(
            status_code=400,
            message=(
                "variant_types must include each required variant exactly once"
            ),
            step="validate_variant_types",
            required_types=list(REQUIRED_VARIANT_TYPES),
            invalid_types=invalid_types,
            missing_types=missing_types,
            duplicate_types=duplicate_types,
        )


def _validate_location_ref(location_ref: int) -> int:
    """Validate location reference for image metadata."""
    if location_ref <= 0:
        _raise_http_error(
            status_code=400,
            message="location_ref must be a positive integer",
            step="validate_location_ref",
            location_ref=location_ref,
        )
    return location_ref


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

    content_type = response.headers.get("content-type", "").split(";")[0].strip().lower()
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


@router.get("/pexels/search")
async def search_pexels_images(
    query: str,
    per_page: int = 9,
    page: int = 1,
    orientation: Optional[str] = None,
) -> JSONResponse:
    """Proxy basic Pexels photo search for stage image picker previews."""
    normalized_query = query.strip()
    normalized_orientation = (orientation or "").strip().lower()
    if not normalized_query:
        _raise_http_error(
            status_code=400,
            message="query is required",
            step="validate_pexels_query",
        )

    if per_page < 1 or per_page > 80:
        _raise_http_error(
            status_code=400,
            message="per_page must be between 1 and 80",
            step="validate_pexels_query",
            per_page=per_page,
        )

    if page < 1:
        _raise_http_error(
            status_code=400,
            message="page must be greater than 0",
            step="validate_pexels_query",
            page=page,
        )

    if (
        normalized_orientation
        and normalized_orientation not in PEXELS_ALLOWED_ORIENTATIONS
    ):
        _raise_http_error(
            status_code=400,
            message="orientation must be landscape, portrait, or square",
            step="validate_pexels_query",
            orientation=orientation,
        )

    api_key = _get_pexels_api_key()
    params: Dict[str, Any] = {
        "query": normalized_query,
        "per_page": per_page,
        "page": page,
    }
    if normalized_orientation:
        params["orientation"] = normalized_orientation

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                PEXELS_SEARCH_URL,
                params=params,
                headers={"Authorization": api_key},
            )
    except httpx.RequestError as exc:
        logger.exception("Pexels request failed for query=%s", normalized_query)
        _raise_http_error(
            status_code=502,
            message="Failed to reach Pexels API",
            step="request_pexels",
            detail=str(exc),
        )

    if response.status_code >= 400:
        detail_message = f"Pexels API returned {response.status_code}"
        if response.status_code == 429:
            _raise_http_error(
                status_code=429,
                message=detail_message,
                step="request_pexels",
                provider_status_code=response.status_code,
            )
        _raise_http_error(
            status_code=502,
            message=detail_message,
            step="request_pexels",
            provider_status_code=response.status_code,
        )

    try:
        payload = response.json()
    except ValueError as exc:
        logger.exception("Pexels response was not valid JSON for query=%s", normalized_query)
        _raise_http_error(
            status_code=502,
            message="Pexels API returned invalid JSON",
            step="parse_pexels_response",
            detail=str(exc),
        )

    photos_raw = payload.get("photos")
    if not isinstance(photos_raw, list):
        photos_raw = []

    photos: List[Dict[str, Any]] = []
    for photo in photos_raw:
        if not isinstance(photo, dict):
            continue

        src = photo.get("src")
        if not isinstance(src, dict):
            src = {}

        image_url = (
            src.get("medium")
            or src.get("large")
            or src.get("large2x")
            or src.get("portrait")
            or src.get("original")
        )
        if not image_url:
            continue

        photo_id = photo.get("id")
        photos.append(
            {
                "id": int(photo_id) if isinstance(photo_id, int) else photo_id,
                "width": photo.get("width"),
                "height": photo.get("height"),
                "alt": photo.get("alt") or "",
                "photographer": photo.get("photographer") or "",
                "photographer_url": photo.get("photographer_url") or "",
                "pexels_url": photo.get("url") or "",
                "image_url": image_url,
                "image_url_large": src.get("large2x") or src.get("large") or image_url,
                "image_url_portrait": src.get("portrait") or image_url,
                "image_url_original": src.get("original") or image_url,
            }
        )

    return JSONResponse(
        {
            "success": True,
            "query": normalized_query,
            "page": page,
            "per_page": per_page,
            "total_results": payload.get("total_results", 0),
            "photos": photos,
        }
    )


@router.get("/unsplash/search")
async def search_unsplash_images(
    query: str,
    per_page: int = 18,
    page: int = 1,
    orientation: Optional[str] = None,
) -> JSONResponse:
    """Proxy basic Unsplash photo search for stage image picker previews."""
    normalized_query = query.strip()
    normalized_orientation = (orientation or "").strip().lower()
    if not normalized_query:
        _raise_http_error(
            status_code=400,
            message="query is required",
            step="validate_unsplash_query",
        )

    if per_page < 1 or per_page > 30:
        _raise_http_error(
            status_code=400,
            message="per_page must be between 1 and 30",
            step="validate_unsplash_query",
            per_page=per_page,
        )

    if page < 1:
        _raise_http_error(
            status_code=400,
            message="page must be greater than 0",
            step="validate_unsplash_query",
            page=page,
        )

    if (
        normalized_orientation
        and normalized_orientation not in UNSPLASH_ALLOWED_ORIENTATIONS
    ):
        _raise_http_error(
            status_code=400,
            message="orientation must be landscape, portrait, or square",
            step="validate_unsplash_query",
            orientation=orientation,
        )

    unsplash_orientation = (
        "squarish" if normalized_orientation == "square" else normalized_orientation
    )

    access_key = _get_unsplash_access_key()
    params: Dict[str, Any] = {
        "query": normalized_query,
        "per_page": per_page,
        "page": page,
    }
    if unsplash_orientation:
        params["orientation"] = unsplash_orientation

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                UNSPLASH_SEARCH_URL,
                params=params,
                headers={
                    "Authorization": f"Client-ID {access_key}",
                    "Accept-Version": "v1",
                },
            )
    except httpx.RequestError as exc:
        logger.exception("Unsplash request failed for query=%s", normalized_query)
        _raise_http_error(
            status_code=502,
            message="Failed to reach Unsplash API",
            step="request_unsplash",
            detail=str(exc),
        )

    if response.status_code >= 400:
        detail_message = f"Unsplash API returned {response.status_code}"
        if response.status_code == 429:
            _raise_http_error(
                status_code=429,
                message=detail_message,
                step="request_unsplash",
                provider_status_code=response.status_code,
            )
        _raise_http_error(
            status_code=502,
            message=detail_message,
            step="request_unsplash",
            provider_status_code=response.status_code,
        )

    try:
        payload = response.json()
    except ValueError as exc:
        logger.exception(
            "Unsplash response was not valid JSON for query=%s",
            normalized_query,
        )
        _raise_http_error(
            status_code=502,
            message="Unsplash API returned invalid JSON",
            step="parse_unsplash_response",
            detail=str(exc),
        )

    photos_raw = payload.get("results")
    if not isinstance(photos_raw, list):
        photos_raw = []

    photos: List[Dict[str, Any]] = []
    for photo in photos_raw:
        if not isinstance(photo, dict):
            continue

        urls = photo.get("urls")
        if not isinstance(urls, dict):
            urls = {}

        image_url = urls.get("small") or urls.get("regular") or urls.get("full")
        if not image_url:
            continue

        user = photo.get("user")
        if not isinstance(user, dict):
            user = {}

        user_links = user.get("links")
        if not isinstance(user_links, dict):
            user_links = {}

        links = photo.get("links")
        if not isinstance(links, dict):
            links = {}

        photo_id = photo.get("id")
        photos.append(
            {
                "id": photo_id,
                "width": photo.get("width"),
                "height": photo.get("height"),
                "alt": photo.get("alt_description")
                or photo.get("description")
                or "",
                "photographer": user.get("name") or "",
                "photographer_url": user_links.get("html") or "",
                "unsplash_url": links.get("html") or "",
                "image_url": image_url,
                "image_url_regular": urls.get("regular") or image_url,
                "image_url_full": urls.get("full") or image_url,
                "image_url_raw": urls.get("raw") or image_url,
            }
        )

    return JSONResponse(
        {
            "success": True,
            "query": normalized_query,
            "page": page,
            "per_page": per_page,
            "total_results": payload.get("total", 0),
            "photos": photos,
        }
    )


@router.post("/upload")
async def upload_image(
    file: UploadFile = File(...),
    external_ref: str = Form(
        ...,
        description="Unique reference for this image set (e.g., staged article ID)",
    ),
    alt_text: str = Form(..., description="Alt text for accessibility"),
    photographer_credit: str = Form(
        ...,
        description="Photographer credit for uploaded assets",
    ),
    location_ref: int = Form(
        ...,
        description="Payload location id to attach to uploaded images",
    ),
    authorization: Optional[str] = Header(None),
) -> JSONResponse:
    """
    Upload an image and process it into all required variants server-side.

    The image will be:
    1. Processed into variants (thumbnail, square, wide, portrait, hero,
       open_graph, editorial)
    2. Converted to WebP format with 85% quality
    3. Uploaded to Payload CMS as media-assets
    4. Linked in a new MediaSet
    """
    jwt_token = _extract_bearer_token(authorization)
    valid_location_ref = _validate_location_ref(location_ref)
    valid_photographer_credit = _validate_photographer_credit(photographer_credit)
    content = await _read_upload_file(file, step="validate_file")

    try:
        variants = process_image_variants(
            source_buffer=content,
            original_filename=file.filename or "upload.jpg",
            alt_text=alt_text,
        )

        result = await upload_image_set(
            jwt_token=jwt_token,
            external_ref=external_ref,
            alt_text=alt_text,
            photographer_credit=valid_photographer_credit,
            location_ref=valid_location_ref,
            variants=variants,
        )
    except PayloadUploadError as exc:
        logger.exception(
            "Payload error during /images/upload | external_ref=%s",
            external_ref,
        )
        _raise_http_error(
            status_code=_status_from_payload_error(exc),
            message="Failed to upload image variants to Payload CMS",
            step=exc.step,
            detail=exc.detail or str(exc),
            external_ref=external_ref,
            location_ref=valid_location_ref,
            payload_error=exc.to_dict(),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(
            "Unexpected image processing error | external_ref=%s",
            external_ref,
        )
        _raise_http_error(
            status_code=500,
            message="Failed to process image",
            step="process_image_variants",
            detail=str(exc),
            external_ref=external_ref,
            location_ref=valid_location_ref,
        )

    return JSONResponse(
        {
            "success": True,
            "mediaSetId": result["mediaSetId"],
            "externalRef": external_ref,
            "variantAssetIds": result.get("variantAssetIds", {}),
            "variants": {
                variant_type.value: {
                    "filename": variant.filename,
                    "width": variant.width,
                    "height": variant.height,
                    "size": variant.file_size,
                }
                for variant_type, variant in variants.items()
            },
        }
    )


@router.post("/import-external")
async def import_external_image(
    source_url: str = Form(..., description="Direct image URL from provider"),
    provider: str = Form(..., description="Image provider (unsplash or pexels)"),
    external_ref: str = Form(
        ...,
        description="Unique reference for this image set (e.g., staged article ID)",
    ),
    alt_text: str = Form(..., description="Alt text for accessibility"),
    photographer_credit: str = Form(
        ...,
        description="Photographer credit for uploaded assets",
    ),
    location_ref: int = Form(
        ...,
        description="Payload location id to attach to uploaded images",
    ),
    photo_id: Optional[str] = Form(
        None,
        description="Provider photo identifier for filename stability",
    ),
    authorization: Optional[str] = Header(None),
) -> JSONResponse:
    """Import an external provider image and upload processed variants to Payload."""
    jwt_token = _extract_bearer_token(authorization)
    valid_location_ref = _validate_location_ref(location_ref)
    valid_photographer_credit = _validate_photographer_credit(photographer_credit)
    valid_provider = _validate_external_provider(provider)
    valid_source_url = _validate_external_source_url(source_url, valid_provider)
    original_filename = _derive_external_filename(
        valid_source_url,
        valid_provider,
        photo_id,
    )

    try:
        downloaded_image = await _download_external_image(
            valid_source_url,
            valid_provider,
        )
        variants = process_image_variants(
            source_buffer=downloaded_image["content"],
            original_filename=original_filename,
            alt_text=alt_text,
        )

        result = await upload_image_set(
            jwt_token=jwt_token,
            external_ref=external_ref,
            alt_text=alt_text,
            photographer_credit=valid_photographer_credit,
            location_ref=valid_location_ref,
            variants=variants,
        )
    except PayloadUploadError as exc:
        logger.exception(
            "Payload error during /images/import-external | external_ref=%s provider=%s",
            external_ref,
            valid_provider,
        )
        _raise_http_error(
            status_code=_status_from_payload_error(exc),
            message="Failed to upload imported image variants to Payload CMS",
            step=exc.step,
            detail=exc.detail or str(exc),
            external_ref=external_ref,
            location_ref=valid_location_ref,
            provider=valid_provider,
            source_url=valid_source_url,
            payload_error=exc.to_dict(),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(
            "Unexpected image import error | external_ref=%s provider=%s",
            external_ref,
            valid_provider,
        )
        _raise_http_error(
            status_code=500,
            message="Failed to import external image",
            step="import_external_image",
            detail=str(exc),
            external_ref=external_ref,
            location_ref=valid_location_ref,
            provider=valid_provider,
            source_url=valid_source_url,
        )

    return JSONResponse(
        {
            "success": True,
            "mediaSetId": result["mediaSetId"],
            "externalRef": external_ref,
            "provider": valid_provider,
            "sourceUrl": valid_source_url,
            "variantAssetIds": result.get("variantAssetIds", {}),
            "variants": {
                variant_type.value: {
                    "filename": variant.filename,
                    "width": variant.width,
                    "height": variant.height,
                    "size": variant.file_size,
                }
                for variant_type, variant in variants.items()
            },
        }
    )


@router.get("/external-source")
async def fetch_external_image_source(
    source_url: str,
    provider: str,
    photo_id: Optional[str] = None,
    authorization: Optional[str] = Header(None),
) -> Response:
    """Download a validated external image and return raw bytes for client-side cropping."""
    _extract_bearer_token(authorization)
    valid_provider = _validate_external_provider(provider)
    valid_source_url = _validate_external_source_url(source_url, valid_provider)
    original_filename = _derive_external_filename(
        valid_source_url,
        valid_provider,
        photo_id,
    )

    downloaded_image = await _download_external_image(valid_source_url, valid_provider)

    return Response(
        content=downloaded_image["content"],
        media_type=downloaded_image["content_type"],
        headers={
            "Content-Disposition": f'inline; filename="{original_filename}"',
        },
    )


@router.post("/upload-variants")
async def upload_image_variants(
    variants: List[UploadFile] = File(
        ...,
        description="The required variant image files",
    ),
    variant_types: List[str] = Form(
        ...,
        description=(
            "Types for each variant (thumbnail, square, wide, portrait, hero, "
            "open_graph, editorial)"
        ),
    ),
    external_ref: str = Form(..., description="Unique reference for this image set"),
    alt_text: str = Form(..., description="Alt text for accessibility"),
    photographer_credit: str = Form(
        ...,
        description="Photographer credit for uploaded assets",
    ),
    location_ref: int = Form(
        ...,
        description="Payload location id to attach to uploaded images",
    ),
    authorization: Optional[str] = Header(None),
) -> JSONResponse:
    """
    Upload pre-processed image variants (client-side cropped) to Payload CMS.

    This endpoint accepts already-cropped variant files and:
    1. Uploads each to Payload CMS as media-assets
    2. Creates or reuses a MediaSet linking all variants
    """
    jwt_token = _extract_bearer_token(authorization)
    valid_location_ref = _validate_location_ref(location_ref)
    valid_photographer_credit = _validate_photographer_credit(photographer_credit)

    if len(variants) != len(variant_types):
        _raise_http_error(
            status_code=400,
            message="Number of variant files must match number of variant types",
            step="validate_variant_payload",
            file_count=len(variants),
            type_count=len(variant_types),
        )

    if len(variants) != len(REQUIRED_VARIANT_TYPES):
        _raise_http_error(
            status_code=400,
            message=(
                f"Exactly {len(REQUIRED_VARIANT_TYPES)} variants are required"
            ),
            step="validate_variant_payload",
            expected_count=len(REQUIRED_VARIANT_TYPES),
            received_count=len(variants),
        )

    _validate_variant_types(variant_types)

    client = PayloadClient(jwt_token)
    media_set_id: Optional[str] = None
    failed_variant: Optional[str] = None
    variant_asset_ids: Dict[str, str] = {}
    variant_files_by_type: Dict[str, Dict[str, Any]] = {}

    try:
        for variant_file, variant_type in zip(variants, variant_types):
            content = await _read_upload_file(
                variant_file,
                step=f"read_variant_file:{variant_type}",
            )
            content_type = variant_file.content_type or "image/webp"
            if not content_type.startswith("image/"):
                _raise_http_error(
                    status_code=400,
                    message="All variants must be image files",
                    step="validate_variant_file",
                    variant_type=variant_type,
                    content_type=content_type,
                )

            width, height = VARIANT_DIMENSIONS[variant_type]
            variant_files_by_type[variant_type] = {
                "filename": variant_file.filename or f"{variant_type}.webp",
                "content": content,
                "content_type": content_type,
                "width": width,
                "height": height,
                "size": len(content),
            }

        existing = await client.find_media_set_by_external_ref(external_ref)
        if existing:
            existing_id = existing.get("id")
            if not existing_id:
                _raise_http_error(
                    status_code=502,
                    message="Payload returned a MediaSet without an id",
                    step="find_media_set",
                    external_ref=external_ref,
                    payload_response=existing,
                )
            media_set_id = str(existing_id)
        else:
            media_set_id = await client.create_media_set(
                title=external_ref,
                alt_text=alt_text,
                external_ref=external_ref,
                location_ref=valid_location_ref,
            )

        for variant_type in UPLOAD_ORDER:
            variant_file = variant_files_by_type[variant_type]
            failed_variant = variant_type

            variant_obj = ProcessedVariant(
                variant_type=ImageVariantType(variant_type),
                buffer=variant_file["content"],
                filename=variant_file["filename"],
                width=variant_file["width"],
                height=variant_file["height"],
                content_type=variant_file["content_type"],
                file_size=variant_file["size"],
            )

            asset_id = await client.upload_image(
                variant=variant_obj,
                alt_text=alt_text,
                photographer_credit=valid_photographer_credit,
                media_set_id=media_set_id,
                location_ref=valid_location_ref,
            )
            if not asset_id:
                _raise_http_error(
                    status_code=502,
                    message="Payload upload returned no asset id",
                    step=f"upload_variant:{variant_type}",
                    failed_variant=variant_type,
                    media_set_id=media_set_id,
                    external_ref=external_ref,
                    partial_variant_asset_ids=variant_asset_ids,
                )
            variant_asset_ids[variant_type] = asset_id

        missing_asset_ids = [
            variant_type
            for variant_type in UPLOAD_ORDER
            if variant_type not in variant_asset_ids
        ]
        if missing_asset_ids:
            _raise_http_error(
                status_code=502,
                message="Upload incomplete: missing variant asset IDs",
                step="finalize_upload",
                external_ref=external_ref,
                media_set_id=media_set_id,
                missing_variant_ids=missing_asset_ids,
                partial_variant_asset_ids=variant_asset_ids,
            )
    except PayloadUploadError as exc:
        logger.exception(
            "Payload error during /images/upload-variants | external_ref=%s "
            "media_set_id=%s failed_variant=%s",
            external_ref,
            media_set_id,
            failed_variant,
        )
        _raise_http_error(
            status_code=_status_from_payload_error(exc),
            message="Failed to upload variants to Payload CMS",
            step=exc.step,
            detail=exc.detail or str(exc),
            external_ref=external_ref,
            location_ref=valid_location_ref,
            media_set_id=media_set_id,
            failed_variant=failed_variant,
            partial_variant_asset_ids=variant_asset_ids,
            payload_error=exc.to_dict(),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(
            "Unexpected error during /images/upload-variants | external_ref=%s",
            external_ref,
        )
        _raise_http_error(
            status_code=500,
            message="Unexpected error while uploading image variants",
            step="upload_image_variants",
            detail=str(exc),
            external_ref=external_ref,
            location_ref=valid_location_ref,
            media_set_id=media_set_id,
            failed_variant=failed_variant,
            partial_variant_asset_ids=variant_asset_ids,
        )

    return JSONResponse(
        {
            "success": True,
            "mediaSetId": media_set_id,
            "externalRef": external_ref,
            "variantAssetIds": variant_asset_ids,
            "variants": {
                variant_type: {
                    "filename": variant_files_by_type[variant_type]["filename"],
                    "width": variant_files_by_type[variant_type]["width"],
                    "height": variant_files_by_type[variant_type]["height"],
                    "size": variant_files_by_type[variant_type]["size"],
                }
                for variant_type in UPLOAD_ORDER
            },
        }
    )


@router.post("/generate-social-image")
async def generate_social_image(
    request: GenerateSocialImageRequest,
    authorization: Optional[str] = Header(None),
) -> JSONResponse:
    """
    Regenerate the open_graph (1200x630) variant from the featured image media set.

    Returns the generated asset bunny_original_url for strict SEO social image usage.
    """
    jwt_token = _extract_bearer_token(authorization)
    featured_asset_id = request.featuredAssetId
    if featured_asset_id <= 0:
        _raise_http_error(
            status_code=400,
            message="featuredAssetId must be a positive integer",
            step="validate_featured_asset_id",
            featured_asset_id=featured_asset_id,
        )

    client = PayloadClient(jwt_token)
    media_set_id: Optional[str] = None
    source_asset_id: Optional[str] = None
    generated_asset_id: Optional[str] = None

    try:
        featured_asset = await client.get_media_asset_by_id(featured_asset_id)
        if not featured_asset:
            _raise_http_error(
                status_code=400,
                message="featuredAssetId does not exist in Payload media-assets",
                step="validate_featured_asset_id",
                featured_asset_id=featured_asset_id,
            )

        raw_media_set_id = featured_asset.get("mediaSet")
        if raw_media_set_id is None:
            _raise_http_error(
                status_code=400,
                message=(
                    "Featured image must belong to a media set. "
                    "Re-select a featured image uploaded through the variant workflow."
                ),
                step="validate_featured_media_set",
                featured_asset_id=featured_asset_id,
            )
        media_set_id = str(raw_media_set_id)

        media_set_assets = await client.list_media_assets_by_media_set(media_set_id)
        source_asset = _select_social_source_asset(media_set_assets)
        if not source_asset:
            _raise_http_error(
                status_code=400,
                message="No source assets found in featured image media set",
                step="select_source_asset",
                featured_asset_id=featured_asset_id,
                media_set_id=media_set_id,
            )
        source_asset_id = source_asset["id"]

        source_buffer = await _download_media_asset_file(
            payload_client=client,
            jwt_token=jwt_token,
            filename=source_asset["filename"],
        )

        open_graph_variant = process_single_variant(
            source_buffer=source_buffer,
            original_filename=source_asset["filename"],
            variant_type=ImageVariantType.OPEN_GRAPH,
        )

        generated_asset_id = await client.upload_image(
            variant=open_graph_variant,
            alt_text="",
            photographer_credit="",
            media_set_id=media_set_id,
        )
        generated_image_url = await _wait_for_bunny_original_url(
            client=client,
            asset_id=generated_asset_id,
        )
    except PayloadUploadError as exc:
        logger.exception(
            "Payload error during /images/generate-social-image | featured_asset_id=%s "
            "media_set_id=%s source_asset_id=%s generated_asset_id=%s",
            featured_asset_id,
            media_set_id,
            source_asset_id,
            generated_asset_id,
        )
        _raise_http_error(
            status_code=_status_from_payload_error(exc),
            message="Failed to generate social image in Payload CMS",
            step=exc.step,
            detail=exc.detail or str(exc),
            featured_asset_id=featured_asset_id,
            media_set_id=media_set_id,
            source_asset_id=source_asset_id,
            generated_asset_id=generated_asset_id,
            payload_error=exc.to_dict(),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(
            "Unexpected error during /images/generate-social-image | featured_asset_id=%s",
            featured_asset_id,
        )
        _raise_http_error(
            status_code=500,
            message="Unexpected error while generating social image",
            step="generate_social_image",
            detail=str(exc),
            featured_asset_id=featured_asset_id,
            media_set_id=media_set_id,
            source_asset_id=source_asset_id,
            generated_asset_id=generated_asset_id,
        )

    return JSONResponse(
        {
            "success": True,
            "featuredAssetId": str(featured_asset_id),
            "mediaSetId": media_set_id,
            "sourceAssetId": source_asset_id,
            "generatedAssetId": generated_asset_id,
            "generatedImageUrl": generated_image_url,
            "width": VARIANT_SPECS[ImageVariantType.OPEN_GRAPH].width,
            "height": VARIANT_SPECS[ImageVariantType.OPEN_GRAPH].height,
        }
    )


@router.post("/upload-social-image")
async def upload_social_image(
    file: UploadFile = File(...),
    alt_text: str = Form(..., description="Alt text for accessibility"),
    photographer_credit: str = Form(
        ...,
        description="Photographer credit for uploaded asset",
    ),
    location_ref: int = Form(
        ...,
        description="Payload location id to attach to uploaded image",
    ),
    authorization: Optional[str] = Header(None),
) -> JSONResponse:
    """
    Upload one social image for OG/Twitter usage only.

    This endpoint processes the source into a single open_graph (1200x630) variant
    and uploads it directly without creating/updating a media set.
    """
    jwt_token = _extract_bearer_token(authorization)
    valid_location_ref = _validate_location_ref(location_ref)
    valid_photographer_credit = _validate_photographer_credit(photographer_credit)
    valid_alt_text = _validate_alt_text(alt_text)
    content = await _read_upload_file(file, step="validate_file")

    media_set_id: Optional[str] = None
    external_ref: Optional[str] = None
    generated_asset_id: Optional[str] = None

    try:
        open_graph_variant = process_single_variant(
            source_buffer=content,
            original_filename=file.filename or "social-upload.jpg",
            variant_type=ImageVariantType.OPEN_GRAPH,
        )

        client = PayloadClient(jwt_token)
        filename_seed = re.sub(
            r"[^A-Za-z0-9_-]+",
            "-",
            (file.filename or "social-upload").rsplit(".", 1)[0],
        ).strip("-").lower() or "social-upload"
        external_ref = f"social-og-{filename_seed}-{int(time.time() * 1000)}"
        media_set_id = await client.create_media_set(
            title=f"Social OG {filename_seed}",
            alt_text=valid_alt_text,
            external_ref=external_ref,
            location_ref=valid_location_ref,
        )
        generated_asset_id = await client.upload_image(
            variant=open_graph_variant,
            alt_text=valid_alt_text,
            photographer_credit=valid_photographer_credit,
            media_set_id=media_set_id,
            location_ref=valid_location_ref,
        )
        generated_image_url = await _wait_for_bunny_original_url(
            client=client,
            asset_id=generated_asset_id,
        )
    except PayloadUploadError as exc:
        logger.exception(
            "Payload error during /images/upload-social-image | generated_asset_id=%s",
            generated_asset_id,
        )
        _raise_http_error(
            status_code=_status_from_payload_error(exc),
            message="Failed to upload social image",
            step=exc.step,
            detail=exc.detail or str(exc),
            media_set_id=media_set_id,
            external_ref=external_ref,
            generated_asset_id=generated_asset_id,
            location_ref=valid_location_ref,
            payload_error=exc.to_dict(),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Unexpected error during /images/upload-social-image")
        _raise_http_error(
            status_code=500,
            message="Unexpected error while uploading social image",
            step="upload_social_image",
            detail=str(exc),
            media_set_id=media_set_id,
            external_ref=external_ref,
            generated_asset_id=generated_asset_id,
            location_ref=valid_location_ref,
        )

    return JSONResponse(
        {
            "success": True,
            "mediaSetId": media_set_id,
            "externalRef": external_ref,
            "generatedAssetId": str(generated_asset_id),
            "generatedImageUrl": generated_image_url,
            "width": VARIANT_SPECS[ImageVariantType.OPEN_GRAPH].width,
            "height": VARIANT_SPECS[ImageVariantType.OPEN_GRAPH].height,
        }
    )


@router.post("/process-only")
async def process_image_only(
    file: UploadFile = File(...),
    alt_text: str = Form(default="", description="Alt text for accessibility"),
) -> JSONResponse:
    """Process an image into all required variants without uploading to Payload."""
    content = await _read_upload_file(file, step="validate_file")

    try:
        variants = process_image_variants(
            source_buffer=content,
            original_filename=file.filename or "upload.jpg",
            alt_text=alt_text,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to process image in /images/process-only")
        _raise_http_error(
            status_code=500,
            message="Failed to process image",
            step="process_image_variants",
            detail=str(exc),
        )

    return JSONResponse(
        {
            "success": True,
            "original_filename": file.filename,
            "original_size": len(content),
            "variants": {
                variant_type.value: {
                    "filename": variant.filename,
                    "width": variant.width,
                    "height": variant.height,
                    "content_type": variant.content_type,
                    "size": variant.file_size,
                }
                for variant_type, variant in variants.items()
            },
        }
    )


@router.post("/generate-alt-text")
async def generate_alt_text_endpoint(
    file: UploadFile = File(...),
    narrative_focus: str = Form(
        default="",
        description="Optional audience or narrative focus for alt-text emphasis",
    ),
) -> JSONResponse:
    """Generate alt text for an image using Gemini vision."""
    content = await _read_upload_file(file, step="validate_file")
    content_type = file.content_type or "image/jpeg"

    try:
        alt_text = generate_alt_text(
            image_bytes=content,
            content_type=content_type,
            narrative_focus=narrative_focus.strip() or None,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to generate alt text")
        _raise_http_error(
            status_code=500,
            message="Failed to generate alt text",
            step="generate_alt_text",
            detail=str(exc),
        )

    return JSONResponse({"success": True, "alt_text": alt_text})
