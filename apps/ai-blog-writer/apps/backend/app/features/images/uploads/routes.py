"""Image upload and external import routes."""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response

from ..image_processor import ImageVariantType, ProcessedVariant, process_image_variants
from ..payload_client import PayloadClient, PayloadUploadError, upload_image_set
from ..schemas import ResolveTagsRequest
from ..shared import (
    REQUIRED_VARIANT_TYPES,
    UPLOAD_ORDER,
    VARIANT_DIMENSIONS,
    _derive_external_filename,
    _download_external_image,
    _normalize_tag_name,
    _parse_tag_ids,
    _raise_http_error,
    _read_upload_file,
    _status_from_payload_error,
    _validate_external_provider,
    _validate_external_source_url,
    _validate_location_ref,
    _validate_photographer_credit,
    _validate_variant_types,
    logger,
    require_image_token,
)

router = APIRouter()


@router.post("/tags/resolve")
async def resolve_tags(
    request: ResolveTagsRequest,
    jwt_token: str = Depends(require_image_token),
):
    """Find or create tags by name. Returns IDs for all provided names."""
    client = PayloadClient(jwt_token)

    results = []
    for raw_name in request.names:
        normalized = _normalize_tag_name(raw_name)
        if not normalized:
            continue
        try:
            tag_id = await client.find_or_create_tag(normalized)
            results.append({"id": tag_id, "name": normalized})
        except PayloadUploadError as e:
            raise HTTPException(status_code=502, detail=e.to_dict())

    return {"tags": results}


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
    jwt_token: str = Depends(require_image_token),
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
    jwt_token: str = Depends(require_image_token),
) -> JSONResponse:
    """Import an external provider image and upload processed variants to Payload."""
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
    jwt_token: str = Depends(require_image_token),
) -> Response:
    """Download a validated external image and return raw bytes for client-side cropping."""
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
        0,
        description="Payload location id to attach to uploaded images (0 = no location)",
    ),
    tags: Optional[str] = Form(
        None,
        description="JSON-encoded list of integer tag IDs, e.g. '[1,2,3]'",
    ),
    jwt_token: str = Depends(require_image_token),
) -> JSONResponse:
    """
    Upload pre-processed image variants (client-side cropped) to Payload CMS.

    This endpoint accepts already-cropped variant files and:
    1. Uploads each to Payload CMS as media-assets
    2. Creates or reuses a MediaSet linking all variants
    """
    valid_location_ref = _validate_location_ref(location_ref)
    valid_photographer_credit = _validate_photographer_credit(photographer_credit)
    tag_ids = _parse_tag_ids(tags)

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
            message=(f"Exactly {len(REQUIRED_VARIANT_TYPES)} variants are required"),
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
                tags=tag_ids or None,
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
                tags=tag_ids or None,
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
