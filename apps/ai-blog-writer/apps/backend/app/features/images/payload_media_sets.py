"""Payload client media sets operations."""

import json
import logging
from typing import Optional

import httpx

from .payload_documents import PayloadUploadError, _parse_payload_error

logger = logging.getLogger("images.payload")


class _PayloadMediaSets:

    async def create_media_set(
        self,
        title: str,
        alt_text: str,
        external_ref: str,
        photographer_credit: str = '',
        location_ref: Optional[int] = None,
        tags: Optional[list] = None,
    ) -> str:
        """Create a MediaSet in Payload CMS."""
        url = f'{self.api_url}/api/media-sets'
        headers = {**self._get_headers(), 'Content-Type': 'application/json'}
        step = 'create_media_set'
        payload = {'title': title, 'alt_text': alt_text, 'externalRef': external_ref}
        if photographer_credit.strip():
            payload['photographer_credit'] = photographer_credit.strip()
        if location_ref is not None:
            payload['locationRef'] = location_ref
        if tags:
            payload['tags'] = tags
        logger.info('%s → %s | payload=%s', step, url, json.dumps(payload))
        try:
            async with self._async_client(timeout=30.0) as client:
                response = await client.post(url, headers=headers, json=payload)
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
        body = response.text
        logger.info('%s ← HTTP %d | body=%s', step, response.status_code, body[:300])
        if response.status_code == 401:
            raise PayloadUploadError(
                step=step,
                message='Authentication failed',
                status_code=401,
                response_body=body,
                request_url=url,
                detail='JWT token may be expired or invalid.',
            )
        if response.status_code >= 400:
            parsed = _parse_payload_error(body)
            raise PayloadUploadError(
                step=step,
                message='Failed to create MediaSet',
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
        media_set_id = result.get('doc', {}).get('id')
        if not media_set_id:
            raise PayloadUploadError(
                step=step,
                message='Payload returned success but no MediaSet ID',
                status_code=response.status_code,
                response_body=body[:500],
                request_url=url,
            )
        logger.info('%s ✓ mediaSetId=%s', step, media_set_id)
        return str(media_set_id)

    async def get_media_set_by_id(
        self, media_set_id: str | int, depth: int = 2
    ) -> Optional[dict]:
        """Fetch one media-set by ID."""
        url = f'{self.api_url}/api/media-sets/{media_set_id}'
        headers = self._get_headers()
        step = 'get_media_set_by_id'
        params = {'depth': depth}
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
        if response.status_code == 404:
            return None
        if response.status_code >= 400:
            body = response.text
            parsed = _parse_payload_error(body)
            raise PayloadUploadError(
                step=step,
                message='Failed to fetch media-set by id',
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
                message='Payload returned invalid JSON while fetching media-set',
                status_code=response.status_code,
                response_body=body,
                request_url=url,
            )
        if isinstance(result, dict) and isinstance(result.get('doc'), dict):
            return result['doc']
        if isinstance(result, dict) and result.get('id') is not None:
            return result
        return None

    async def find_media_sets_by_external_ref_prefix(
        self, prefix: str, depth: int = 0
    ) -> list[dict]:
        """List every MediaSet whose externalRef contains ``prefix`` (paginated)."""
        url = f'{self.api_url}/api/media-sets'
        headers = self._get_headers()
        step = 'find_media_sets_by_prefix'
        page = 1
        total_pages = 1
        docs: list[dict] = []
        while page <= total_pages:
            params = {
                'where[externalRef][like]': prefix,
                'limit': 100,
                'page': page,
                'depth': depth,
            }
            try:
                async with self._async_client(timeout=30.0) as client:
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
                    message='Payload CMS request timed out (30s)',
                    request_url=url,
                    detail=str(e),
                )
            if response.status_code >= 400:
                body = response.text
                parsed = _parse_payload_error(body)
                raise PayloadUploadError(
                    step=step,
                    message='Failed to query MediaSets by prefix',
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
                    message='Payload returned invalid JSON while querying MediaSets',
                    status_code=response.status_code,
                    response_body=body,
                    request_url=url,
                )
            for doc in result.get('docs', []):
                if isinstance(doc, dict):
                    docs.append(doc)
            raw_total = result.get('totalPages', 1)
            total_pages = (
                raw_total if isinstance(raw_total, int) and raw_total > 0 else 1
            )
            page += 1
        return docs

    async def find_media_set_by_external_ref(self, external_ref: str) -> Optional[dict]:
        """Find a MediaSet by its external reference."""
        url = f'{self.api_url}/api/media-sets'
        headers = self._get_headers()
        params = {'where[externalRef][equals]': external_ref, 'limit': 1}
        try:
            async with self._async_client(timeout=15.0) as client:
                response = await client.get(url, headers=headers, params=params)
        except httpx.ConnectError as e:
            raise PayloadUploadError(
                step='find_media_set',
                message='Cannot connect to Payload CMS',
                request_url=url,
                detail=f'Is Payload running at {self.api_url}? ({e})',
            )
        except httpx.TimeoutException:
            raise PayloadUploadError(
                step='find_media_set',
                message='Payload CMS request timed out (15s)',
                request_url=url,
            )
        if response.status_code >= 400:
            body = response.text
            parsed = _parse_payload_error(body)
            raise PayloadUploadError(
                step='find_media_set',
                message='Failed to query MediaSets',
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
                step='find_media_set',
                message='Payload returned invalid JSON while querying MediaSets',
                status_code=response.status_code,
                response_body=body,
                request_url=url,
            )
        docs = result.get('docs', [])
        found = docs[0] if docs else None
        logger.info(
            'find_media_set(ref=%s) → %s',
            external_ref,
            found.get('id') if found else 'not found',
        )
        return found
