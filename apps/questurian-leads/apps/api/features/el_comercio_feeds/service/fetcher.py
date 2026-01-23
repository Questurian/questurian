"""
Service layer for fetching El Comercio articles.

Handles scraping orchestration, translation, and database operations.
"""

from datetime import datetime
from pathlib import Path
from typing import Dict, List
import sqlite3
import subprocess
import json
import sys
import os

from features.translation.service.translator import get_translator

DEFAULT_COUNTRY = "Peru"

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


def run_spider() -> List[Dict]:
    """
    Run Scrapy spider to scrape articles.

    Uses subprocess to avoid CrawlerProcess limitation (can only run once per process).
    Returns list of scraped article dicts.
    """
    # Get the project root directory
    project_root = Path(__file__).parent.parent.parent.parent.parent

    # Run spider using scrapy command
    try:
        spider_path = Path(__file__).parent / "spider.py"

        # Use scrapy runspider command with proper output format and settings
        result = subprocess.run(
            [
                sys.executable, "-m", "scrapy", "runspider",
                str(spider_path),
                "-s", "SCRAPY_SETTINGS_MODULE=apps.api.scrapy_settings",
                "-O", "-:json"  # Output to stdout in JSON format
            ],
            capture_output=True,
            text=True,
            timeout=60,
            cwd=str(project_root)
        )

        if result.returncode != 0:
            raise Exception(f"Spider failed: {result.stderr}")

        # Parse JSON output
        if result.stdout.strip():
            items = json.loads(result.stdout)
            return items if isinstance(items, list) else [items]
        else:
            return []

    except subprocess.TimeoutExpired:
        raise Exception("Spider timeout after 60 seconds")
    except json.JSONDecodeError as e:
        raise Exception(f"Failed to parse spider output: {e}")
    except Exception as e:
        raise Exception(f"Spider execution failed: {str(e)}")


def fetch_el_comercio_feed(feed_id: int) -> Dict:
    """
    Scrape El Comercio articles and save to database.

    Strategy: DELETE all existing posts, INSERT fresh 15 articles.
    Blocks for 10-30 seconds while scraping.

    Returns:
        Dict with log_id, status, post_count, error_message
    """
    feed = fetch_one("SELECT * FROM el_comercio_feeds WHERE id = ?", (feed_id,))
    if not feed:
        raise ValueError(f"Feed {feed_id} not found")

    try:
        # Run spider to scrape articles
        scraped_items = run_spider()

        post_count = 0
        errors = []
        translator = get_translator()

        # DELETE all existing posts for this feed
        execute_query(
            "DELETE FROM el_comercio_posts WHERE el_comercio_feed_id = ?",
            (feed_id,)
        )

        # INSERT fresh articles (limit to 15)
        for article in scraped_items[:15]:
            try:
                # Skip if missing required fields
                if not article.get('url') or not article.get('title'):
                    errors.append(f"Skipping article - missing URL or title")
                    continue

                # Auto-translate title and excerpt
                title_translated = None
                excerpt_translated = None
                detected_language = 'es'
                translation_status = 'pending'
                translated_at = None

                if article.get('title'):
                    title_translated, trans_status = translator.translate_text(
                        article['title'], source='es', target='en'
                    )
                    if trans_status == 'translated':
                        translation_status = 'translated'
                        translated_at = datetime.utcnow().isoformat()

                if article.get('excerpt'):
                    excerpt_translated, _ = translator.translate_text(
                        article['excerpt'], source='es', target='en'
                    )

                # Insert article with translation and approval fields
                execute_query(
                    """INSERT INTO el_comercio_posts
                       (el_comercio_feed_id, url, title, published_at, section,
                        country, image_url, excerpt, language, source, approval_status,
                        title_translated, excerpt_translated, detected_language,
                        translation_status, translated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)""",
                    (feed_id, article['url'], article['title'],
                     article.get('published_at'), 'gastronomia',
                     DEFAULT_COUNTRY, article.get('image_url'), article.get('excerpt'),
                     'es', 'elcomercio',
                     title_translated, excerpt_translated, detected_language,
                     translation_status, translated_at)
                )
                post_count += 1

            except Exception as e:
                errors.append(f"Article {article.get('url', 'unknown')}: {str(e)}")

        # Update feed metadata
        execute_query(
            "UPDATE el_comercio_feeds SET last_fetched = ? WHERE id = ?",
            (datetime.utcnow().isoformat(), feed_id)
        )

        # Create fetch log
        status = "SUCCESS" if post_count == 15 else "PARTIAL" if post_count > 0 else "FAILED"
        error_message = "; ".join(errors) if errors else None

        log_id = execute_query(
            """INSERT INTO el_comercio_fetch_logs
               (el_comercio_feed_id, status, post_count, error_message)
               VALUES (?, ?, ?, ?)""",
            (feed_id, status, post_count, error_message)
        )

        return {
            "log_id": log_id,
            "status": status,
            "post_count": post_count,
            "error_message": error_message
        }

    except Exception as e:
        # Create failed fetch log
        error_message = str(e)
        log_id = execute_query(
            """INSERT INTO el_comercio_fetch_logs
               (el_comercio_feed_id, status, post_count, error_message)
               VALUES (?, ?, ?, ?)""",
            (feed_id, "FAILED", 0, error_message)
        )

        return {
            "log_id": log_id,
            "status": "FAILED",
            "post_count": 0,
            "error_message": error_message
        }


def fetch_all_active_el_comercio_feeds() -> List[Dict]:
    """
    Fetch all active El Comercio feeds.
    Returns list of fetch results.
    """
    feeds = fetch_all(
        "SELECT id, display_name FROM el_comercio_feeds WHERE is_active = 1",
        ()
    )
    results = []

    for feed in feeds:
        try:
            result = fetch_el_comercio_feed(feed["id"])
            results.append({
                "el_comercio_feed_id": feed["id"],
                "display_name": feed["display_name"],
                **result
            })
        except Exception as e:
            results.append({
                "el_comercio_feed_id": feed["id"],
                "display_name": feed["display_name"],
                "status": "FAILED",
                "post_count": 0,
                "error_message": str(e)
            })

    return results
