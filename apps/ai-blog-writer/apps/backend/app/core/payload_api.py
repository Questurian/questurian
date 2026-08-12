"""Shared Payload API endpoint resolution."""

import logging
import os

logger = logging.getLogger(__name__)

DEFAULT_PAYLOAD_API_URL = "http://localhost:4000"


def _running_in_docker() -> bool:
    """Return True when executing inside a Docker container."""
    return os.path.exists("/.dockerenv")


def resolve_payload_api_url() -> str:
    """Resolve Payload base URL for local and Dockerized backend runs."""
    configured_url = os.getenv("PAYLOAD_API_URL")
    if configured_url:
        return configured_url
    if _running_in_docker():
        logger.warning(
            "PAYLOAD_API_URL not set while running in Docker; defaulting to %s. "
            "Set PAYLOAD_API_URL explicitly if Payload is outside this container.",
            DEFAULT_PAYLOAD_API_URL,
        )
    return DEFAULT_PAYLOAD_API_URL
