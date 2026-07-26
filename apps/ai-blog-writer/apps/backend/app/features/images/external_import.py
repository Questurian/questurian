"""External provider policy and remote image downloads."""

import logging
import os
import re
from typing import Any, Dict, Optional
from urllib.parse import unquote, urlparse

import httpx

from .errors import _raise_http_error


logger = logging.getLogger("images.routes")

PEXELS_SEARCH_URL = "https://api.pexels.com/v1/search"
PEXELS_ALLOWED_ORIENTATIONS = {"landscape", "portrait", "square"}
UNSPLASH_SEARCH_URL = "https://api.unsplash.com/search/photos"
UNSPLASH_ALLOWED_ORIENTATIONS = {"landscape", "portrait", "square"}
EXTERNAL_IMPORT_ALLOWED_HOSTS = {
    "unsplash": ("images.unsplash.com",),
    "pexels": ("images.pexels.com",),
}
MAX_EXTERNAL_IMPORT_FILE_SIZE = 25 * 1024 * 1024


def _get_pexels_api_key() -> str:
    """Load and validate the Pexels API key from environment variables."""
    api_key = os.getenv('PEXELS_API_KEY', '').strip()
    if not api_key:
        _raise_http_error(
            status_code=500,
            message='PEXELS_API_KEY is not configured',
            step='validate_pexels_key',
            env_var='PEXELS_API_KEY',
        )
    return api_key


def _get_unsplash_access_key() -> str:
    """Load and validate the Unsplash access key from environment."""
    access_key = os.getenv('UNSPLASH_ACCESS_KEY', '').strip()
    if not access_key:
        _raise_http_error(
            status_code=500,
            message='UNSPLASH_ACCESS_KEY is not configured',
            step='validate_unsplash_key',
            env_var='UNSPLASH_ACCESS_KEY',
        )
    return access_key


def _validate_external_provider(provider: str) -> str:
    """Validate provider string used for external image imports."""
    normalized_provider = provider.strip().lower()
    if normalized_provider not in EXTERNAL_IMPORT_ALLOWED_HOSTS:
        _raise_http_error(
            status_code=400,
            message='provider must be unsplash or pexels',
            step='validate_external_provider',
            provider=provider,
        )
    return normalized_provider


def _is_allowed_external_host(hostname: str, allowed_hosts: tuple[str, ...]) -> bool:
    """Return True when host exactly matches or is a subdomain of allowed hosts."""
    normalized_host = hostname.strip().lower()
    for allowed in allowed_hosts:
        if normalized_host == allowed or normalized_host.endswith(f'.{allowed}'):
            return True
    return False


def _validate_external_source_url(source_url: str, provider: str) -> str:
    """Validate source URL for external image imports."""
    normalized_source_url = source_url.strip()
    if not normalized_source_url:
        _raise_http_error(
            status_code=400,
            message='source_url is required',
            step='validate_external_source_url',
        )
    parsed = urlparse(normalized_source_url)
    if parsed.scheme.lower() != 'https':
        _raise_http_error(
            status_code=400,
            message='source_url must use https',
            step='validate_external_source_url',
            source_url=normalized_source_url,
        )
    hostname = (parsed.hostname or '').strip().lower()
    if not hostname:
        _raise_http_error(
            status_code=400,
            message='source_url must include a hostname',
            step='validate_external_source_url',
            source_url=normalized_source_url,
        )
    allowed_hosts = EXTERNAL_IMPORT_ALLOWED_HOSTS[provider]
    if not _is_allowed_external_host(hostname, allowed_hosts):
        _raise_http_error(
            status_code=400,
            message='source_url host is not allowed for provider',
            step='validate_external_source_url',
            source_url=normalized_source_url,
            hostname=hostname,
            provider=provider,
            allowed_hosts=list(allowed_hosts),
        )
    return normalized_source_url


def _derive_external_filename(
    source_url: str, provider: str, photo_id: Optional[str]
) -> str:
    """Build a stable filename used for generated variants."""
    parsed = urlparse(source_url)
    candidate = unquote(parsed.path.split('/')[-1]).strip()
    if candidate and '.' in candidate:
        sanitized = re.sub('[^A-Za-z0-9._-]+', '-', candidate).strip('-')
        if sanitized:
            return sanitized
    fallback_seed = (photo_id or '').strip() or 'external-image'
    fallback_seed = re.sub('[^A-Za-z0-9_-]+', '-', fallback_seed).strip('-')
    if not fallback_seed:
        fallback_seed = 'external-image'
    return f'{provider}-{fallback_seed}.jpg'


async def _download_external_image(source_url: str, provider: str) -> Dict[str, Any]:
    """Download and validate an external image before variant processing."""
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            response = await client.get(
                source_url,
                headers={
                    'User-Agent': 'QuesturianStageImporter/1.0',
                    'Accept': 'image/*,*/*;q=0.8',
                },
            )
    except httpx.RequestError as exc:
        logger.exception(
            'External image download failed | provider=%s source_url=%s',
            provider,
            source_url,
        )
        _raise_http_error(
            status_code=502,
            message='Failed to download external image',
            step='download_external_image',
            provider=provider,
            source_url=source_url,
            detail=str(exc),
        )
    if response.status_code >= 400:
        _raise_http_error(
            status_code=502,
            message='External image provider returned an error',
            step='download_external_image',
            provider=provider,
            source_url=source_url,
            provider_status_code=response.status_code,
        )
    content_type = (
        response.headers.get('content-type', '').split(';')[0].strip().lower()
    )
    if not content_type.startswith('image/'):
        _raise_http_error(
            status_code=400,
            message='source_url did not return an image',
            step='download_external_image',
            provider=provider,
            source_url=source_url,
            content_type=content_type or None,
        )
    content = response.content
    if not content:
        _raise_http_error(
            status_code=400,
            message='Downloaded external image is empty',
            step='download_external_image',
            provider=provider,
            source_url=source_url,
        )
    if len(content) > MAX_EXTERNAL_IMPORT_FILE_SIZE:
        _raise_http_error(
            status_code=400,
            message='External image is too large',
            step='download_external_image',
            provider=provider,
            source_url=source_url,
            size_bytes=len(content),
            max_size_bytes=MAX_EXTERNAL_IMPORT_FILE_SIZE,
        )
    return {
        'content': content,
        'content_type': content_type,
        'size_bytes': len(content),
    }
