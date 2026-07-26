"""Public Payload CMS media client facade."""

import logging
from typing import Optional

import httpx

from .image_processor import ImageVariantType, ProcessedVariant
from .payload_config import (  # noqa: F401
    DEFAULT_PAYLOAD_API_URL,
    _resolve_payload_api_url,
    _running_in_docker,
)
from .payload_deletion import _PayloadDeletion
from .payload_documents import (  # noqa: F401
    PayloadMediaAssetDoc,
    PayloadUploadError,
    _extract_relationship_id,
    _is_missing_storage_file_delete_error,
    _is_variant_conflict_error,
    _parse_media_asset_doc,
    _parse_payload_error,
    _to_optional_int,
)
from .payload_media_assets import _PayloadMediaAssets
from .payload_media_sets import _PayloadMediaSets
from .payload_tags import _PayloadTags
from .payload_uploads import _PayloadUploads


logger = logging.getLogger("images.payload")


class PayloadClient(
    _PayloadUploads,
    _PayloadMediaSets,
    _PayloadMediaAssets,
    _PayloadTags,
    _PayloadDeletion,
):
    """Async client for Payload CMS media operations."""

    def __init__(self, jwt_token: Optional[str] = None):
        self.api_url = _resolve_payload_api_url().rstrip("/")
        self.jwt_token = jwt_token
        if not jwt_token:
            logger.warning("PayloadClient created without JWT token")

    def _get_headers(self) -> dict:
        headers = {}
        if self.jwt_token:
            headers["Authorization"] = f"JWT {self.jwt_token}"
        return headers

    def _async_client(self, *, timeout: float):
        """Create the HTTP transport through the public monkeypatch seam."""
        return httpx.AsyncClient(timeout=timeout)


async def upload_image_set(
    jwt_token: str,
    external_ref: str,
    alt_text: str,
    photographer_credit: str,
    location_ref: int,
    variants: dict[ImageVariantType, ProcessedVariant],
) -> dict:
    """Upload all image variants and create a MediaSet (server-side processing)."""
    client = PayloadClient(jwt_token)
    existing = await client.find_media_set_by_external_ref(external_ref)
    if existing:
        existing_id = existing.get('id')
        if not existing_id:
            raise PayloadUploadError(
                step='find_media_set',
                message='Payload returned an existing MediaSet without an id',
                detail=f'external_ref={external_ref}',
            )
        media_set_id = str(existing_id)
        logger.info(
            'Reusing existing MediaSet %s for ref=%s', media_set_id, external_ref
        )
    else:
        media_set_id = await client.create_media_set(
            title=external_ref,
            alt_text=alt_text,
            external_ref=external_ref,
            photographer_credit=photographer_credit,
            location_ref=location_ref,
        )
    variant_asset_ids = {}
    for variant_type in list(ImageVariantType):
        asset_id = await client.upload_image(
            variants[variant_type],
            alt_text,
            photographer_credit,
            media_set_id,
            location_ref=location_ref,
        )
        variant_asset_ids[variant_type.value] = asset_id
    return {'mediaSetId': media_set_id, 'variantAssetIds': variant_asset_ids}
