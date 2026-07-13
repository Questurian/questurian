"""Social image generation and upload routes."""

import re
import time
from typing import Optional

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from ..image_processor import ImageVariantType, VARIANT_SPECS, process_single_variant
from ..payload_client import PayloadClient, PayloadUploadError
from ..schemas import GenerateSocialImageRequest
from ..shared import (
    _download_media_asset_file,
    _extract_bearer_token,
    _raise_http_error,
    _read_upload_file,
    _select_social_source_asset,
    _status_from_payload_error,
    _validate_alt_text,
    _validate_location_ref,
    _validate_photographer_credit,
    _wait_for_bunny_original_url,
    logger,
)

router = APIRouter()


@router.post("/generate-social-image")
async def generate_social_image(
    request: GenerateSocialImageRequest,
    authorization: Optional[str] = Header(None),
) -> JSONResponse:
    """
    Regenerate the open_graph (1200x630) variant from the featured image.

    Accepts either the featured media-asset id or the featured media-set id from
    Step 2. When a media set is involved, prefer the best source asset in that set.
    Legacy/orphan assets without a media set still generate from the selected
    featured asset directly.

    Returns the generated asset bunny_original_url for strict SEO social image usage.
    """
    jwt_token = _extract_bearer_token(authorization)
    featured_asset_id = request.featuredAssetId
    featured_media_set_id = request.featuredMediaSetId
    if featured_media_set_id is not None:
        if featured_media_set_id <= 0:
            _raise_http_error(
                status_code=400,
                message="featuredMediaSetId must be a positive integer",
                step="validate_featured_media_set_id",
                featured_media_set_id=featured_media_set_id,
            )
    elif featured_asset_id is None or featured_asset_id <= 0:
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
        if featured_media_set_id is not None:
            media_set_id = str(featured_media_set_id)
            media_set_assets = await client.list_media_assets_by_media_set(media_set_id)
            source_asset = _select_social_source_asset(media_set_assets)
            if not source_asset:
                _raise_http_error(
                    status_code=400,
                    message="No source assets found in featured image media set",
                    step="select_source_asset",
                    featured_media_set_id=featured_media_set_id,
                    media_set_id=media_set_id,
                )
        else:
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
                source_asset = featured_asset
                external_ref = (
                    f"social-og-featured-{featured_asset_id}-{int(time.time() * 1000)}"
                )
                media_set_id = await client.create_media_set(
                    title=f"Social OG featured {featured_asset_id}",
                    alt_text="",
                    external_ref=external_ref,
                )
            else:
                media_set_id = str(raw_media_set_id)
                media_set_assets = await client.list_media_assets_by_media_set(
                    media_set_id
                )
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
            "featuredAssetId": (
                str(featured_asset_id) if featured_asset_id is not None else None
            ),
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
        filename_seed = (
            re.sub(
                r"[^A-Za-z0-9_-]+",
                "-",
                (file.filename or "social-upload").rsplit(".", 1)[0],
            )
            .strip("-")
            .lower()
            or "social-upload"
        )
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
