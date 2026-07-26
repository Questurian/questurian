"""HTTP routes for composite preview, creation, and cleanup."""

import asyncio
import json
import time
from typing import Optional

from fastapi import APIRouter, Header
from fastapi.responses import JSONResponse, Response

from ..image_processor import ImageVariantType, ProcessedVariant
from ..payload_client import PayloadClient, PayloadUploadError
from ..shared import (
    _extract_bearer_token,
    _raise_http_error,
    _status_from_payload_error,
    _validate_location_ref,
    _validate_photographer_credit,
    logger,
)
from .cleanup import (  # noqa: F401
    _find_hanging_composites as _find_hanging_composites,
    _first_asset_preview as _first_asset_preview,
    _parse_created_at as _parse_created_at,
)
from .models import (  # noqa: F401
    CompositeLayout as CompositeLayout,
    CompositeRequest as CompositeRequest,
    CompositeSource as CompositeSource,
    EXPECTED_VARIANT_COUNT as EXPECTED_VARIANT_COUNT,
    HANGING_EXTERNAL_REF_PREFIX as HANGING_EXTERNAL_REF_PREFIX,
    HangingCleanupRequest as HangingCleanupRequest,
    SourceImage as SourceImage,
)
from .rendering import (  # noqa: F401
    _crop_to_fill as _crop_to_fill,
    _render_composite_variant as _render_composite_variant,
    _render_variants as _render_variants,
    _safe_stem as _safe_stem,
    _tile_boxes as _tile_boxes,
)
from .sources import (  # noqa: F401
    _asset_filename as _asset_filename,
    _download_asset_image as _download_asset_image,
    _extract_asset_id as _extract_asset_id,
    _load_sources as _load_sources,
    _media_set_focal as _media_set_focal,
    _rank_variant_key as _rank_variant_key,
    _select_asset_candidate as _select_asset_candidate,
    _validate_request_shape as _validate_request_shape,
    _warnings as _warnings,
)
from .uploads import (  # noqa: F401
    _TRANSIENT_STATUS as _TRANSIENT_STATUS,
    _rollback_partial_composite as _rollback_partial_composite,
    _upload_variant_with_retry_impl,
)


router = APIRouter(prefix="/composites")


async def _upload_variant_with_retry(
    *,
    client: PayloadClient,
    variant: ProcessedVariant,
    alt_text: str,
    photographer_credit: str,
    media_set_id: str,
    location_ref: Optional[int],
    attempts: int = 3,
) -> str:
    """Compatibility wrapper that preserves the routes.asyncio.sleep seam."""
    return await _upload_variant_with_retry_impl(
        client=client,
        variant=variant,
        alt_text=alt_text,
        photographer_credit=photographer_credit,
        media_set_id=media_set_id,
        location_ref=location_ref,
        attempts=attempts,
        sleep=asyncio.sleep,
    )


async def _prepare(
    request: CompositeRequest, authorization: Optional[str]
) -> tuple[str, Optional[int], str, list[SourceImage], list[str]]:
    _validate_request_shape(request)
    jwt_token = _extract_bearer_token(authorization)
    location_ref = _validate_location_ref(request.locationRef)
    photographer_credit = _validate_photographer_credit(
        request.photographerCredit or 'Questurian Composite'
    )
    client = PayloadClient(jwt_token)
    sources = await _load_sources(
        client=client,
        jwt_token=jwt_token,
        source_ids=[source.mediaSetId for source in request.sources],
    )
    return (jwt_token, location_ref, photographer_credit, sources, _warnings(sources))


@router.post('/preview')
async def preview_composite(
    request: CompositeRequest, authorization: Optional[str] = Header(None)
) -> Response:
    try:
        _, _, _, sources, warnings = await _prepare(request, authorization)
    except PayloadUploadError as exc:
        logger.exception('Payload error during /images/composites/preview')
        _raise_http_error(
            status_code=_status_from_payload_error(exc),
            message='Failed to preview composite image',
            step=exc.step,
            detail=exc.detail or str(exc),
            payload_error=exc.to_dict(),
        )
    variant = _render_composite_variant(
        layout=request.layout,
        sources=sources,
        variant_type=ImageVariantType.WIDE,
        original_filename=f'{_safe_stem(request.title)}.webp',
    )
    return Response(
        content=variant.buffer,
        media_type='image/webp',
        headers={'X-Composite-Warnings': json.dumps(warnings)},
    )


