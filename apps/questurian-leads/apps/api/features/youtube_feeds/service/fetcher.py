from datetime import datetime
from pathlib import Path
from typing import Dict, List
import sqlite3

from features.youtube_feeds.service.youtube_client import (
    fetch_youtube_videos,
    YouTubeAPIError,
)

DATABASE_PATH = Path(__file__).parent.parent.parent.parent / "leads.db"


def fetch_one(query: str, params: tuple) -> dict | None:
    """Helper to fetch one row from database."""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    result = cursor.execute(query, params).fetchone()
    conn.close()
    return dict(result) if result else None


def fetch_all(query: str, params: tuple) -> list:
    """Helper to fetch all rows from database."""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    results = cursor.execute(query, params).fetchall()
    conn.close()
    return [dict(row) for row in results]


def execute_query(query: str, params: tuple) -> int:
    """Helper to execute query and return lastrowid."""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    cursor.execute(query, params)
    lastrowid = cursor.lastrowid
    conn.commit()
    conn.close()
    return lastrowid


def fetch_youtube_feed(feed_id: int, max_results: int = 5) -> Dict:
    """
    Fetch YouTube videos for a feed and save new posts to database.

    Returns:
        Dict with status, post_count, error_message
    """
    feed = fetch_one("SELECT * FROM youtube_feeds WHERE id = ?", (feed_id,))
    if not feed:
        raise ValueError(f"YouTube feed {feed_id} not found")

    try:
        videos = fetch_youtube_videos(
            channel_id=feed["channel_id"],
            max_results=max_results,
        )

        post_count = 0
        errors = []

        for video in videos:
            try:
                existing = fetch_one(
                    "SELECT id FROM youtube_posts WHERE video_id = ?",
                    (video.video_id,),
                )
                if existing:
                    continue

                execute_query(
                    """INSERT INTO youtube_posts
                       (youtube_feed_id, video_id, title, description, published_at,
                        thumbnail_url, video_url)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (
                        feed_id,
                        video.video_id,
                        video.title,
                        video.description,
                        video.published_at,
                        video.thumbnail_url,
                        video.video_url,
                    ),
                )
                post_count += 1
            except Exception as exc:
                errors.append(f"Video {video.video_id}: {exc}")

        execute_query(
            "UPDATE youtube_feeds SET last_fetched = ? WHERE id = ?",
            (datetime.utcnow().isoformat(), feed_id),
        )

        status = "SUCCESS" if not errors else "PARTIAL"
        error_message = "; ".join(errors) if errors else None

        log_id = execute_query(
            """INSERT INTO youtube_fetch_logs
               (youtube_feed_id, status, post_count, max_results, error_message)
               VALUES (?, ?, ?, ?, ?)""",
            (feed_id, status, post_count, max_results, error_message),
        )

        return {
            "log_id": log_id,
            "status": status,
            "post_count": post_count,
            "error_message": error_message,
        }

    except YouTubeAPIError as exc:
        error_message = str(exc)
        log_id = execute_query(
            """INSERT INTO youtube_fetch_logs
               (youtube_feed_id, status, post_count, max_results, error_message)
               VALUES (?, ?, ?, ?, ?)""",
            (feed_id, "FAILED", 0, max_results, error_message),
        )

        return {
            "log_id": log_id,
            "status": "FAILED",
            "post_count": 0,
            "error_message": error_message,
        }


def fetch_all_active_youtube_feeds(max_results: int = 5) -> List[Dict]:
    """Fetch all active YouTube feeds."""
    feeds = fetch_all(
        "SELECT id, channel_id, display_name FROM youtube_feeds WHERE is_active = 1",
        (),
    )
    results = []

    for feed in feeds:
        try:
            result = fetch_youtube_feed(feed["id"], max_results=max_results)
            results.append(
                {
                    "youtube_feed_id": feed["id"],
                    "channel_id": feed["channel_id"],
                    "display_name": feed["display_name"],
                    **result,
                }
            )
        except Exception as exc:
            results.append(
                {
                    "youtube_feed_id": feed["id"],
                    "channel_id": feed["channel_id"],
                    "display_name": feed["display_name"],
                    "status": "FAILED",
                    "post_count": 0,
                    "error_message": str(exc),
                }
            )

    return results
