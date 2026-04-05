"""HTTP/TLS helpers for outbound requests."""

from __future__ import annotations

import logging
import os
import subprocess
import sys
import tempfile
from functools import lru_cache
from pathlib import Path

logger = logging.getLogger(__name__)

MACOS_CA_BUNDLE_PATH_ENV = "QUESTURIAN_MACOS_CA_BUNDLE_PATH"
DISABLE_MACOS_KEYCHAIN_CA_ENV = "QUESTURIAN_DISABLE_MACOS_KEYCHAIN_CA"
EXPLICIT_CA_BUNDLE_ENV_VARS = (
    "SSL_CERT_FILE",
    "REQUESTS_CA_BUNDLE",
    "CURL_CA_BUNDLE",
)


def _env_truthy(key: str) -> bool:
    raw = os.getenv(key)
    if raw is None:
        return False
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _resolve_macos_ca_bundle_path() -> Path:
    configured = os.getenv(MACOS_CA_BUNDLE_PATH_ENV, "").strip()
    if configured:
        return Path(configured)
    return Path(tempfile.gettempdir()) / "questurian-macos-system-certs.pem"


@lru_cache(maxsize=1)
def resolve_httpx_verify() -> str | bool:
    """Return the CA bundle path or verify flag for outbound HTTP clients."""
    for env_key in EXPLICIT_CA_BUNDLE_ENV_VARS:
        configured = os.getenv(env_key, "").strip()
        if configured:
            return configured

    if sys.platform != "darwin" or _env_truthy(DISABLE_MACOS_KEYCHAIN_CA_ENV):
        return True

    bundle_path = _resolve_macos_ca_bundle_path()
    try:
        if not bundle_path.exists() or bundle_path.stat().st_size == 0:
            bundle_path.parent.mkdir(parents=True, exist_ok=True)
            result = subprocess.run(
                [
                    "security",
                    "find-certificate",
                    "-a",
                    "-p",
                    "/Library/Keychains/System.keychain",
                    "/System/Library/Keychains/SystemRootCertificates.keychain",
                ],
                capture_output=True,
                check=True,
                text=True,
            )
            bundle_path.write_text(result.stdout, encoding="utf-8")
        return str(bundle_path)
    except Exception:  # noqa: BLE001
        logger.warning(
            "Failed to resolve macOS system CA bundle for outbound HTTP; falling back to default verification",
            exc_info=True,
        )
        return True
