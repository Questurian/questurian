import csv
import io
from datetime import datetime
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from typing import Dict, List, Optional

from features.youtube_feeds.schema.models import (
    YouTubeFeedCreate,
    YouTubeFeedUpdate,
    YouTubeFeedResponse,
    YouTubePostResponse,
    TranscriptResponse,
    YouTubeChannelSearchResult,
)
from features.youtube_feeds.service.youtube_client import (
    search_youtube_channels,
    YouTubeAPIError,
)
from features.youtube_feeds.service.fetcher import (
    fetch_all_active_youtube_feeds,
    fetch_youtube_feed,
)
from features.youtube_feeds.service.transcript_extractor import extract_transcript_sync
from lib.database import fetch_all, fetch_one, execute_query

router = APIRouter(prefix="/youtube-feeds", tags=["youtube-feeds"])


@router.get("/channel-search", response_model=List[YouTubeChannelSearchResult])
def search_channel(
    query: str = Query(..., min_length=2),
    max_results: int = Query(5, ge=1, le=10),
) -> List[YouTubeChannelSearchResult]:
    """Search YouTube channels by name and return basic channel metadata."""
    try:
        return search_youtube_channels(query, max_results=max_results)
    except YouTubeAPIError as exc:
        detail = str(exc)
        status_code = 400 if "Missing YOUTUBE_API_KEY" in detail else 502
        raise HTTPException(status_code=status_code, detail=detail)


