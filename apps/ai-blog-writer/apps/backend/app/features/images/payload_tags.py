"""Payload client tags operations."""

import logging

import httpx

from .payload_documents import PayloadUploadError, _parse_payload_error

logger = logging.getLogger("images.payload")


class _PayloadTags:

    async def find_or_create_tag(self, name: str) -> int:
        """Find a tag by name in Payload, creating it if it doesn't exist. Returns tag ID."""
        url = f'{self.api_url}/api/article-tags'
        headers = self._get_headers()
        step = f'find_or_create_tag({name!r})'
        params = {'where[name][equals]': name, 'limit': 1}
        try:
            async with self._async_client(timeout=15.0) as client:
                response = await client.get(url, headers=headers, params=params)
        except httpx.ConnectError as e:
            raise PayloadUploadError(
                step=step,
                message='Cannot connect to Payload CMS',
                request_url=url,
                detail=str(e),
            )
        except httpx.TimeoutException:
            raise PayloadUploadError(
                step=step, message='Payload CMS request timed out', request_url=url
            )
        if response.status_code >= 400:
            raise PayloadUploadError(
                step=step,
                message='Failed to search tags',
                status_code=response.status_code,
                response_body=response.text,
                request_url=url,
            )
        docs = response.json().get('docs', [])
        if docs:
            tag_id = docs[0].get('id')
            logger.info('%s → found existing tag id=%s', step, tag_id)
            return int(tag_id)
        json_headers = {**headers, 'Content-Type': 'application/json'}
        try:
            async with self._async_client(timeout=15.0) as client:
                response = await client.post(
                    url, headers=json_headers, json={'name': name}
                )
        except httpx.ConnectError as e:
            raise PayloadUploadError(
                step=step,
                message='Cannot connect to Payload CMS',
                request_url=url,
                detail=str(e),
            )
        except httpx.TimeoutException:
            raise PayloadUploadError(
                step=step, message='Payload CMS request timed out', request_url=url
            )
        if response.status_code >= 400:
            parsed = _parse_payload_error(response.text)
            raise PayloadUploadError(
                step=step,
                message='Failed to create tag',
                status_code=response.status_code,
                response_body=response.text,
                request_url=url,
                detail=parsed,
            )
        tag_id = response.json().get('doc', {}).get('id')
        if not tag_id:
            raise PayloadUploadError(
                step=step,
                message='Tag created but no ID returned',
                response_body=response.text,
                request_url=url,
            )
        logger.info('%s → created new tag id=%s', step, tag_id)
        return int(tag_id)
