"""Payload client deletion operations."""

import logging

import httpx

from .payload_documents import PayloadUploadError, _parse_payload_error

logger = logging.getLogger("images.payload")


class _PayloadDeletion:

    async def delete_media_asset(self, asset_id: str) -> None:
        """Delete a media-asset by ID."""
        url = f'{self.api_url}/api/media-assets/{asset_id}'
        headers = self._get_headers()
        step = f'delete_media_asset({asset_id})'
        try:
            async with self._async_client(timeout=30.0) as client:
                response = await client.delete(url, headers=headers)
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
                message='Payload CMS request timed out (30s)',
                request_url=url,
                detail=str(e),
            )
        if response.status_code in {200, 202, 204, 404}:
            return
        body = response.text
        parsed = _parse_payload_error(body)
        raise PayloadUploadError(
            step=step,
            message='Failed to delete existing media-asset',
            status_code=response.status_code,
            response_body=body,
            request_url=url,
            detail=parsed,
        )

    async def delete_media_set(self, media_set_id: str) -> None:
        """Delete a media-set by ID. Treats an already-missing set as success."""
        url = f'{self.api_url}/api/media-sets/{media_set_id}'
        headers = self._get_headers()
        step = f'delete_media_set({media_set_id})'
        try:
            async with self._async_client(timeout=30.0) as client:
                response = await client.delete(url, headers=headers)
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
                message='Payload CMS request timed out (30s)',
                request_url=url,
                detail=str(e),
            )
        if response.status_code in {200, 202, 204, 404}:
            return
        body = response.text
        parsed = _parse_payload_error(body)
        raise PayloadUploadError(
            step=step,
            message='Failed to delete media-set',
            status_code=response.status_code,
            response_body=body,
            request_url=url,
            detail=parsed,
        )
