"""
YouTube source parsing and metadata helpers for youtube2blog.
"""
from __future__ import annotations

from dataclasses import dataclass
import re
from urllib.parse import parse_qs, urlparse

import httpx

VIDEO_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{6,}$")

VIDEO_PATH_PREFIXES = {"watch", "shorts", "live", "embed", "v"}
NON_VIDEO_PATH_PREFIXES = {
    "channel",
    "c",
    "user",
    "playlist",
    "results",
    "feed",
}


@dataclass(frozen=True)
class YouTubeVideoSource:
    video_id: str
    canonical_url: str


def _normalize_host(host: str) -> str:
    normalized = host.lower()
    if normalized.startswith("www."):
        normalized = normalized[4:]
    if normalized.startswith("m."):
        normalized = normalized[2:]
    return normalized


def _is_youtube_host(host: str) -> bool:
    return (
        host == "youtu.be"
        or host == "youtube.com"
        or host.endswith(".youtube.com")
        or host == "youtube-nocookie.com"
        or host.endswith(".youtube-nocookie.com")
    )


def _validate_video_id(video_id: str) -> str:
    candidate = video_id.strip()
    if not candidate or not VIDEO_ID_PATTERN.match(candidate):
        raise ValueError("Invalid YouTube video URL.")
    return candidate


def parse_youtube_video_url(url: str) -> YouTubeVideoSource:
    """
    Parse a YouTube URL and return canonical video source metadata.

    Supports:
    - watch URLs
    - youtu.be short URLs
    - shorts URLs
    - live URLs
    - embed URLs
    """
    raw_url = url.strip()
    if not raw_url:
        raise ValueError("YouTube URL is required.")

    parsed = urlparse(raw_url)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("URL must start with http:// or https://")

    host = _normalize_host(parsed.netloc.split(":")[0])
    if not _is_youtube_host(host):
        raise ValueError("Only YouTube video URLs are supported.")

    query = parse_qs(parsed.query)
    path_parts = [part for part in parsed.path.split("/") if part]

    video_id = ""

    if host == "youtu.be":
        if not path_parts:
            raise ValueError("Only YouTube video URLs are supported.")
        video_id = path_parts[0]
    else:
        if path_parts:
            prefix = path_parts[0].lower()

            if prefix.startswith("@") or prefix in NON_VIDEO_PATH_PREFIXES:
                raise ValueError("Only YouTube video URLs are supported.")

            if prefix == "watch":
                video_id = query.get("v", [""])[0]
            elif prefix in VIDEO_PATH_PREFIXES and len(path_parts) > 1:
                video_id = path_parts[1]
            elif "v" in query:
                video_id = query.get("v", [""])[0]
            else:
                raise ValueError("Only YouTube video URLs are supported.")
        else:
            video_id = query.get("v", [""])[0]

    normalized_video_id = _validate_video_id(video_id)
    canonical_url = f"https://www.youtube.com/watch?v={normalized_video_id}"

    return YouTubeVideoSource(
        video_id=normalized_video_id,
        canonical_url=canonical_url,
    )


def fetch_oembed_title(video_url: str, timeout_seconds: float = 10.0) -> str | None:
    """Fetch a YouTube video title from oEmbed."""
    try:
        response = httpx.get(
            "https://www.youtube.com/oembed",
            params={"url": video_url, "format": "json"},
            timeout=timeout_seconds,
        )
        response.raise_for_status()
        payload = response.json()
    except (httpx.HTTPError, ValueError):
        return None

    title = payload.get("title")
    if not isinstance(title, str):
        return None

    cleaned = title.strip()
    return cleaned or None
