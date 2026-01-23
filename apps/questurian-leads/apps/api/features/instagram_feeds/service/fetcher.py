from datetime import datetime
from typing import Dict, List
from pathlib import Path
import sqlite3

from features.instagram_feeds.service.instagram_client import (
    fetch_instagram_posts,
    InstagramAPIError
)
from features.translation.service.translator import get_translator

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

def fetch_instagram_feed(feed_id: int) -> Dict:
    """
    Fetch Instagram posts for a feed and save new posts to database.

    Returns:
        Dict with status, post_count, next_max_id, error_message
    """
    feed = fetch_one("SELECT * FROM instagram_feeds WHERE id = ?", (feed_id,))
    if not feed:
        raise ValueError(f"Instagram feed {feed_id} not found")
    feed_country = (feed.get("country") or "").strip()
    if not feed_country:
        raise ValueError("Instagram feed country is required. Set country on the feed before fetching.")

    try:
        # Fetch posts from Instagram API
        result = fetch_instagram_posts(
            username=feed["username"],
            max_id=feed.get("last_max_id") or ""
        )

        posts = result["posts"]
        next_max_id = result["next_max_id"]
        post_count = 0
        errors = []

        # Get translator for language detection and translation
        translator = get_translator()

        # Insert new posts into database
        for post in posts:
            try:
                # Check if post already exists
                existing = fetch_one(
                    "SELECT id FROM instagram_posts WHERE post_id = ?",
                    (post.post_id,)
                )

                if not existing:
                    # Auto-detect language and translate caption if not English
                    caption_translated = None
                    detected_language = None
                    translation_status = 'already_english'
                    translated_at = None

                    if post.caption:
                        detected_language = translator.detect_language(post.caption)

                        if detected_language and detected_language != 'en':
                            caption_translated, trans_status = translator.translate_text(
                                post.caption, source=detected_language, target='en'
                            )
                            translation_status = 'translated'
                            translated_at = datetime.utcnow().isoformat()

                    execute_query(
                        """INSERT INTO instagram_posts
                           (instagram_feed_id, post_id, username, country, caption, media_type,
                            media_url, thumbnail_url, like_count, comment_count,
                            view_count, posted_at, permalink, approval_status,
                            caption_translated, detected_language, translation_status, translated_at)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (feed_id, post.post_id, post.username, feed_country, post.caption,
                         post.media_type, post.media_url, post.thumbnail_url,
                         post.like_count, post.comment_count, post.view_count,
                         post.posted_at, post.permalink, 'pending',
                         caption_translated, detected_language, translation_status, translated_at)
                    )
                    post_count += 1
            except Exception as e:
                errors.append(f"Post {post.post_id}: {str(e)}")

        # Update feed metadata
        execute_query(
            """UPDATE instagram_feeds
               SET last_fetched = ?, last_max_id = ?
               WHERE id = ?""",
            (datetime.utcnow().isoformat(), next_max_id, feed_id)
        )

        # Create fetch log
        status = "SUCCESS" if not errors else "PARTIAL"
        error_message = "; ".join(errors) if errors else None

        log_id = execute_query(
            """INSERT INTO instagram_fetch_logs
               (instagram_feed_id, status, post_count, max_id, error_message)
               VALUES (?, ?, ?, ?, ?)""",
            (feed_id, status, post_count, next_max_id, error_message)
        )

        return {
            "log_id": log_id,
            "status": status,
            "post_count": post_count,
            "next_max_id": next_max_id,
            "error_message": error_message
        }

    except InstagramAPIError as e:
        # Create failed fetch log
        error_message = str(e)
        log_id = execute_query(
            """INSERT INTO instagram_fetch_logs
               (instagram_feed_id, status, post_count, max_id, error_message)
               VALUES (?, ?, ?, ?, ?)""",
            (feed_id, "FAILED", 0, None, error_message)
        )

        return {
            "log_id": log_id,
            "status": "FAILED",
            "post_count": 0,
            "next_max_id": None,
            "error_message": error_message
        }

def fetch_all_active_instagram_feeds() -> List[Dict]:
    """
    Fetch all active Instagram feeds.
    Returns list of fetch results.
    """
    feeds = fetch_all(
        "SELECT id, username FROM instagram_feeds WHERE is_active = 1",
        ()
    )
    results = []

    for feed in feeds:
        try:
            result = fetch_instagram_feed(feed["id"])
            results.append({
                "instagram_feed_id": feed["id"],
                "username": feed["username"],
                **result
            })
        except Exception as e:
            results.append({
                "instagram_feed_id": feed["id"],
                "username": feed["username"],
                "status": "FAILED",
                "post_count": 0,
                "next_max_id": None,
                "error_message": str(e)
            })

    return results
