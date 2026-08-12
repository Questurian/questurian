"""Compatibility facade for shared Payload API endpoint resolution."""

from app.core.payload_api import (  # noqa: F401
    DEFAULT_PAYLOAD_API_URL,
    _running_in_docker,
    resolve_payload_api_url,
)


def _resolve_payload_api_url() -> str:
    return resolve_payload_api_url()
