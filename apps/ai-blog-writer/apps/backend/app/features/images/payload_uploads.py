"""Payload client uploads operations."""

import json
import logging
from typing import Optional

import httpx

from .image_processor import ProcessedVariant
from .payload_documents import (
    PayloadUploadError,
    _is_missing_storage_file_delete_error,
    _is_variant_conflict_error,
    _parse_payload_error,
)

logger = logging.getLogger("images.payload")


class _PayloadUploads:

    async def upload_image(
        self,
        variant: ProcessedVariant,
        alt_text: str,
        photographer_credit: str = '',
        media_set_id: Optional[str] = None,
        location_ref: Optional[int] = None,
        tags: Optional[list] = None,
    ) -> str:
        """Upload a single image variant to Payload CMS media-assets."""
        url = f'{self.api_url}/api/media-assets'
        headers = self._get_headers()
        step = f'upload_image({variant.variant_type.value})'
        files = {'file': (variant.filename, variant.buffer, variant.content_type)}
        media_set_value: Optional[str | int] = media_set_id
        if isinstance(media_set_value, str) and media_set_value.isdigit():
            media_set_value = int(media_set_value)
        if media_set_id is not None:
            existing_asset = await self.find_media_asset_by_variant(
                media_set_id=media_set_id, variant=variant.variant_type.value
            )
            existing_asset_id = existing_asset.get('id') if existing_asset else None
            if existing_asset_id:
                replacement_action = 'deleted'
                try:
                    await self.delete_media_asset(str(existing_asset_id))
                except PayloadUploadError as exc:
                    if not _is_missing_storage_file_delete_error(exc):
                        raise
                    detached = await self.detach_media_asset_from_media_set(
                        asset_id=str(existing_asset_id),
                        media_set_id=media_set_id,
                        variant=variant.variant_type.value,
                    )
                    logger.warning(
                        '%s stale variant asset_id=%s delete failed because storage file is missing; detached=%s before upload',
                        step,
                        existing_asset_id,
                        detached,
                    )
                    replacement_action = (
                        'detached stale' if detached else 'skipped stale'
                    )
                logger.info(
                    '%s ↻ existing variant found for media_set_id=%s; %s asset_id=%s before upload',
                    step,
                    media_set_id,
                    replacement_action,
                    existing_asset_id,
                )
        for attempt in range(3):
            payload_obj = {
                'alt_text': alt_text,
                'photographer_credit': photographer_credit.strip(),
                'variant': variant.variant_type.value,
            }
            if media_set_value is not None:
                payload_obj['mediaSet'] = media_set_value
            if location_ref is not None:
                payload_obj['locationRef'] = location_ref
            if tags:
                payload_obj['tags'] = tags
            payload_json = json.dumps(payload_obj)
            data = {'_payload': payload_json}
            logger.info(
                '%s → %s | attempt=%d | file=%s (%d bytes, %s) | _payload=%s',
                step,
                url,
                attempt + 1,
                variant.filename,
                len(variant.buffer),
                variant.content_type,
                payload_json,
            )
            try:
                async with self._async_client(timeout=60.0) as client:
                    response = await client.post(
                        url, headers=headers, files=files, data=data
                    )
            except httpx.ConnectError as e:
                raise PayloadUploadError(
                    step=step,
                    message='Cannot connect to Payload CMS',
                    request_url=url,
                    detail=f'Is Payload running at {self.api_url}? ({e})',
                )
            except httpx.TimeoutException as e:
                raise PayloadUploadError(
                    step=step,
                    message='Payload CMS request timed out (60s)',
                    request_url=url,
                    detail=str(e),
                )
            body = response.text
            logger.info(
                '%s ← HTTP %d | body=%s', step, response.status_code, body[:300]
            )
            if response.status_code == 401:
                raise PayloadUploadError(
                    step=step,
                    message='Authentication failed',
                    status_code=401,
                    response_body=body,
                    request_url=url,
                    detail='JWT token may be expired or invalid. Try logging in again.',
                )
            if response.status_code >= 400:
                parsed = _parse_payload_error(body)
                can_overwrite_retry = (
                    attempt == 0
                    and media_set_id is not None
                    and _is_variant_conflict_error(parsed, variant.variant_type.value)
                )
                should_probe_existing_variant = (
                    attempt == 0
                    and media_set_id is not None
                    and (response.status_code >= 500)
                )
                if can_overwrite_retry:
                    existing_asset = await self.find_media_asset_by_variant(
                        media_set_id=media_set_id, variant=variant.variant_type.value
                    )
                    existing_asset_id = (
                        existing_asset.get('id') if existing_asset else None
                    )
                    if not existing_asset_id:
                        raise PayloadUploadError(
                            step=step,
                            message='Variant conflict detected but no existing asset found',
                            status_code=response.status_code,
                            response_body=body,
                            request_url=url,
                            detail=parsed,
                        )
                    logger.warning(
                        '%s duplicate variant found after upload race; reusing existing asset_id=%s',
                        step,
                        existing_asset_id,
                    )
                    return str(existing_asset_id)
                if should_probe_existing_variant:
                    existing_asset = await self.find_media_asset_by_variant(
                        media_set_id=media_set_id, variant=variant.variant_type.value
                    )
                    existing_asset_id = (
                        existing_asset.get('id') if existing_asset else None
                    )
                    if existing_asset_id:
                        logger.warning(
                            '%s received HTTP %d with generic payload error; existing %s variant asset_id=%s found, reusing existing asset',
                            step,
                            response.status_code,
                            variant.variant_type.value,
                            existing_asset_id,
                        )
                        return str(existing_asset_id)
                raise PayloadUploadError(
                    step=step,
                    message='Payload rejected the upload',
                    status_code=response.status_code,
                    response_body=body,
                    request_url=url,
                    detail=parsed,
                )
            try:
                result = response.json()
            except json.JSONDecodeError:
                raise PayloadUploadError(
                    step=step,
                    message='Payload returned invalid JSON',
                    status_code=response.status_code,
                    response_body=body,
                    request_url=url,
                )
            asset_id = result.get('doc', {}).get('id')
            if not asset_id:
                raise PayloadUploadError(
                    step=step,
                    message='Payload returned success but no asset ID in response',
                    status_code=response.status_code,
                    response_body=body[:500],
                    request_url=url,
                    detail=f'Response keys: {list(result.keys())}',
                )
            logger.info('%s ✓ asset_id=%s', step, asset_id)
            return str(asset_id)
        raise PayloadUploadError(
            step=step,
            message='Upload retry exhausted',
            request_url=url,
            detail='Retry limit reached while handling upload retries.',
        )
