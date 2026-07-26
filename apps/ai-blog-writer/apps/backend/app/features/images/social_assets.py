"""Payload source-asset selection and download helpers."""

import asyncio
from typing import Dict, List, Optional
from urllib.parse import quote

import httpx

from .payload_client import PayloadClient, PayloadMediaAssetDoc, PayloadUploadError


SOURCE_VARIANT_PRIORITY: Dict[str, int] = {
    "hero": 0,
    "wide": 1,
    "editorial": 2,
    "open_graph": 3,
    "portrait": 4,
    "square": 5,
    "thumbnail": 6,
}


def _asset_area(asset: PayloadMediaAssetDoc) -> int:
    width = asset.get('width')
    height = asset.get('height')
    if not isinstance(width, int) or width <= 0:
        return 0
    if not isinstance(height, int) or height <= 0:
        return 0
    return width * height


def _asset_variant_priority(asset: PayloadMediaAssetDoc) -> int:
    variant = asset.get('variant') or ''
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
            str(asset.get('id', '')),
        ),
    )
    return ranked[0] if ranked else None


async def _download_media_asset_file(
    *, payload_client: PayloadClient, jwt_token: str, filename: str
) -> bytes:
    encoded_filename = quote(filename, safe='')
    url = f'{payload_client.api_url}/api/media-assets/file/{encoded_filename}'
    headers = {'Authorization': f'JWT {jwt_token}'}
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(url, headers=headers)
    except httpx.ConnectError as exc:
        raise PayloadUploadError(
            step='download_media_asset_file',
            message='Cannot connect to Payload CMS',
            request_url=url,
            detail=f'Is Payload running at {payload_client.api_url}? ({exc})',
        )
    except httpx.TimeoutException as exc:
        raise PayloadUploadError(
            step='download_media_asset_file',
            message='Payload CMS file download timed out (60s)',
            request_url=url,
            detail=str(exc),
        )
    if response.status_code >= 400:
        raise PayloadUploadError(
            step='download_media_asset_file',
            message='Payload rejected media-asset file download',
            status_code=response.status_code,
            response_body=response.text,
            request_url=url,
            detail=response.text[:300] if response.text else 'Empty response',
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
            bunny_url = (asset.get('bunny_original_url') or '').strip()
            if bunny_url:
                return bunny_url
        if attempt < max_attempts - 1:
            await asyncio.sleep(delay_seconds)
    raise PayloadUploadError(
        step='validate_generated_bunny_url',
        message='Generated open_graph asset is missing bunny_original_url',
        status_code=502,
        detail='Payload did not expose bunny_original_url within retry window. Ensure 1200x630 sync hook and Bunny hostname are configured.',
    )
