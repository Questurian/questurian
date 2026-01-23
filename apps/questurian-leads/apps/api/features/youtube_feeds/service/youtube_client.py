import os
from typing import List, Optional

import requests
from dotenv import load_dotenv

from features.youtube_feeds.schema.models import YouTubeVideo, YouTubeChannelSearchResult


load_dotenv()

YOUTUBE_API_URL = "https://www.googleapis.com/youtube/v3/search"


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
    videos: List[YouTubeVideo] = []

    for item in items:
        snippet = item.get("snippet", {})
        id_block = item.get("id", {})
        video_id = id_block.get("videoId")
        if not video_id:
            continue

        videos.append(
            YouTubeVideo(
                video_id=video_id,
                title=snippet.get("title") or "Untitled",
                description=snippet.get("description"),
                published_at=snippet.get("publishedAt"),
                thumbnail_url=_select_thumbnail(snippet.get("thumbnails", {})),
                video_url=f"https://www.youtube.com/watch?v={video_id}",
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
