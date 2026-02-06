import os
import re
from typing import List, Optional, Dict

import requests
from dotenv import load_dotenv

from features.youtube_feeds.schema.models import YouTubeVideo, YouTubeChannelSearchResult


load_dotenv()

YOUTUBE_API_URL = "https://www.googleapis.com/youtube/v3/search"
YOUTUBE_VIDEOS_API_URL = "https://www.googleapis.com/youtube/v3/videos"


def parse_iso8601_duration(duration: str) -> int:
    """
    Parse ISO 8601 duration (e.g., PT1M30S, PT45S, PT1H2M3S) to seconds.
    Returns total seconds.
    """
    if not duration:
        return 0

    pattern = r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?'
    match = re.match(pattern, duration)
    if not match:
        return 0

    hours = int(match.group(1) or 0)
    minutes = int(match.group(2) or 0)
    seconds = int(match.group(3) or 0)

    return hours * 3600 + minutes * 60 + seconds


def get_video_durations(video_ids: List[str]) -> Dict[str, int]:
    """
    Fetch video durations from YouTube API.
    Returns dict mapping video_id -> duration in seconds.
    """
    if not video_ids:
        return {}

    api_key = os.getenv("YOUTUBE_API_KEY")
    if not api_key:
        return {}

    params = {
        "part": "contentDetails",
        "id": ",".join(video_ids),
        "key": api_key,
    }

    try:
        response = requests.get(YOUTUBE_VIDEOS_API_URL, params=params, timeout=30)
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError):
        return {}

    durations = {}
    for item in payload.get("items", []):
        video_id = item.get("id")
        content_details = item.get("contentDetails", {})
        duration_str = content_details.get("duration", "")
        if video_id:
            durations[video_id] = parse_iso8601_duration(duration_str)

    return durations


def is_youtube_short(duration_seconds: int) -> bool:
    """Check if a video is a YouTube Short (60 seconds or less)."""
    return duration_seconds > 0 and duration_seconds <= 60


class YouTubeAPIError(Exception):
    """Custom exception for YouTube API errors."""


def fetch_youtube_videos(channel_id: str, max_results: int = 5) -> List[YouTubeVideo]:
    api_key = os.getenv("YOUTUBE_API_KEY")
    if not api_key:
        raise YouTubeAPIError("Missing YOUTUBE_API_KEY")

    params = {
        "part": "snippet",
        "channelId": channel_id,
        "maxResults": max_results,
        "order": "date",
        "type": "video",
        "key": api_key,
    }

    try:
        response = requests.get(YOUTUBE_API_URL, params=params, timeout=30)
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as exc:
        raise YouTubeAPIError(f"YouTube API request failed: {exc}") from exc
    except ValueError as exc:
        raise YouTubeAPIError(f"Invalid JSON response: {exc}") from exc

    items = payload.get("items", [])

    # Extract video IDs to fetch durations
    video_ids = []
    for item in items:
        id_block = item.get("id", {})
        video_id = id_block.get("videoId")
        if video_id:
            video_ids.append(video_id)

    # Fetch durations for all videos in one API call
    durations = get_video_durations(video_ids)

    videos: List[YouTubeVideo] = []
    for item in items:
        snippet = item.get("snippet", {})
        id_block = item.get("id", {})
        video_id = id_block.get("videoId")
        if not video_id:
            continue

        duration_seconds = durations.get(video_id, 0)
        videos.append(
            YouTubeVideo(
                video_id=video_id,
                title=snippet.get("title") or "Untitled",
                description=snippet.get("description"),
                published_at=snippet.get("publishedAt"),
                thumbnail_url=_select_thumbnail(snippet.get("thumbnails", {})),
                video_url=f"https://www.youtube.com/watch?v={video_id}",
                is_short=1 if is_youtube_short(duration_seconds) else 0,
            )
        )

    return videos


def search_youtube_channels(query: str, max_results: int = 5) -> List[YouTubeChannelSearchResult]:
    api_key = os.getenv("YOUTUBE_API_KEY")
    if not api_key:
        raise YouTubeAPIError("Missing YOUTUBE_API_KEY")

    params = {
        "part": "snippet",
        "type": "channel",
        "q": query,
        "maxResults": max_results,
        "key": api_key,
    }

    try:
        response = requests.get(YOUTUBE_API_URL, params=params, timeout=30)
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as exc:
        raise YouTubeAPIError(f"YouTube API request failed: {exc}") from exc
    except ValueError as exc:
        raise YouTubeAPIError(f"Invalid JSON response: {exc}") from exc

    items = payload.get("items", [])
    channels: List[YouTubeChannelSearchResult] = []

    for item in items:
        snippet = item.get("snippet", {})
        id_block = item.get("id", {})
        channel_id = id_block.get("channelId")
        if not channel_id:
            continue

        channels.append(
            YouTubeChannelSearchResult(
                channel_id=channel_id,
                display_name=snippet.get("title") or "Untitled",
                channel_url=f"https://www.youtube.com/channel/{channel_id}",
                description=snippet.get("description"),
                thumbnail_url=_select_thumbnail(snippet.get("thumbnails", {})),
            )
        )

    return channels


def _select_thumbnail(thumbnails: dict) -> Optional[str]:
    for key in ("high", "medium", "default"):
        thumbnail = thumbnails.get(key, {})
        url = thumbnail.get("url")
        if url:
            return url
    return None
