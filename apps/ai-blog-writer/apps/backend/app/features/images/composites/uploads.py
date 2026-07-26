"""Composite upload retry and rollback workflows."""

from typing import Optional

from ..image_processor import ProcessedVariant
from ..payload_client import PayloadClient, PayloadUploadError
from ..shared import _status_from_payload_error, logger


_TRANSIENT_STATUS = {502, 503, 504}


async def _upload_variant_with_retry_impl(
    *,
    client: PayloadClient,
    variant: ProcessedVariant,
    alt_text: str,
    photographer_credit: str,
    media_set_id: str,
    location_ref: Optional[int],
    attempts: int = 3,
    sleep,
) -> str:
    """Upload one composite variant, retrying transient CDN/gateway failures.

    ``upload_image`` is idempotent per (mediaSet, variant) — it replaces any
    asset already present — so re-running after a transient failure is safe.
    """
    last_error: Optional[PayloadUploadError] = None
    for attempt in range(attempts):
        try:
            return await client.upload_image(
                variant,
                alt_text=alt_text,
                photographer_credit=photographer_credit,
                media_set_id=media_set_id,
                location_ref=location_ref,
            )
        except PayloadUploadError as exc:
            if (
                _status_from_payload_error(exc) not in _TRANSIENT_STATUS
                or attempt == attempts - 1
            ):
                raise
            last_error = exc
            backoff = 0.5 * 2**attempt
            logger.warning(
                'Composite variant %s upload hit transient error (attempt %d/%d); retrying in %.1fs: %s',
                variant.variant_type.value,
                attempt + 1,
                attempts,
                backoff,
                exc,
            )
            await sleep(backoff)
    raise (
        last_error
        if last_error
        else PayloadUploadError(
            step='upload_variant_with_retry', message='Variant upload retry exhausted'
        )
    )


async def _rollback_partial_composite(
    *, client: PayloadClient, media_set_id: Optional[str], uploaded_asset_ids: list[str]
) -> None:
    """Best-effort cleanup after a failed composite create.

    Removes any variant assets that were already uploaded and the MediaSet
    itself so a partial failure never leaves orphaned ("hanging") images.
    Cleanup errors are swallowed and logged — the original failure is what
    gets surfaced to the caller.
    """
    for asset_id in uploaded_asset_ids:
        try:
            await client.delete_media_asset(asset_id)
        except PayloadUploadError:
            logger.warning(
                'Composite rollback could not delete asset_id=%s',
                asset_id,
                exc_info=True,
            )
    if media_set_id is not None:
        try:
            await client.delete_media_set(media_set_id)
        except PayloadUploadError:
            logger.warning(
                'Composite rollback could not delete media_set_id=%s',
                media_set_id,
                exc_info=True,
            )
