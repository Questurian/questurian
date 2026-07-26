"""Detection of incomplete composite MediaSets."""

from datetime import datetime, timezone
from typing import Any, Optional

from ..payload_client import PayloadClient
from .models import EXPECTED_VARIANT_COUNT, HANGING_EXTERNAL_REF_PREFIX


def _parse_created_at(value: Any) -> Optional[datetime]:
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        return None


def _first_asset_preview(assets: list[dict]) -> Optional[str]:
    for asset in assets:
        url = asset.get('url')
        if isinstance(url, str) and url:
            return url
    return None


async def _find_hanging_composites(
    *, client: PayloadClient, min_age_minutes: float
) -> list[dict]:
    """Return composite MediaSets that have fewer than the full variant set."""
    media_sets = await client.find_media_sets_by_external_ref_prefix(
        HANGING_EXTERNAL_REF_PREFIX
    )
    now = datetime.now(timezone.utc)
    hanging: list[dict] = []
    for media_set in media_sets:
        external_ref = str(media_set.get('externalRef') or '')
        if not external_ref.startswith(HANGING_EXTERNAL_REF_PREFIX):
            continue
        set_id = media_set.get('id')
        if set_id is None:
            continue
        created = _parse_created_at(media_set.get('createdAt'))
        if created is not None:
            age_minutes = (now - created).total_seconds() / 60
            if age_minutes < min_age_minutes:
                continue
        assets = await client.list_media_assets_by_media_set(set_id)
        if len(assets) >= EXPECTED_VARIANT_COUNT:
            continue
        hanging.append(
            {
                'mediaSetId': set_id,
                'externalRef': external_ref,
                'title': media_set.get('title') or 'Untitled composite',
                'createdAt': media_set.get('createdAt'),
                'variantCount': len(assets),
                'expectedVariants': EXPECTED_VARIANT_COUNT,
                'previewUrl': _first_asset_preview(assets),
                'assetIds': [
                    str(a.get('id')) for a in assets if a.get('id') is not None
                ],
            }
        )
    return hanging
