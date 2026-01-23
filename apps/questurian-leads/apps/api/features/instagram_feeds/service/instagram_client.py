import os
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional

import requests
from dotenv import load_dotenv

from features.instagram_feeds.schema.models import InstagramPost

_HERE = Path(__file__).resolve()
_REPO_ROOT = _HERE.parents[5]
_API_ROOT = _HERE.parents[3]
load_dotenv(_REPO_ROOT / ".env")
load_dotenv(_API_ROOT / ".env")

RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "9259a11e20mshc29372910a530bcp1d41dbjsn3cc85ab17473")
RAPIDAPI_HOST = "instagram120.p.rapidapi.com"
API_ENDPOINT = f"https://{RAPIDAPI_HOST}/api/instagram/posts"

class InstagramAPIError(Exception):
    """Custom exception for Instagram API errors."""
    pass

def fetch_instagram_posts(username: str, max_id: str = "") -> Dict:
    """
    Fetch Instagram posts for a given username using RapidAPI.

    Args:
        username: Instagram username
        max_id: Pagination cursor (empty string for first page)

    Returns:
        Dict with 'posts' (List[InstagramPost]) and 'next_max_id' (str)

    Raises:
        InstagramAPIError: If API request fails
    """
    headers = {
        "x-rapidapi-host": RAPIDAPI_HOST,
        "x-rapidapi-key": RAPIDAPI_KEY,
        "Content-Type": "application/json"
    }

    payload = {
        "username": username,
        "maxId": max_id
    }

    try:
        response = requests.post(API_ENDPOINT, json=payload, headers=headers, timeout=30)
        response.raise_for_status()
        data = response.json()

        # Parse response structure - Instagram120 API uses GraphQL format
        posts = []
        edges = data.get("result", {}).get("edges", [])

        # Extract node from each edge (GraphQL response format)
        for edge in edges:
            item = edge.get("node", {})
            if not item:
                continue
            try:
                post = InstagramPost(
                    post_id=str(item.get("id") or item.get("pk", "")),
                    username=item.get("user", {}).get("username", username),
                    caption=_extract_caption(item),
                    media_type=_determine_media_type(item),
                    media_url=_extract_media_url(item),
                    thumbnail_url=_extract_thumbnail(item),
                    like_count=item.get("like_count", 0),
                    comment_count=item.get("comment_count", 0),
                    view_count=item.get("view_count"),
                    posted_at=_parse_timestamp(item.get("taken_at")),
                    permalink=f"https://www.instagram.com/p/{item.get('code', '')}/"
                )
                posts.append(post)
            except Exception as e:
                # Log parsing error but continue with other posts
                print(f"Error parsing post: {e}")
                continue

        # Extract next_max_id for pagination from GraphQL response
        page_info = data.get("result", {}).get("page_info", {})
        next_max_id = page_info.get("end_cursor", "") or page_info.get("next_max_id", "")

        # Fallback: check if there's a next_max_id at result level
        if not next_max_id:
            next_max_id = data.get("result", {}).get("next_max_id", "")

        return {
            "posts": posts,
            "next_max_id": next_max_id
        }

    except requests.exceptions.RequestException as e:
        raise InstagramAPIError(f"API request failed: {str(e)}")
    except Exception as e:
        raise InstagramAPIError(f"Unexpected error: {str(e)}")

def _extract_caption(item: Dict) -> Optional[str]:
    """Extract caption text from post item."""
    caption_obj = item.get("caption")
    if isinstance(caption_obj, dict):
        return caption_obj.get("text")
    elif isinstance(caption_obj, str):
        return caption_obj
    return None

def _determine_media_type(item: Dict) -> str:
    """Determine media type from post item."""
    media_type = item.get("media_type", 1)
    if media_type == 1:
        return "image"
    elif media_type == 2:
        return "video"
    elif media_type == 8:
        return "carousel"
    return "unknown"

def _get_primary_media_item(item: Dict) -> Dict:
    """Pick a stable media node, preferring the first carousel item."""
    carousel_media = item.get("carousel_media")
    if isinstance(carousel_media, list) and carousel_media:
        return carousel_media[0]
    return item

def _extract_media_url(item: Dict) -> str:
    """Extract primary media URL from post item."""
    media_item = _get_primary_media_item(item)
    media_type = item.get("media_type")

    # Only prefer video URLs for true video posts; carousels should show an image.
    if media_type == 2:
        video_versions = media_item.get("video_versions", [])
        if video_versions and isinstance(video_versions, list):
            url = video_versions[0].get("url", "")
            if url:
                return url

    # Try image versions (works for images, carousels, and video posters)
    image_versions = media_item.get("image_versions2", {}).get("candidates", [])
    if image_versions and isinstance(image_versions, list) and len(image_versions) > 0:
        url = image_versions[0].get("url", "")
        if url:
            return url

    # Fallback to thumbnail or display URL
    for key in ("thumbnail_url", "display_url"):
        url = media_item.get(key) or item.get(key)
        if url:
            return url

    return ""

def _extract_thumbnail(item: Dict) -> Optional[str]:
    """Extract thumbnail URL for videos."""
    media_item = _get_primary_media_item(item)
    media_type = media_item.get("media_type", item.get("media_type"))
    if media_type == 2:  # Video
        image_versions = media_item.get("image_versions2", {}).get("candidates", [])
        if image_versions and isinstance(image_versions, list) and len(image_versions) > 0:
            url = image_versions[0].get("url")
            if url:
                return url
        return media_item.get("thumbnail_url") or media_item.get("display_url") or item.get("thumbnail_url")
    return None

def _parse_timestamp(timestamp: Optional[int]) -> Optional[str]:
    """Convert Unix timestamp to ISO format."""
    if timestamp:
        try:
            return datetime.utcfromtimestamp(timestamp).isoformat()
        except:
            return None
    return None
