"""
FastAPI routes for Diario Correo feeds.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional, Dict

from features.diario_correo_feeds.schema.models import (
    DiarioCorreoFeedResponse,
    DiarioCorreoPostResponse,
)
from features.diario_correo_feeds.service.fetcher import (
    fetch_diario_correo_feed,
    fetch_one,
    fetch_all,
    execute_query,
)

router = APIRouter(prefix="/diario-correo-feeds", tags=["diario-correo-feeds"])

DEFAULT_CATEGORY_NAME = "Peru"
DEFAULT_FEED_URL = "https://diariocorreo.pe/gastronomia/"
DEFAULT_DISPLAY_NAME = "Diario Correo Gastronomia"
DEFAULT_SECTION = "gastronomia"
DEFAULT_FETCH_INTERVAL = 60


def ensure_category_id() -> int:
    category = fetch_one("SELECT id FROM categories WHERE name = ?", (DEFAULT_CATEGORY_NAME,))
    if category:
        return category["id"]
    return execute_query(
        "INSERT INTO categories (name) VALUES (?)",
        (DEFAULT_CATEGORY_NAME,)
    )


def ensure_feed() -> dict:
    feed = fetch_one("SELECT * FROM diario_correo_feeds ORDER BY id LIMIT 1", ())
    if feed:
        return feed

    category_id = ensure_category_id()
    feed_id = execute_query(
        """INSERT INTO diario_correo_feeds
           (category_id, url, display_name, section, fetch_interval, is_active)
           VALUES (?, ?, ?, ?, ?, 1)""",
        (
            category_id,
            DEFAULT_FEED_URL,
            DEFAULT_DISPLAY_NAME,
            DEFAULT_SECTION,
            DEFAULT_FETCH_INTERVAL,
        ),
    )
    return fetch_one("SELECT * FROM diario_correo_feeds WHERE id = ?", (feed_id,))


@router.get("/posts", response_model=List[DiarioCorreoPostResponse])
def get_posts(
    search: Optional[str] = Query(None),
    diario_correo_feed_id: Optional[int] = Query(None),
    approval_status: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    limit: Optional[int] = Query(15, ge=1, le=1000),
    offset: Optional[int] = Query(0, ge=0),
):
    """
    Get Diario Correo posts with filters.

    Args:
        search: Search in title and excerpt
        diario_correo_feed_id: Filter by feed ID
        approval_status: Filter by approval status (pending, approved, rejected)
        limit: Max results (default 15, max 1000)
        offset: Pagination offset
    """
    query = """
        SELECT * FROM diario_correo_posts
        WHERE 1=1
    """
    params = []

    if search:
        query += " AND (title LIKE ? OR excerpt LIKE ?)"
        search_term = f"%{search}%"
        params.extend([search_term, search_term])

    if diario_correo_feed_id is not None:
        query += " AND diario_correo_feed_id = ?"
        params.append(diario_correo_feed_id)

    if approval_status:
        query += " AND approval_status = ?"
        params.append(approval_status)

    if country:
        query += " AND country = ?"
        params.append(country)

    query += " ORDER BY published_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    posts = fetch_all(query, tuple(params))
    return [DiarioCorreoPostResponse(**p) for p in posts]


@router.get("", response_model=List[DiarioCorreoFeedResponse])
def get_feeds(
    category_id: Optional[int] = Query(None),
    is_active: Optional[int] = Query(None),
    limit: Optional[int] = Query(None, ge=1),
    offset: Optional[int] = Query(0, ge=0),
):
    """Get all Diario Correo feeds with optional filters."""
    query = "SELECT * FROM diario_correo_feeds WHERE 1=1"
    params = []

    if category_id is not None:
        query += " AND category_id = ?"
        params.append(category_id)

    if is_active is not None:
        query += " AND is_active = ?"
        params.append(is_active)

    query += " ORDER BY created_at DESC"

    if limit is not None:
        query += " LIMIT ? OFFSET ?"
        params.extend([limit, offset])

    feeds = fetch_all(query, tuple(params))
    return [DiarioCorreoFeedResponse(**f) for f in feeds]


@router.get("/{feed_id}", response_model=DiarioCorreoFeedResponse)
def get_feed(feed_id: int):
    """Get a single Diario Correo feed by ID."""
    feed = fetch_one("SELECT * FROM diario_correo_feeds WHERE id = ?", (feed_id,))
    if not feed:
        raise HTTPException(status_code=404, detail="Feed not found")
    return DiarioCorreoFeedResponse(**feed)


@router.post("/fetch", response_model=Dict)
def trigger_fetch():
    """
    Manually trigger scrape for the default feed.

    IMPORTANT: This endpoint BLOCKS for 10-30 seconds while scraping.
    The scraper will delete all existing posts and insert fresh 15 articles.
    If no feed row exists yet, one is created with category "Peru".
    """
    existing = ensure_feed()

    try:
        result = fetch_diario_correo_feed(existing["id"])
        return {
            "diario_correo_feed_id": existing["id"],
            "display_name": existing["display_name"],
            **result,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/fetch-all", response_model=List[Dict])
def trigger_fetch_all():
    """
    Trigger fetch for all active Diario Correo feeds.

    IMPORTANT: This endpoint BLOCKS while scraping all feeds.
    """
    try:
        existing = ensure_feed()
        result = fetch_diario_correo_feed(existing["id"])
        return [{
            "diario_correo_feed_id": existing["id"],
            "display_name": existing["display_name"],
            **result,
        }]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/posts/{post_id}", response_model=DiarioCorreoPostResponse)
def get_post(post_id: int):
    """Get a single Diario Correo post by ID."""
    post = fetch_one("SELECT * FROM diario_correo_posts WHERE id = ?", (post_id,))
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    return DiarioCorreoPostResponse(**post)
