"""Service layer for fetching El Comercio articles."""

from pathlib import Path
from typing import Dict, List, Optional

from features.translation.service.translator import TranslationService
from lib.database import fetch_all
from lib.scraping import ScrapeSourceConfig, record_fetch_failure, run_scrape_feed, run_scrapy_spider

SOURCE_CONFIG = ScrapeSourceConfig(
    source_key="el_comercio",
    feed_table="el_comercio_feeds",
    posts_table="el_comercio_posts",
    fetch_logs_table="el_comercio_fetch_logs",
    feed_id_column="el_comercio_feed_id",
    source_name="elcomercio",
)


def run_spider() -> List[Dict]:
    return run_scrapy_spider(
        Path(__file__).parent / "spider.py",
        settings_module=SOURCE_CONFIG.scrapy_settings_module,
        timeout_seconds=SOURCE_CONFIG.spider_timeout_seconds,
    )


def _load_scraped_items(_feed: dict) -> List[Dict]:
    return run_spider()


def fetch_el_comercio_feed(
    feed_id: int,
    translator: Optional[TranslationService] = None,
) -> Dict:
    return run_scrape_feed(
        feed_id,
        config=SOURCE_CONFIG,
        load_items=_load_scraped_items,
        translator=translator,
    )


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
            results.append(
                {
                    "el_comercio_feed_id": feed["id"],
                    "display_name": feed["display_name"],
                    **record_fetch_failure(feed["id"], SOURCE_CONFIG, str(e)),
                }
            )

    return results
