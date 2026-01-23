"""
Service layer for fetching Diario Correo articles.

Handles scraping orchestration, translation, and database operations.
"""

from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any
import sqlite3
import subprocess
import json
import sys
import re
import urllib.parse
import requests

from features.translation.service.translator import get_translator

DEFAULT_COUNTRY = "Peru"

DATABASE_PATH = Path(__file__).parent.parent.parent.parent / "leads.db"
FUSION_CONTENT_CACHE_PATTERN = re.compile(
    r"Fusion\.contentCache=({.*?});(?:\s*Fusion\.|\s*$)",
    re.S,
)
DEFAULT_USER_AGENT = "Mozilla/5.0 (compatible; LeadsManager/1.0)"


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


def fetch_html(url: str) -> str:
    """Fetch raw HTML for a page using a stable user-agent."""
    try:
        response = requests.get(
            url,
            headers={"User-Agent": DEFAULT_USER_AGENT},
            timeout=30
        )
        response.raise_for_status()
        response.encoding = response.apparent_encoding or "utf-8"
        return response.text
    except requests.exceptions.SSLError as exc:
        raise Exception(
            "SSL verification failed while fetching Diario Correo HTML. "
            "If this is local dev, install/update CA certificates or configure "
            "REQUESTS_CA_BUNDLE to a valid cert store."
        ) from exc
    except requests.RequestException as exc:
        raise Exception(f"Failed to fetch Diario Correo HTML: {exc}") from exc


def extract_content_cache(html: str) -> Optional[Dict[str, Any]]:
    """Extract Fusion.contentCache JSON from HTML."""
    scripts = re.findall(r"<script[^>]*>(.*?)</script>", html, re.S)
    script = next((s for s in scripts if "Fusion.contentCache" in s), "")
    if not script:
        return None

    match = FUSION_CONTENT_CACHE_PATTERN.search(script)
    if not match:
        return None

    try:
        return json.loads(match.group(1))
    except json.JSONDecodeError:
        return None


def get_section_feed(cache: Dict[str, Any], section: str) -> Optional[Dict[str, Any]]:
    """Find section feed data for the requested section."""
    feeds = cache.get("story-feed-by-section", {})
    if not feeds:
        return None

    for key, value in feeds.items():
        if f'"section":"{section}"' in key and '"feedOffset":0' in key:
            return value.get("data")

    for key, value in feeds.items():
        if section in key:
            return value.get("data")

    return None


def get_title(element: Dict[str, Any]) -> Optional[str]:
    headlines = element.get("headlines", {}) if isinstance(element, dict) else {}
    return headlines.get("basic") or headlines.get("web") or headlines.get("mobile")


def get_excerpt(element: Dict[str, Any]) -> Optional[str]:
    description = element.get("description", {}) if isinstance(element, dict) else {}
    excerpt = description.get("basic")
    if not excerpt:
        subheadlines = element.get("subheadlines", {}) if isinstance(element, dict) else {}
        excerpt = subheadlines.get("basic")

    return excerpt.strip()[:500] if excerpt else None


def get_image_url(element: Dict[str, Any], base_url: str) -> Optional[str]:
    promo_items = element.get("promo_items", {}) if isinstance(element, dict) else {}
    if not isinstance(promo_items, dict):
        return None

    basic = promo_items.get("basic")
    if not isinstance(basic, dict):
        return None

    image_url = basic.get("url")
    if not image_url:
        resized = basic.get("resized_urls", {})
        if isinstance(resized, dict):
            for key in ("landscape_md", "landscape_s", "landscape_xs", "landscape_l", "story_small", "content"):
                if resized.get(key):
                    image_url = resized[key]
                    break

    if image_url and image_url.startswith("/"):
        image_url = urllib.parse.urljoin(base_url, image_url)

    return image_url


def fetch_items_via_html(feed_url: str, section_slug: str) -> List[Dict]:
    """Fallback HTML parser to extract items without Scrapy."""
    html = fetch_html(feed_url)
    cache = extract_content_cache(html)
    if not cache:
        return []

    section = f"/{section_slug.lstrip('/')}"
    feed_data = get_section_feed(cache, section)
    if not feed_data:
        return []

    elements = feed_data.get("content_elements", [])
    items = []

    for element in elements:
        if element.get("type") != "story":
            continue

        title = get_title(element)
        url = element.get("website_url") or element.get("canonical_url")
        if url and not url.startswith("http"):
            url = urllib.parse.urljoin(feed_url, url)

        published_at = (
            element.get("display_date")
            or element.get("publish_date")
            or element.get("first_publish_date")
        )
        excerpt = get_excerpt(element)
        image_url = get_image_url(element, feed_url)

        if title and url:
            items.append({
                "url": url,
                "title": title.strip(),
                "published_at": published_at,
                "section": section_slug,
                "image_url": image_url,
                "excerpt": excerpt,
                "language": "es",
                "source": "diariocorreo",
            })

    return items


