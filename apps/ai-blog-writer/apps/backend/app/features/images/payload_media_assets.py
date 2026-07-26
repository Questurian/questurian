"""Payload client media assets operations."""

import json
import logging
from typing import Any, Optional

import httpx

from .payload_documents import (
    PayloadMediaAssetDoc,
    PayloadUploadError,
    _parse_media_asset_doc,
    _parse_payload_error,
)

logger = logging.getLogger("images.payload")


class _PayloadMediaAssets:

    async def get_media_asset_by_id(
        self, asset_id: str | int
    ) -> Optional[PayloadMediaAssetDoc]:
        """Fetch one media-asset by ID."""
        url = f'{self.api_url}/api/media-assets/{asset_id}'
        headers = self._get_headers()
        step = 'get_media_asset_by_id'
        try:
            async with self._async_client(timeout=15.0) as client:
                response = await client.get(url, headers=headers)
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
                message='Payload CMS request timed out (15s)',
                request_url=url,
                detail=str(e),
            )
        if response.status_code == 404:
            return None
        if response.status_code >= 400:
            body = response.text
            parsed = _parse_payload_error(body)
            raise PayloadUploadError(
                step=step,
                message='Failed to fetch media-asset by id',
                status_code=response.status_code,
                response_body=body,
                request_url=url,
                detail=parsed,
            )
        try:
            result = response.json()
        except json.JSONDecodeError:
            body = response.text
            raise PayloadUploadError(
                step=step,
                message='Payload returned invalid JSON while fetching media-asset',
                status_code=response.status_code,
                response_body=body,
                request_url=url,
            )
        doc: Any = None
        if isinstance(result, dict):
            if isinstance(result.get('doc'), dict):
                doc = result.get('doc')
            elif result.get('id') is not None and result.get('filename') is not None:
                doc = result
        if doc is None:
            query_url = f'{self.api_url}/api/media-assets'
            query_params = {'where[id][equals]': str(asset_id), 'limit': 1, 'depth': 0}
            try:
                async with self._async_client(timeout=15.0) as client:
                    query_response = await client.get(
                        query_url, headers=headers, params=query_params
                    )
            except httpx.ConnectError as e:
                raise PayloadUploadError(
                    step=step,
                    message='Cannot connect to Payload CMS',
                    request_url=query_url,
                    detail=f'Is Payload running at {self.api_url}? ({e})',
                )
            except httpx.TimeoutException as e:
                raise PayloadUploadError(
                    step=step,
                    message='Payload CMS request timed out (15s)',
                    request_url=query_url,
                    detail=str(e),
                )
            if query_response.status_code >= 400:
                body = query_response.text
                parsed = _parse_payload_error(body)
                raise PayloadUploadError(
                    step=step,
                    message='Failed to query media-asset by id fallback',
                    status_code=query_response.status_code,
                    response_body=body,
                    request_url=query_url,
                    detail=parsed,
                )
            try:
                query_result = query_response.json()
            except json.JSONDecodeError:
                body = query_response.text
                raise PayloadUploadError(
                    step=step,
                    message='Payload returned invalid JSON while querying media-asset fallback',
                    status_code=query_response.status_code,
                    response_body=body,
                    request_url=query_url,
                )
            docs = (
                query_result.get('docs', []) if isinstance(query_result, dict) else []
            )
            if isinstance(docs, list) and docs:
                first_doc = docs[0]
                return _parse_media_asset_doc(first_doc)
            return None
        return _parse_media_asset_doc(doc)

    async def list_media_assets_by_media_set(
        self, media_set_id: str | int
    ) -> list[PayloadMediaAssetDoc]:
        """List all media-assets linked to a media set."""
        url = f'{self.api_url}/api/media-assets'
        headers = self._get_headers()
        step = 'list_media_assets_by_media_set'
        page = 1
        docs: list[PayloadMediaAssetDoc] = []
        total_pages = 1
        while page <= total_pages:
            params = {
                'where[mediaSet][equals]': str(media_set_id),
                'limit': 100,
                'page': page,
            }
            try:
                async with self._async_client(timeout=15.0) as client:
                    response = await client.get(url, headers=headers, params=params)
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
                    message='Payload CMS request timed out (15s)',
                    request_url=url,
                    detail=str(e),
                )
            if response.status_code >= 400:
                body = response.text
                parsed = _parse_payload_error(body)
                raise PayloadUploadError(
                    step=step,
                    message='Failed to list media-assets by media set',
                    status_code=response.status_code,
                    response_body=body,
                    request_url=url,
                    detail=parsed,
                )
            try:
                result = response.json()
            except json.JSONDecodeError:
                body = response.text
                raise PayloadUploadError(
                    step=step,
                    message='Payload returned invalid JSON while listing media-assets',
                    status_code=response.status_code,
                    response_body=body,
                    request_url=url,
                )
            raw_docs = result.get('docs', [])
            if isinstance(raw_docs, list):
                docs.extend((_parse_media_asset_doc(raw_doc) for raw_doc in raw_docs))
            total_pages_raw = result.get('totalPages', 1)
            total_pages = (
                total_pages_raw
                if isinstance(total_pages_raw, int) and total_pages_raw > 0
                else 1
            )
            page += 1
        return docs

    async def find_media_asset_by_variant(
        self, media_set_id: str, variant: str
    ) -> Optional[dict]:
        """Find an existing media-asset by mediaSet and variant."""
        url = f'{self.api_url}/api/media-assets'
        headers = self._get_headers()
        step = f'find_media_asset({variant})'
        params = {
            'where[mediaSet][equals]': media_set_id,
            'where[variant][equals]': variant,
            'limit': 1,
        }
        try:
            async with self._async_client(timeout=15.0) as client:
                response = await client.get(url, headers=headers, params=params)
        except httpx.ConnectError as e:
            raise PayloadUploadError(
                step=step,
                message='Cannot connect to Payload CMS',
                request_url=url,
                detail=f'Is Payload running at {self.api_url}? ({e})',
            )
        except httpx.TimeoutException:
            raise PayloadUploadError(
                step=step,
                message='Payload CMS request timed out (15s)',
                request_url=url,
            )
        if response.status_code >= 400:
            body = response.text
            parsed = _parse_payload_error(body)
            raise PayloadUploadError(
                step=step,
                message='Failed to query media-assets',
                status_code=response.status_code,
                response_body=body,
                request_url=url,
                detail=parsed,
            )
        try:
            result = response.json()
        except json.JSONDecodeError:
            body = response.text
            raise PayloadUploadError(
                step=step,
                message='Payload returned invalid JSON while querying media-assets',
                status_code=response.status_code,
                response_body=body,
                request_url=url,
            )
        docs = result.get('docs', [])
        found = docs[0] if docs else None
        logger.info(
            '%s(media_set_id=%s) → %s',
            step,
            media_set_id,
            found.get('id') if found else 'not found',
        )
        return found

    async def detach_media_asset_from_media_set(
        self, asset_id: str, media_set_id: str | int, variant: str
    ) -> bool:
        """Clear mediaSet/variant on a stale asset without deleting its storage file."""
        current_asset = await self.get_media_asset_by_id(asset_id)
        if current_asset is None:
            return False
        if (
            str(current_asset.get('mediaSet')) != str(media_set_id)
            or current_asset.get('variant') != variant
        ):
            logger.warning(
                'detach_media_asset(%s) skipped; expected mediaSet=%s variant=%s, got mediaSet=%s variant=%s',
                asset_id,
                media_set_id,
                variant,
                current_asset.get('mediaSet'),
                current_asset.get('variant'),
            )
            return False
        url = f'{self.api_url}/api/media-assets/{asset_id}'
        headers = {**self._get_headers(), 'Content-Type': 'application/json'}
        step = f'detach_media_asset({asset_id})'
        try:
            async with self._async_client(timeout=30.0) as client:
                response = await client.patch(
                    url, headers=headers, json={'mediaSet': None, 'variant': None}
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
                message='Payload CMS request timed out (30s)',
                request_url=url,
                detail=str(e),
            )
        if response.status_code == 404:
            return False
        if response.status_code >= 400:
            body = response.text
            parsed = _parse_payload_error(body)
            raise PayloadUploadError(
                step=step,
                message='Failed to detach stale media-asset from MediaSet',
                status_code=response.status_code,
                response_body=body,
                request_url=url,
                detail=parsed,
            )
        return True
