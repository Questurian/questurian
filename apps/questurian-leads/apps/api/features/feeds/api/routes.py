from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional, Dict

from features.feeds.schema import FeedCreate, FeedUpdate, FeedResponse
from features.feeds.service.fetcher import fetch_feed, fetch_all_active_feeds
from lib.database import fetch_all, fetch_one, execute_query

router = APIRouter(prefix="/feeds", tags=["feeds"])


def get_feed_with_tags(feed_id: int) -> Optional[dict]:
    """Get feed with its tags."""
    feed = fetch_one("SELECT * FROM feeds WHERE id = ?", (feed_id,))
    if not feed:
        return None

    tags = fetch_all(
        """SELECT ft.name FROM feed_tags ft
           JOIN feed_tag_map ftm ON ft.id = ftm.tag_id
           WHERE ftm.feed_id = ?""",
        (feed_id,)
    )
    feed["tags"] = [tag["name"] for tag in tags]
    return feed


@router.post("", response_model=FeedResponse, status_code=201)
def create_feed(feed: FeedCreate) -> FeedResponse:
    """Create a new feed."""
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
            """INSERT INTO feeds
               (category_id, url, source_name, website, country, fetch_interval, is_active)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (feed.category_id, feed.url, feed.source_name, feed.website, feed.country,
             feed.fetch_interval, feed.is_active)
        )
        result = get_feed_with_tags(feed_id)
        if not result:
            raise HTTPException(status_code=500, detail="Failed to create feed")
        return FeedResponse(**result)
    except Exception as e:
        if "UNIQUE constraint failed" in str(e):
            raise HTTPException(status_code=400, detail="Feed URL already exists")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("", response_model=List[FeedResponse])
def get_feeds(
    active: Optional[int] = Query(None, ge=0, le=1),
    category_id: Optional[int] = Query(None),
    limit: Optional[int] = Query(None, ge=1),
    offset: Optional[int] = Query(0, ge=0)
) -> List[FeedResponse]:
    """Get all feeds with optional filters."""
    query = "SELECT * FROM feeds WHERE 1=1"
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
        feed_data = get_feed_with_tags(feed["id"])
        if feed_data:
            results.append(FeedResponse(**feed_data))

    return results


@router.get("/category/{category_id}", response_model=List[FeedResponse])
def get_feeds_by_category(category_id: int) -> List[FeedResponse]:
    """Get all feeds for a category."""
    feeds = fetch_all("SELECT * FROM feeds WHERE category_id = ?", (category_id,))
    results = []
    for feed in feeds:
        feed_data = get_feed_with_tags(feed["id"])
        if feed_data:
            results.append(FeedResponse(**feed_data))
    return results


@router.get("/{feed_id}", response_model=FeedResponse)
def get_feed(feed_id: int) -> FeedResponse:
    """Get a feed by ID."""
    result = get_feed_with_tags(feed_id)
    if not result:
        raise HTTPException(status_code=404, detail="Feed not found")
    return FeedResponse(**result)


@router.put("/{feed_id}", response_model=FeedResponse)
def update_feed(feed_id: int, feed: FeedUpdate) -> FeedResponse:
    """Update a feed."""
    existing = fetch_one("SELECT * FROM feeds WHERE id = ?", (feed_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Feed not found")

    # Validate category if provided
    if feed.category_id is not None:
        category = fetch_one("SELECT * FROM categories WHERE id = ?", (feed.category_id,))
        if not category:
            raise HTTPException(status_code=400, detail="Category not found")
    if feed.country is not None:
        if not feed.country.strip():
            raise HTTPException(status_code=400, detail="Country is required")
        country_row = fetch_one("SELECT * FROM countries WHERE name = ?", (feed.country,))
        if not country_row:
            raise HTTPException(status_code=400, detail="Country not found")

    updates = []
    params = []

    if feed.category_id is not None:
        updates.append("category_id = ?")
        params.append(feed.category_id)
    if feed.url is not None:
        updates.append("url = ?")
        params.append(feed.url)
    if feed.source_name is not None:
        updates.append("source_name = ?")
        params.append(feed.source_name)
    if feed.website is not None:
        updates.append("website = ?")
        params.append(feed.website)
    if feed.country is not None:
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

    if not updates:
        return FeedResponse(**get_feed_with_tags(feed_id))

    params.append(feed_id)
    query = f"UPDATE feeds SET {', '.join(updates)} WHERE id = ?"

    try:
        execute_query(query, tuple(params))
        result = get_feed_with_tags(feed_id)
        return FeedResponse(**result)
    except Exception as e:
        if "UNIQUE constraint failed" in str(e):
            raise HTTPException(status_code=400, detail="Feed URL already exists")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{feed_id}/activate", response_model=FeedResponse)
def activate_feed(feed_id: int) -> FeedResponse:
    """Activate a feed."""
    existing = fetch_one("SELECT * FROM feeds WHERE id = ?", (feed_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Feed not found")

    execute_query("UPDATE feeds SET is_active = 1 WHERE id = ?", (feed_id,))
    result = get_feed_with_tags(feed_id)
    return FeedResponse(**result)


@router.patch("/{feed_id}/deactivate", response_model=FeedResponse)
def deactivate_feed(feed_id: int) -> FeedResponse:
    """Deactivate a feed (soft delete)."""
    existing = fetch_one("SELECT * FROM feeds WHERE id = ?", (feed_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Feed not found")

    execute_query("UPDATE feeds SET is_active = 0 WHERE id = ?", (feed_id,))
    result = get_feed_with_tags(feed_id)
    return FeedResponse(**result)


@router.delete("/{feed_id}", status_code=204)
def delete_feed(feed_id: int):
    """Delete a feed permanently."""
    existing = fetch_one("SELECT * FROM feeds WHERE id = ?", (feed_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Feed not found")

    execute_query("DELETE FROM feeds WHERE id = ?", (feed_id,))


@router.post("/{feed_id}/fetch", response_model=Dict)
def trigger_fetch(feed_id: int) -> Dict:
    """Manually trigger a fetch for a specific feed."""
    existing = fetch_one("SELECT * FROM feeds WHERE id = ?", (feed_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Feed not found")

    try:
        result = fetch_feed(feed_id)
        return {
            "feed_id": feed_id,
            "source_name": existing["source_name"],
            **result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/fetch-all", response_model=List[Dict])
def trigger_fetch_all() -> List[Dict]:
    """Manually trigger a fetch for all active feeds."""
    try:
        results = fetch_all_active_feeds()
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