@router.post("", response_model=YouTubeFeedResponse, status_code=201)
def create_youtube_feed(feed: YouTubeFeedCreate) -> YouTubeFeedResponse:
    """Create a new YouTube feed."""
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
            """INSERT INTO youtube_feeds
               (category_id, channel_id, display_name, channel_url, fetch_interval, is_active, country)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                feed.category_id,
                feed.channel_id,
                feed.display_name,
                feed.channel_url,
                feed.fetch_interval,
                feed.is_active,
                feed.country,
            ),
        )
        result = fetch_one("SELECT * FROM youtube_feeds WHERE id = ?", (feed_id,))
        if not result:
            raise HTTPException(status_code=500, detail="Failed to create YouTube feed")
        return YouTubeFeedResponse(**result)
    except Exception as exc:
        if "UNIQUE constraint failed" in str(exc):
            raise HTTPException(status_code=400, detail="YouTube channel already exists")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("", response_model=List[YouTubeFeedResponse])
def get_youtube_feeds(
    active: Optional[int] = Query(None, ge=0, le=1),
    category_id: Optional[int] = Query(None),
    limit: Optional[int] = Query(None, ge=1),
    offset: Optional[int] = Query(0, ge=0),
) -> List[YouTubeFeedResponse]:
    """Get all YouTube feeds with optional filters."""
    query = "SELECT * FROM youtube_feeds WHERE 1=1"
    params = []

    if active is not None:
        query += " AND is_active = ?"
        params.append(active)
    if category_id is not None:
        query += " AND category_id = ?"
        params.append(category_id)

    query += " ORDER BY display_name"

    if limit is not None:
        query += " LIMIT ? OFFSET ?"
        params.extend([limit, offset])

    feeds = fetch_all(query, tuple(params))
    return [YouTubeFeedResponse(**feed) for feed in feeds]


@router.post("/fetch-all", response_model=List[Dict])
def trigger_fetch_all_youtube(
    max_results: int = Query(5, ge=1, le=50),
) -> List[Dict]:
    """Manually trigger a fetch for all active YouTube feeds."""
    try:
        return fetch_all_active_youtube_feeds(max_results=max_results)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/posts", response_model=List[YouTubePostResponse])
def get_youtube_posts(
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    youtube_feed_id: Optional[int] = Query(None),
    limit: Optional[int] = Query(None, ge=1),
    offset: Optional[int] = Query(0, ge=0),
) -> List[YouTubePostResponse]:
    """Get YouTube posts with filters."""
    query = """
        SELECT
            yp.id,
            yp.youtube_feed_id,
            yp.video_id,
            yp.title,
            yp.description,
            yp.published_at,
            yp.thumbnail_url,
            yp.video_url,
            yp.collected_at,
            yp.transcript,
            yp.transcript_status,
            yp.transcript_error,
            yp.transcript_extracted_at
        FROM youtube_posts yp
        JOIN youtube_feeds yf ON yp.youtube_feed_id = yf.id
        WHERE 1=1
    """
    params = []

    if search:
        query += " AND (yp.title LIKE ? OR yp.description LIKE ?)"
        search_term = f"%{search}%"
        params.extend([search_term, search_term])

    if category:
        query += """ AND yf.category_id IN (
            SELECT id FROM categories WHERE name = ?
        )"""
        params.append(category)

    if youtube_feed_id:
        query += " AND yp.youtube_feed_id = ?"
        params.append(youtube_feed_id)

    if country:
        query += " AND yf.country = ?"
        params.append(country)

    query += " ORDER BY COALESCE(yp.published_at, yp.collected_at) DESC"

    if limit is not None:
        query += " LIMIT ? OFFSET ?"
        params.extend([limit, offset])

    posts = fetch_all(query, tuple(params))
    return [YouTubePostResponse(**post) for post in posts]


@router.get("/posts/{post_id}", response_model=YouTubePostResponse)
def get_youtube_post(post_id: int) -> YouTubePostResponse:
    """Get a single YouTube post by ID."""
    post = fetch_one(
        """SELECT
               id,
               youtube_feed_id,
               video_id,
               title,
               description,
               published_at,
               thumbnail_url,
               video_url,
               collected_at,
               transcript,
               transcript_status,
               transcript_error,
               transcript_extracted_at
           FROM youtube_posts
           WHERE id = ?""",
        (post_id,),
    )
    if not post:
        raise HTTPException(status_code=404, detail="YouTube post not found")
    return YouTubePostResponse(**post)


@router.delete("/posts/{post_id}", status_code=204)
def delete_youtube_post(post_id: int):
    """Delete a YouTube post."""
    existing = fetch_one("SELECT * FROM youtube_posts WHERE id = ?", (post_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="YouTube post not found")

    execute_query("DELETE FROM youtube_posts WHERE id = ?", (post_id,))


@router.post("/{feed_id}/fetch", response_model=Dict)
def trigger_fetch_youtube_feed(
    feed_id: int,
    max_results: int = Query(5, ge=1, le=50),
) -> Dict:
    """Manually trigger a fetch for a YouTube feed."""
    try:
        return fetch_youtube_feed(feed_id, max_results=max_results)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/{feed_id}", response_model=YouTubeFeedResponse)
def get_youtube_feed(feed_id: int) -> YouTubeFeedResponse:
    """Get a YouTube feed by ID."""
    feed = fetch_one("SELECT * FROM youtube_feeds WHERE id = ?", (feed_id,))
    if not feed:
        raise HTTPException(status_code=404, detail="YouTube feed not found")
    return YouTubeFeedResponse(**feed)


@router.put("/{feed_id}", response_model=YouTubeFeedResponse)
def update_youtube_feed(
    feed_id: int,
    feed: YouTubeFeedUpdate,
) -> YouTubeFeedResponse:
    """Update a YouTube feed."""
    existing = fetch_one("SELECT * FROM youtube_feeds WHERE id = ?", (feed_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="YouTube feed not found")

    if feed.category_id is not None:
        category = fetch_one("SELECT * FROM categories WHERE id = ?", (feed.category_id,))
        if not category:
            raise HTTPException(status_code=400, detail="Category not found")

    updates = []
    params = []

    if feed.category_id is not None:
        updates.append("category_id = ?")
        params.append(feed.category_id)
    if feed.channel_id is not None:
        updates.append("channel_id = ?")
        params.append(feed.channel_id)
    if feed.display_name is not None:
        updates.append("display_name = ?")
        params.append(feed.display_name)
    if feed.channel_url is not None:
        updates.append("channel_url = ?")
        params.append(feed.channel_url)
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

    if not updates:
        return YouTubeFeedResponse(**existing)

    params.append(feed_id)
    query = f"UPDATE youtube_feeds SET {', '.join(updates)} WHERE id = ?"

    try:
        execute_query(query, tuple(params))
        result = fetch_one("SELECT * FROM youtube_feeds WHERE id = ?", (feed_id,))
        return YouTubeFeedResponse(**result)
    except Exception as exc:
        if "UNIQUE constraint failed" in str(exc):
            raise HTTPException(status_code=400, detail="YouTube channel already exists")
        raise HTTPException(status_code=500, detail=str(exc))


@router.delete("/{feed_id}", status_code=204)
def delete_youtube_feed(feed_id: int):
    """Delete a YouTube feed."""
    existing = fetch_one("SELECT * FROM youtube_feeds WHERE id = ?", (feed_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="YouTube feed not found")

    execute_query("DELETE FROM youtube_feeds WHERE id = ?", (feed_id,))


@router.post("/posts/{post_id}/transcript", response_model=TranscriptResponse)
def extract_post_transcript(post_id: int) -> TranscriptResponse:
    """Extract transcript from a YouTube video using youtube-transcript-api."""
    post = fetch_one("SELECT * FROM youtube_posts WHERE id = ?", (post_id,))
    if not post:
        raise HTTPException(status_code=404, detail="YouTube post not found")

    video_id = post.get("video_id")
    if not video_id:
        raise HTTPException(status_code=400, detail="Post has no video_id")

    # Update status to extracting
    execute_query(
        "UPDATE youtube_posts SET transcript_status = ? WHERE id = ?",
        ("extracting", post_id)
    )

    # Extract transcript using youtube-transcript-api
    result = extract_transcript_sync(video_id)

    # Update database with result
    now = datetime.utcnow().isoformat()
    if result["status"] == "completed":
        execute_query(
            """UPDATE youtube_posts
               SET transcript = ?, transcript_status = ?, transcript_error = NULL, transcript_extracted_at = ?
               WHERE id = ?""",
            (result["transcript"], "completed", now, post_id)
        )
    elif result["status"] == "unavailable":
        execute_query(
            """UPDATE youtube_posts
               SET transcript = NULL, transcript_status = ?, transcript_error = ?, transcript_extracted_at = ?
               WHERE id = ?""",
            ("unavailable", result.get("error"), now, post_id)
        )
    else:
        execute_query(
            """UPDATE youtube_posts
               SET transcript = NULL, transcript_status = ?, transcript_error = ?, transcript_extracted_at = ?
               WHERE id = ?""",
            ("failed", result.get("error"), now, post_id)
        )

    # Return updated post transcript info
    updated = fetch_one("SELECT * FROM youtube_posts WHERE id = ?", (post_id,))
    return TranscriptResponse(
        post_id=post_id,
        video_id=video_id,
        transcript=updated.get("transcript"),
        transcript_status=updated.get("transcript_status"),
        transcript_error=updated.get("transcript_error"),
        transcript_extracted_at=updated.get("transcript_extracted_at")
    )


@router.get("/posts/{post_id}/transcript", response_model=TranscriptResponse)
def get_post_transcript(post_id: int) -> TranscriptResponse:
    """Get transcript status and content for a YouTube post."""
    post = fetch_one("SELECT * FROM youtube_posts WHERE id = ?", (post_id,))
    if not post:
        raise HTTPException(status_code=404, detail="YouTube post not found")

    return TranscriptResponse(
        post_id=post_id,
        video_id=post.get("video_id"),
        transcript=post.get("transcript"),
        transcript_status=post.get("transcript_status"),
        transcript_error=post.get("transcript_error"),
        transcript_extracted_at=post.get("transcript_extracted_at")
    )


@router.get("/posts/{post_id}/transcript/download")
def download_post_transcript(post_id: int):
    """Download transcript and metadata as a CSV file."""
    post = fetch_one(
        """SELECT
               video_id,
               title,
               description,
               video_url,
               published_at,
               transcript,
               transcript_status,
               transcript_extracted_at
           FROM youtube_posts
           WHERE id = ?""",
        (post_id,),
    )
    if not post:
        raise HTTPException(status_code=404, detail="YouTube post not found")

    transcript = post.get("transcript")
    if not transcript:
        raise HTTPException(status_code=404, detail="No transcript available")

    # Create filename from title
    title = post.get("title", "transcript")
    # Clean title for filename
    safe_title = "".join(c if c.isalnum() or c in " -_" else "" for c in title)
    safe_title = safe_title[:50].strip() or "transcript"
    filename = f"{safe_title}.csv"

    output = io.StringIO()
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(
        [
            "video_id",
            "title",
            "description",
            "video_url",
            "published_at",
            "transcript",
            "transcript_status",
            "transcript_extracted_at",
        ]
    )
    writer.writerow(
        [
            post.get("video_id"),
            post.get("title"),
            post.get("description") or "",
            post.get("video_url") or "",
            post.get("published_at") or "",
            transcript,
            post.get("transcript_status") or "",
            post.get("transcript_extracted_at") or "",
        ]
    )

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        },
    )
