"""Service layer for fetching Diario Correo articles."""

from pathlib import Path
from typing import Dict, List, Optional
import requests

from features.diario_correo_feeds.service.parser import extract_section_items
from features.translation.service.translator import TranslationService
from lib.database import fetch_all
from lib.scraping import ScrapeSourceConfig, record_fetch_failure, run_scrape_feed, run_scrapy_spider

SOURCE_CONFIG = ScrapeSourceConfig(
    source_key="diario_correo",
    feed_table="diario_correo_feeds",
    posts_table="diario_correo_posts",
    fetch_logs_table="diario_correo_fetch_logs",
    feed_id_column="diario_correo_feed_id",
    source_name="diariocorreo",
)
DEFAULT_USER_AGENT = "Mozilla/5.0 (compatible; LeadsManager/1.0)"

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


def fetch_items_via_html(feed_url: str, section_slug: str) -> List[Dict]:
    """Fallback HTML parser to extract items without Scrapy."""
    html = fetch_html(feed_url)
    return extract_section_items(html, feed_url=feed_url, section_slug=section_slug)


def run_spider() -> List[Dict]:
    return run_scrapy_spider(
        Path(__file__).parent / "spider.py",
        settings_module=SOURCE_CONFIG.scrapy_settings_module,
        timeout_seconds=SOURCE_CONFIG.spider_timeout_seconds,
    )


def _load_scraped_items(feed: dict) -> List[Dict]:
    scraped_items = run_spider()
    if scraped_items:
        return scraped_items
    return fetch_items_via_html(feed["url"], feed.get("section") or SOURCE_CONFIG.default_section)


def fetch_diario_correo_feed(
    feed_id: int,
    translator: Optional[TranslationService] = None,
) -> Dict:
    return run_scrape_feed(
        feed_id,
        config=SOURCE_CONFIG,
        load_items=_load_scraped_items,
        translator=translator,
    )


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
            results.append(
                {
                    "diario_correo_feed_id": feed["id"],
                    "display_name": feed["display_name"],
                    **record_fetch_failure(feed["id"], SOURCE_CONFIG, str(e)),
                }
            )

    return results
