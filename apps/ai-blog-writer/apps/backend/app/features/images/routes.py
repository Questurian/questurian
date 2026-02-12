"""API routes for image processing and upload."""

import logging
from collections import Counter
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from .alt_text_generator import generate_alt_text
from .image_processor import (
    VARIANT_SPECS,
    ImageVariantType,
    ProcessedVariant,
    process_image_variants,
)
from .payload_client import PayloadClient, PayloadUploadError, upload_image_set


router = APIRouter(prefix="/images", tags=["images"])
logger = logging.getLogger("images.routes")

MAX_FILE_SIZE = 10 * 1024 * 1024
REQUIRED_VARIANT_TYPES = tuple(variant.value for variant in ImageVariantType)
VARIANT_DIMENSIONS = {
    variant.value: (spec.width, spec.height)
    for variant, spec in VARIANT_SPECS.items()
}
UPLOAD_ORDER = list(REQUIRED_VARIANT_TYPES)


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


@router.post("/upload")
async def upload_image(
    file: UploadFile = File(...),
    external_ref: str = Form(
        ...,
        description="Unique reference for this image set (e.g., staged article ID)",
    ),
    alt_text: str = Form(..., description="Alt text for accessibility"),
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