@router.post('/create')
async def create_composite(
    request: CompositeRequest, authorization: Optional[str] = Header(None)
) -> JSONResponse:
    try:
        jwt_token, location_ref, photographer_credit, sources, warnings = (
            await _prepare(request, authorization)
        )
    except PayloadUploadError as exc:
        logger.exception('Payload error during /images/composites/create prepare')
        _raise_http_error(
            status_code=_status_from_payload_error(exc),
            message='Failed to prepare composite image',
            step=exc.step,
            detail=exc.detail or str(exc),
            payload_error=exc.to_dict(),
        )
    client = PayloadClient(jwt_token)
    external_ref = f'composite-{_safe_stem(request.title)}-{int(time.time() * 1000)}'
    variants = _render_variants(
        layout=request.layout, sources=sources, original_filename=f'{external_ref}.webp'
    )
    media_set_id: Optional[str] = None
    uploaded_asset_ids: list[str] = []
    variant_asset_ids: dict[str, str] = {}
    try:
        media_set_id = await client.create_media_set(
            title=request.title.strip(),
            alt_text=request.altText.strip(),
            external_ref=external_ref,
            photographer_credit=photographer_credit,
            location_ref=location_ref,
        )
        for variant_type in ImageVariantType:
            asset_id = await _upload_variant_with_retry(
                client=client,
                variant=variants[variant_type],
                alt_text=request.altText.strip(),
                photographer_credit=photographer_credit,
                media_set_id=media_set_id,
                location_ref=location_ref,
            )
            uploaded_asset_ids.append(asset_id)
            variant_asset_ids[variant_type.value] = asset_id
    except PayloadUploadError as exc:
        logger.exception('Payload error during /images/composites/create')
        await _rollback_partial_composite(
            client=client,
            media_set_id=media_set_id,
            uploaded_asset_ids=uploaded_asset_ids,
        )
        _raise_http_error(
            status_code=_status_from_payload_error(exc),
            message='Failed to create composite MediaSet',
            step=exc.step,
            detail=exc.detail or str(exc),
            payload_error=exc.to_dict(),
        )
    return JSONResponse(
        {
            'success': True,
            'mediaSetId': media_set_id,
            'externalRef': external_ref,
            'variantAssetIds': variant_asset_ids,
            'warnings': warnings,
        }
    )


@router.get('/hanging')
async def list_hanging_composites(
    authorization: Optional[str] = Header(None), min_age_minutes: float = 5.0
) -> JSONResponse:
    """List composite MediaSets left incomplete by a failed upload."""
    jwt_token = _extract_bearer_token(authorization)
    client = PayloadClient(jwt_token)
    try:
        hanging = await _find_hanging_composites(
            client=client, min_age_minutes=min_age_minutes
        )
    except PayloadUploadError as exc:
        logger.exception('Payload error during /images/composites/hanging')
        _raise_http_error(
            status_code=_status_from_payload_error(exc),
            message='Failed to list hanging composites',
            step=exc.step,
            detail=exc.detail or str(exc),
            payload_error=exc.to_dict(),
        )
    return JSONResponse({'hanging': hanging, 'count': len(hanging)})


@router.post('/cleanup')
async def cleanup_hanging_composites(
    request: HangingCleanupRequest, authorization: Optional[str] = Header(None)
) -> JSONResponse:
    """Delete the given hanging composite MediaSets and their variant assets.

    Only sets that are genuinely hanging (composite-prefixed and below the full
    variant count) are removed — a guard against deleting a healthy MediaSet.
    """
    jwt_token = _extract_bearer_token(authorization)
    client = PayloadClient(jwt_token)
    try:
        hanging = await _find_hanging_composites(client=client, min_age_minutes=0.0)
    except PayloadUploadError as exc:
        logger.exception('Payload error during /images/composites/cleanup scan')
        _raise_http_error(
            status_code=_status_from_payload_error(exc),
            message='Failed to scan composites for cleanup',
            step=exc.step,
            detail=exc.detail or str(exc),
            payload_error=exc.to_dict(),
        )
    hanging_by_id = {str(entry['mediaSetId']): entry for entry in hanging}
    requested_ids = [str(mid) for mid in request.mediaSetIds]
    deleted: list[str] = []
    skipped: list[str] = []
    errors: list[dict] = []
    for media_set_id in requested_ids:
        entry = hanging_by_id.get(media_set_id)
        if entry is None:
            skipped.append(media_set_id)
            continue
        try:
            for asset_id in entry['assetIds']:
                await client.delete_media_asset(asset_id)
            await client.delete_media_set(media_set_id)
            deleted.append(media_set_id)
        except PayloadUploadError as exc:
            logger.warning(
                'Cleanup failed for hanging composite media_set_id=%s: %s',
                media_set_id,
                exc,
            )
            errors.append(
                {'mediaSetId': media_set_id, 'detail': exc.detail or str(exc)}
            )
    return JSONResponse(
        {
            'deleted': deleted,
            'skipped': skipped,
            'errors': errors,
            'deletedCount': len(deleted),
        }
    )
