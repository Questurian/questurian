"""Composite source selection, download, and validation."""

import io
from typing import Any, Optional

from PIL import Image

from ..payload_client import PayloadClient
from ..shared import _download_media_asset_file, _raise_http_error
from .models import CompositeRequest, SourceImage


def _extract_asset_id(value: Any) -> Optional[int]:
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    if isinstance(value, dict):
        raw = value.get('id')
        if isinstance(raw, int):
            return raw
        if isinstance(raw, str) and raw.isdigit():
            return int(raw)
    return None


def _asset_filename(value: Any) -> Optional[str]:
    if isinstance(value, dict):
        filename = value.get('filename')
        if isinstance(filename, str) and filename.strip():
            return filename.strip()
    return None


def _media_set_focal(media_set: dict[str, Any]) -> tuple[float, float]:
    focal = media_set.get('focal_point')
    if not isinstance(focal, dict):
        return (0.5, 0.5)
    x = focal.get('x')
    y = focal.get('y')
    return (
        min(1.0, max(0.0, x if isinstance(x, (int, float)) else 0.5)),
        min(1.0, max(0.0, y if isinstance(y, (int, float)) else 0.5)),
    )


def _rank_variant_key(key: str) -> int:
    priority = {
        'hero': 0,
        'wide': 1,
        'editorial': 2,
        'open_graph': 3,
        'portrait': 4,
        'square': 5,
        'thumbnail': 6,
    }
    return priority.get(key, 999)


def _select_asset_candidate(
    media_set: dict[str, Any]
) -> tuple[Optional[int], Optional[str]]:
    source = media_set.get('source')
    source_id = _extract_asset_id(source)
    source_filename = _asset_filename(source)
    if source_id or source_filename:
        return (source_id, source_filename)
    variants = media_set.get('variants')
    if isinstance(variants, dict):
        candidates: list[tuple[int, int, Optional[str]]] = []
        for key, value in variants.items():
            asset_id = _extract_asset_id(value)
            filename = _asset_filename(value)
            if asset_id or filename:
                candidates.append(
                    (_rank_variant_key(str(key)), asset_id or 0, filename)
                )
        if candidates:
            _, asset_id, filename = sorted(candidates)[0]
            return (asset_id or None, filename)
    return (None, None)


async def _download_asset_image(
    *,
    client: PayloadClient,
    jwt_token: str,
    asset_id: Optional[int],
    filename: Optional[str],
) -> tuple[Image.Image, str]:
    asset = await client.get_media_asset_by_id(asset_id) if asset_id else None
    resolved_filename = filename or (asset.get('filename') if asset else None)
    if not resolved_filename:
        _raise_http_error(
            status_code=400,
            message='Selected MediaSet has no downloadable source or variant',
            step='resolve_composite_source',
            asset_id=asset_id,
        )
    content = await _download_media_asset_file(
        payload_client=client, jwt_token=jwt_token, filename=resolved_filename
    )
    try:
        image = Image.open(io.BytesIO(content)).convert('RGB')
    except Exception as exc:
        _raise_http_error(
            status_code=400,
            message='Selected MediaSet image could not be parsed',
            step='parse_composite_source',
            filename=resolved_filename,
            detail=str(exc),
        )
    return (image, resolved_filename)


async def _load_sources(
    *, client: PayloadClient, jwt_token: str, source_ids: list[int]
) -> list[SourceImage]:
    sources: list[SourceImage] = []
    for media_set_id in source_ids:
        media_set = await client.get_media_set_by_id(media_set_id, depth=2)
        if not media_set:
            _raise_http_error(
                status_code=404,
                message='Selected MediaSet was not found',
                step='load_composite_source',
                media_set_id=media_set_id,
            )
        asset_id, filename = _select_asset_candidate(media_set)
        image, resolved_filename = await _download_asset_image(
            client=client, jwt_token=jwt_token, asset_id=asset_id, filename=filename
        )
        focal_x, focal_y = _media_set_focal(media_set)
        sources.append(
            SourceImage(
                media_set_id=media_set_id,
                image=image,
                filename=resolved_filename,
                focal_x=focal_x,
                focal_y=focal_y,
                width=image.width,
                height=image.height,
            )
        )
    return sources


def _validate_request_shape(request: CompositeRequest) -> None:
    expected_count = 2 if request.layout == 'two-up' else 4
    if len(request.sources) != expected_count:
        _raise_http_error(
            status_code=400,
            message=f'{request.layout} requires exactly {expected_count} sources',
            step='validate_composite_request',
            layout=request.layout,
            expected_count=expected_count,
            received_count=len(request.sources),
        )
    ids = [source.mediaSetId for source in request.sources]
    if len(set(ids)) != len(ids):
        _raise_http_error(
            status_code=400,
            message='Composite sources must be unique',
            step='validate_composite_request',
            media_set_ids=ids,
        )


def _warnings(sources: list[SourceImage]) -> list[str]:
    warnings: list[str] = []
    for source in sources:
        if source.width < 1000 or source.height < 700:
            warnings.append(
                f'MediaSet {source.media_set_id} source is low resolution ({source.width}x{source.height}).'
            )
    return warnings
