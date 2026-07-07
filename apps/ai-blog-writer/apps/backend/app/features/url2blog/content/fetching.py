"""Tiered article fetching for URL2Blog.

Escalates through three tiers until one yields usable article text:

1. direct   — plain httpx with realistic desktop-Chrome headers
2. proxy    — same request through an IPRoyal residential proxy
              (skipped when IPROYAL_* env vars are absent)
3. rendered — POST to a headless-browser fetch service that executes JS
              (skipped when URL2BLOG_RENDERED_FETCH_URL is absent)

A tier "fails" on network error, block-page status, challenge markers in
the visible text, or too little extracted text (JS-rendered shells).
"""

import logging
import os
import secrets
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import quote

import httpx

from app.core import resolve_httpx_verify

from .text_cleanup import extract_article_text

logger = logging.getLogger(__name__)

DIRECT_TIMEOUT_SECONDS = 30.0
RENDERED_TIMEOUT_SECONDS = 120.0
MIN_ARTICLE_TEXT_CHARS = 50
PROXY_SESSION_LIFETIME_MINUTES = 10

RENDERED_FETCH_URL_ENV = "URL2BLOG_RENDERED_FETCH_URL"

# Full desktop-Chrome header set. The previous UA
# ("Mozilla/5.0 (compatible; Questurian/1.0)") self-identified as a bot
# and was rejected outright by Cloudflare/Akamai/DataDome fronts.
BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "image/avif,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
}

BLOCK_STATUS_CODES = {401, 403, 407, 429, 503}

# Only checked against short pages (real articles can legitimately mention
# "captcha"); a challenge interstitial has very little visible text.
CHALLENGE_MARKERS = (
    "just a moment",
    "please enable js",
    "enable javascript",
    "verify you are human",
    "are you a robot",
    "access denied",
    "attention required",
    "captcha",
    "datadome",
)
CHALLENGE_TEXT_MAX_CHARS = 2_000


class ArticleFetchError(Exception):
    """All fetch tiers failed; `attempts` records each tier's outcome."""

    def __init__(self, url: str, attempts: list[dict[str, Any]]):
        self.url = url
        self.attempts = attempts
        summary = "; ".join(
            f"{a['tier']}: {a.get('error') or a.get('skip_reason')}" for a in attempts
        )
        super().__init__(f"All fetch tiers failed for {url} ({summary})")


@dataclass
class FetchOutcome:
    html: str
    text: str
    tier: str
    attempts: list[dict[str, Any]] = field(default_factory=list)


def _residential_proxy_url() -> str | None:
    """Build an IPRoyal proxy URL with a fresh sticky session, or None."""
    host = os.getenv("IPROYAL_HOST")
    port = os.getenv("IPROYAL_PORT")
    user = os.getenv("IPROYAL_USER")
    password = os.getenv("IPROYAL_PASS")
    if not all((host, port, user, password)):
        return None
    country = os.getenv("PROXY_COUNTRY", "us")
    session_id = secrets.token_hex(5)
    full_password = (
        f"{password}_country-{country}_session-{session_id}"
        f"_lifetime-{PROXY_SESSION_LIFETIME_MINUTES}m"
    )
    return f"http://{quote(user, safe='')}:{quote(full_password, safe='')}@{host}:{port}"


def _rendered_fetch_url() -> str | None:
    return os.getenv(RENDERED_FETCH_URL_ENV) or None


def _rejection_reason(status: int, text: str) -> str | None:
    """Return why a response is unusable as article content, or None if OK."""
    if status in BLOCK_STATUS_CODES:
        return f"blocked (HTTP {status})"
    if status >= 400:
        return f"HTTP {status}"
    if len(text) < MIN_ARTICLE_TEXT_CHARS:
        return f"too little text ({len(text)} chars); likely JS-rendered or empty"
    if len(text) <= CHALLENGE_TEXT_MAX_CHARS:
        lowered = text.lower()
        for marker in CHALLENGE_MARKERS:
            if marker in lowered:
                return f"challenge page (matched {marker!r})"
    return None


async def _httpx_get(url: str, proxy: str | None) -> tuple[int, str]:
    async with httpx.AsyncClient(
        follow_redirects=True,
        timeout=DIRECT_TIMEOUT_SECONDS,
        verify=resolve_httpx_verify(),
        headers=BROWSER_HEADERS,
        proxy=proxy,
    ) as client:
        resp = await client.get(url)
        return resp.status_code, resp.text


async def _rendered_get(url: str, service_url: str) -> tuple[int, str]:
    """Fetch fully rendered HTML from the browser-fetch service."""
    async with httpx.AsyncClient(
        timeout=RENDERED_TIMEOUT_SECONDS,
        verify=resolve_httpx_verify(),
    ) as client:
        resp = await client.post(service_url, json={"url": url})
        resp.raise_for_status()
        payload = resp.json()
    data = payload.get("data") or payload
    html = data.get("html") or ""
    status = int(data.get("status") or 200)
    return status, html


async def fetch_article_html(url: str) -> FetchOutcome:
    """Fetch `url` through the tier ladder; raise ArticleFetchError if all fail."""
    attempts: list[dict[str, Any]] = []
    proxy = _residential_proxy_url()
    rendered = _rendered_fetch_url()

    tiers: list[tuple[str, Any, str | None]] = [
        ("direct", lambda: _httpx_get(url, None), None),
        (
            "proxy",
            lambda: _httpx_get(url, proxy),
            None if proxy else "IPROYAL_* env vars not configured",
        ),
        (
            "rendered",
            lambda: _rendered_get(url, rendered or ""),
            None if rendered else f"{RENDERED_FETCH_URL_ENV} not configured",
        ),
    ]

    for tier, fetcher, skip_reason in tiers:
        if skip_reason:
            attempts.append({"tier": tier, "skipped": True, "skip_reason": skip_reason})
            logger.info("URL2Blog fetch: skipping tier %s (%s)", tier, skip_reason)
            continue
        try:
            status, html = await fetcher()
        except httpx.HTTPError as exc:
            attempts.append({"tier": tier, "error": f"request failed: {exc}"})
            logger.warning("URL2Blog fetch: tier %s failed for %s: %s", tier, url, exc)
            continue

        text = extract_article_text(html)
        reason = _rejection_reason(status, text)
        if reason is None:
            attempts.append({"tier": tier, "ok": True, "status": status})
            logger.info("URL2Blog fetch: tier %s succeeded for %s", tier, url)
            return FetchOutcome(html=html, text=text, tier=tier, attempts=attempts)

        attempts.append({"tier": tier, "error": reason, "status": status})
        logger.warning("URL2Blog fetch: tier %s rejected for %s: %s", tier, url, reason)

    raise ArticleFetchError(url, attempts)


__all__ = [
    "ArticleFetchError",
    "FetchOutcome",
    "fetch_article_html",
]
