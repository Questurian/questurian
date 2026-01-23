from fastapi import APIRouter, HTTPException, Query, Response
from typing import List, Optional, Dict
from urllib.parse import urlparse
import requests

from features.instagram_feeds.schema.models import (
    InstagramFeedCreate, InstagramFeedUpdate, InstagramFeedResponse,
    InstagramPostResponse
)
from features.instagram_feeds.service.fetcher import (
    fetch_instagram_feed,
    fetch_all_active_instagram_feeds
)
from lib.database import fetch_all, fetch_one, execute_query

router = APIRouter(prefix="/instagram-feeds", tags=["instagram-feeds"])
ALLOWED_MEDIA_HOSTS = ("cdninstagram.com", "fbcdn.net")

def _is_allowed_media_url(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return False
    host = parsed.netloc.split(":", 1)[0].lower()
    return any(host == domain or host.endswith(f".{domain}") for domain in ALLOWED_MEDIA_HOSTS)

# Helper function to get feed with tags
def get_instagram_feed_with_tags(feed_id: int) -> Optional[dict]:
    """Get Instagram feed with its tags."""
    feed = fetch_one("SELECT * FROM instagram_feeds WHERE id = ?", (feed_id,))
    if not feed:
        return None

    tags = fetch_all(
        """SELECT ft.name FROM feed_tags ft
           JOIN instagram_feed_tag_map iftm ON ft.id = iftm.tag_id
           WHERE iftm.instagram_feed_id = ?""",
        (feed_id,)
    )
    feed["tags"] = [tag["name"] for tag in tags]
    return feed

# Instagram Feed CRUD Routes
@router.post("", response_model=InstagramFeedResponse, status_code=201)
def create_instagram_feed(feed: InstagramFeedCreate) -> InstagramFeedResponse:
    """Create a new Instagram feed."""
    # Validate category exists
    category = fetch_one("SELECT * FROM categories WHERE id = ?", (feed.category_id,))
    if not category:
        raise HTTPException(status_code=400, detail="Category not found")
    if not feed.country or not feed.country.strip():
        raise HTTPException(status_code=400, detail="Country is required")
    country_row = fetch_one("SELECT * FROM countries WHERE name = ?", (feed.country,))
    if not country_row:
        raise HTTPException(status_code=400, detail="Country not found")

    try:
        feed_id = execute_query(
            """INSERT INTO instagram_feeds
               (category_id, username, display_name, profile_url, country, fetch_interval, is_active)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (feed.category_id, feed.username, feed.display_name,
             feed.profile_url, feed.country, feed.fetch_interval, feed.is_active)
        )
        result = get_instagram_feed_with_tags(feed_id)
        if not result:
            raise HTTPException(status_code=500, detail="Failed to create Instagram feed")
        return InstagramFeedResponse(**result)
    except Exception as e:
        if "UNIQUE constraint failed" in str(e):
            raise HTTPException(status_code=400, detail="Instagram username already exists")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("", response_model=List[InstagramFeedResponse])
def get_instagram_feeds(
    active: Optional[int] = Query(None, ge=0, le=1),
    category_id: Optional[int] = Query(None),
    limit: Optional[int] = Query(None, ge=1),
    offset: Optional[int] = Query(0, ge=0)
) -> List[InstagramFeedResponse]:
    """Get all Instagram feeds with optional filters."""
    query = "SELECT * FROM instagram_feeds WHERE 1=1"
    params = []

    if active is not None:
        query += " AND is_active = ?"
        params.append(active)
    if category_id is not None:
        query += " AND category_id = ?"
        params.append(category_id)

    if limit is not None:
        query += " LIMIT ? OFFSET ?"
        params.extend([limit, offset])

    feeds = fetch_all(query, tuple(params))
    results = []
    for feed in feeds:
        feed_data = get_instagram_feed_with_tags(feed["id"])
        if feed_data:
            results.append(InstagramFeedResponse(**feed_data))

    return results

# Fetch Operations (must come before /{feed_id} routes)
@router.post("/fetch-all", response_model=List[Dict])
def trigger_fetch_all_instagram() -> List[Dict]:
    """Manually trigger a fetch for all active Instagram feeds."""
    try:
        results = fetch_all_active_instagram_feeds()
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Instagram Posts Routes (must come before /{feed_id} routes)
@router.get("/posts", response_model=List[InstagramPostResponse])
def get_instagram_posts(
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    instagram_feed_id: Optional[int] = Query(None),
    limit: Optional[int] = Query(None, ge=1),
    offset: Optional[int] = Query(0, ge=0)
) -> List[InstagramPostResponse]:
    """Get Instagram posts with filters."""
    query = """
        SELECT ip.* FROM instagram_posts ip
        JOIN instagram_feeds if ON ip.instagram_feed_id = if.id
        WHERE ip.approval_status = 'approved'
    """
    params = []

    if search:
        query += " AND (ip.caption LIKE ? OR ip.username LIKE ?)"
        search_term = f"%{search}%"
        params.extend([search_term, search_term])

    if category:
        query += """ AND if.category_id IN (
            SELECT id FROM categories WHERE name = ?
        )"""
        params.append(category)

    if tag:
        query += """ AND if.id IN (
            SELECT iftm.instagram_feed_id FROM instagram_feed_tag_map iftm
            JOIN feed_tags ft ON iftm.tag_id = ft.id
            WHERE ft.name = ?
        )"""
        params.append(tag)

    if instagram_feed_id:
        query += " AND ip.instagram_feed_id = ?"
        params.append(instagram_feed_id)

    if country:
        query += " AND ip.country = ?"
        params.append(country)

    query += " ORDER BY ip.posted_at DESC"

    if limit is not None:
        query += " LIMIT ? OFFSET ?"
        params.extend([limit, offset])

    posts = fetch_all(query, tuple(params))
    return [InstagramPostResponse(**post) for post in posts]

@router.get("/posts/{post_id}/image")
def get_instagram_post_image(post_id: int):
    """Proxy Instagram image URLs to avoid cross-origin blocking."""
    post = fetch_one(
        "SELECT media_url, thumbnail_url FROM instagram_posts WHERE id = ?",
        (post_id,)
    )
    if not post:
        raise HTTPException(status_code=404, detail="Instagram post not found")

    image_url = post.get("thumbnail_url") or post.get("media_url")
    if not image_url:
        raise HTTPException(status_code=404, detail="Instagram post image not available")
    if not _is_allowed_media_url(image_url):
        raise HTTPException(status_code=400, detail="Unsupported media URL")

    try:
        upstream = requests.get(
            image_url,
            timeout=10,
            headers={"User-Agent": "Mozilla/5.0"}
        )
        upstream.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch image: {exc}")

    content_type = upstream.headers.get("Content-Type", "image/jpeg")
    return Response(
        content=upstream.content,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=86400"}
    )

@router.get("/posts/{post_id}", response_model=InstagramPostResponse)
def get_instagram_post(post_id: int) -> InstagramPostResponse:
    """Get a single Instagram post by ID."""
    post = fetch_one("SELECT * FROM instagram_posts WHERE id = ?", (post_id,))
    if not post:
        raise HTTPException(status_code=404, detail="Instagram post not found")
    return InstagramPostResponse(**post)

@router.delete("/posts/{post_id}", status_code=204)
def delete_instagram_post(post_id: int):
    """Delete an Instagram post."""
    existing = fetch_one("SELECT * FROM instagram_posts WHERE id = ?", (post_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Instagram post not found")

    execute_query("DELETE FROM instagram_posts WHERE id = ?", (post_id,))

# Feed-specific routes with {feed_id} parameter
@router.get("/{feed_id}", response_model=InstagramFeedResponse)
def get_instagram_feed(feed_id: int) -> InstagramFeedResponse:
    """Get an Instagram feed by ID."""
    result = get_instagram_feed_with_tags(feed_id)
    if not result:
        raise HTTPException(status_code=404, detail="Instagram feed not found")
    return InstagramFeedResponse(**result)

@router.put("/{feed_id}", response_model=InstagramFeedResponse)
def update_instagram_feed(feed_id: int, feed: InstagramFeedUpdate) -> InstagramFeedResponse:
    """Update an Instagram feed."""
    existing = fetch_one("SELECT * FROM instagram_feeds WHERE id = ?", (feed_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Instagram feed not found")

    if feed.category_id is not None:
        category = fetch_one("SELECT * FROM categories WHERE id = ?", (feed.category_id,))
        if not category:
            raise HTTPException(status_code=400, detail="Category not found")

    updates = []
    params = []

    if feed.category_id is not None:
        updates.append("category_id = ?")
        params.append(feed.category_id)
    if feed.username is not None:
        updates.append("username = ?")
        params.append(feed.username)
    if feed.display_name is not None:
        updates.append("display_name = ?")
        params.append(feed.display_name)
    if feed.profile_url is not None:
        updates.append("profile_url = ?")
        params.append(feed.profile_url)
    if feed.country is not None:
        if not feed.country.strip():
            raise HTTPException(status_code=400, detail="Country is required")
        country_row = fetch_one("SELECT * FROM countries WHERE name = ?", (feed.country,))
        if not country_row:
            raise HTTPException(status_code=400, detail="Country not found")
        updates.append("country = ?")
        params.append(feed.country)
    if feed.fetch_interval is not None:
        updates.append("fetch_interval = ?")
        params.append(feed.fetch_interval)
    if feed.is_active is not None:
        updates.append("is_active = ?")
        params.append(feed.is_active)
    if feed.last_fetched is not None:
        updates.append("last_fetched = ?")
        params.append(feed.last_fetched)
    if feed.last_max_id is not None:
        updates.append("last_max_id = ?")
        params.append(feed.last_max_id)

    if not updates:
        return InstagramFeedResponse(**get_instagram_feed_with_tags(feed_id))

    params.append(feed_id)
    query = f"UPDATE instagram_feeds SET {', '.join(updates)} WHERE id = ?"

    try:
        execute_query(query, tuple(params))
        result = get_instagram_feed_with_tags(feed_id)
        return InstagramFeedResponse(**result)
    except Exception as e:
        if "UNIQUE constraint failed" in str(e):
            raise HTTPException(status_code=400, detail="Instagram username already exists")
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{feed_id}/activate", response_model=InstagramFeedResponse)
def activate_instagram_feed(feed_id: int) -> InstagramFeedResponse:
    """Activate an Instagram feed."""
    existing = fetch_one("SELECT * FROM instagram_feeds WHERE id = ?", (feed_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Instagram feed not found")

    execute_query("UPDATE instagram_feeds SET is_active = 1 WHERE id = ?", (feed_id,))
    result = get_instagram_feed_with_tags(feed_id)
    return InstagramFeedResponse(**result)

@router.patch("/{feed_id}/deactivate", response_model=InstagramFeedResponse)
def deactivate_instagram_feed(feed_id: int) -> InstagramFeedResponse:
    """Deactivate an Instagram feed."""
    existing = fetch_one("SELECT * FROM instagram_feeds WHERE id = ?", (feed_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Instagram feed not found")

    execute_query("UPDATE instagram_feeds SET is_active = 0 WHERE id = ?", (feed_id,))
    result = get_instagram_feed_with_tags(feed_id)
    return InstagramFeedResponse(**result)

@router.delete("/{feed_id}", status_code=204)
def delete_instagram_feed(feed_id: int):
    """Delete an Instagram feed permanently."""
    existing = fetch_one("SELECT * FROM instagram_feeds WHERE id = ?", (feed_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Instagram feed not found")

    execute_query("DELETE FROM instagram_feeds WHERE id = ?", (feed_id,))

@router.post("/{feed_id}/fetch", response_model=Dict)
def trigger_instagram_fetch(feed_id: int) -> Dict:
    """Manually trigger a fetch for a specific Instagram feed."""
    existing = fetch_one("SELECT * FROM instagram_feeds WHERE id = ?", (feed_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Instagram feed not found")

    try:
        result = fetch_instagram_feed(feed_id)
        return {
            "instagram_feed_id": feed_id,
            "username": existing["username"],
            **result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