def run_spider() -> List[Dict]:
    """
    Run Scrapy spider to scrape articles.

    Uses subprocess to avoid CrawlerProcess limitation (can only run once per process).
    Returns list of scraped article dicts.
    """
    project_root = Path(__file__).parent.parent.parent.parent.parent

    try:
        spider_path = Path(__file__).parent / "spider.py"
        result = subprocess.run(
            [
                sys.executable, "-m", "scrapy", "runspider",
                str(spider_path),
                "-s", "SCRAPY_SETTINGS_MODULE=apps.api.scrapy_settings",
                "-O", "-:json"
            ],
            capture_output=True,
            text=True,
            timeout=60,
            cwd=str(project_root)
        )

        if result.returncode != 0:
            raise Exception(f"Spider failed: {result.stderr}")

        if result.stdout.strip():
            items = json.loads(result.stdout)
            return items if isinstance(items, list) else [items]
        return []

    except subprocess.TimeoutExpired:
        raise Exception("Spider timeout after 60 seconds")
    except json.JSONDecodeError as e:
        raise Exception(f"Failed to parse spider output: {e}")
    except Exception as e:
        raise Exception(f"Spider execution failed: {str(e)}")


def fetch_diario_correo_feed(feed_id: int) -> Dict:
    """
    Scrape Diario Correo articles and save to database.

    Strategy: DELETE all existing posts, INSERT fresh 15 articles.
    Blocks for 10-30 seconds while scraping.

    Returns:
        Dict with log_id, status, post_count, error_message
    """
    feed = fetch_one("SELECT * FROM diario_correo_feeds WHERE id = ?", (feed_id,))
    if not feed:
        raise ValueError(f"Feed {feed_id} not found")

    try:
        scraped_items = run_spider()
        if not scraped_items:
            scraped_items = fetch_items_via_html(feed["url"], feed.get("section") or "gastronomia")

        post_count = 0
        errors = []
        translator = get_translator()

        if not scraped_items:
            errors.append("No items scraped; check the source HTML or scraper settings.")

        execute_query(
            "DELETE FROM diario_correo_posts WHERE diario_correo_feed_id = ?",
            (feed_id,)
        )

        for article in scraped_items[:15]:
            try:
                if not article.get("url") or not article.get("title"):
                    errors.append("Skipping article - missing URL or title")
                    continue

                title_translated = None
                excerpt_translated = None
                detected_language = "es"
                translation_status = "pending"
                translated_at = None

                if article.get("title"):
                    title_translated, trans_status = translator.translate_text(
                        article["title"], source="es", target="en"
                    )
                    if trans_status == "translated":
                        translation_status = "translated"
                        translated_at = datetime.utcnow().isoformat()

                if article.get("excerpt"):
                    excerpt_translated, _ = translator.translate_text(
                        article["excerpt"], source="es", target="en"
                    )

                execute_query(
                    """INSERT INTO diario_correo_posts
                       (diario_correo_feed_id, url, title, published_at, section,
                        country, image_url, excerpt, language, source, approval_status,
                        title_translated, excerpt_translated, detected_language,
                        translation_status, translated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)""",
                    (
                        feed_id,
                        article["url"],
                        article["title"],
                        article.get("published_at"),
                        article.get("section") or feed.get("section"),
                        DEFAULT_COUNTRY,
                        article.get("image_url"),
                        article.get("excerpt"),
                        "es",
                        "diariocorreo",
                        title_translated,
                        excerpt_translated,
                        detected_language,
                        translation_status,
                        translated_at,
                    )
                )
                post_count += 1
            except Exception as e:
                errors.append(f"Article {article.get('url', 'unknown')}: {str(e)}")

        execute_query(
            "UPDATE diario_correo_feeds SET last_fetched = ? WHERE id = ?",
            (datetime.utcnow().isoformat(), feed_id)
        )

        status = "SUCCESS" if post_count == 15 else "PARTIAL" if post_count > 0 else "FAILED"
        error_message = "; ".join(errors) if errors else None

        log_id = execute_query(
            """INSERT INTO diario_correo_fetch_logs
               (diario_correo_feed_id, status, post_count, error_message)
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
        error_message = str(e)
        log_id = execute_query(
            """INSERT INTO diario_correo_fetch_logs
               (diario_correo_feed_id, status, post_count, error_message)
               VALUES (?, ?, ?, ?)""",
            (feed_id, "FAILED", 0, error_message)
        )

        return {
            "log_id": log_id,
            "status": "FAILED",
            "post_count": 0,
            "error_message": error_message
        }


def fetch_all_active_diario_correo_feeds() -> List[Dict]:
    """
    Fetch all active Diario Correo feeds.
    Returns list of fetch results.
    """
    feeds = fetch_all(
        "SELECT id, display_name FROM diario_correo_feeds WHERE is_active = 1",
        ()
    )
    results = []

    for feed in feeds:
        try:
            result = fetch_diario_correo_feed(feed["id"])
            results.append({
                "diario_correo_feed_id": feed["id"],
                "display_name": feed["display_name"],
                **result
            })
        except Exception as e:
            results.append({
                "diario_correo_feed_id": feed["id"],
                "display_name": feed["display_name"],
                "status": "FAILED",
                "post_count": 0,
                "error_message": str(e)
            })

    return results
