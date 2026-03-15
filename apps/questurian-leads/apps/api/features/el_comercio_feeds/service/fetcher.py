"""Service layer for fetching El Comercio articles."""

import asyncio
from pathlib import Path
from typing import Dict, List, Optional
import requests

from features.el_comercio_feeds.service.parser import extract_archive_items
from features.translation.service.translator import TranslationService
from lib.database import fetch_all
from lib.scraping import ScrapeSourceConfig, record_fetch_failure, run_scrape_feed

SOURCE_CONFIG = ScrapeSourceConfig(
    source_key="el_comercio",
    feed_table="el_comercio_feeds",
    posts_table="el_comercio_posts",
    fetch_logs_table="el_comercio_fetch_logs",
    feed_id_column="el_comercio_feed_id",
    source_name="elcomercio",
)
DEFAULT_USER_AGENT = "Mozilla/5.0 (compatible; LeadsManager/1.0)"


def _write_artifact(artifact_dir: Optional[str], filename: str, content: str) -> None:
    if not artifact_dir:
        return
    path = Path(artifact_dir)
    path.mkdir(parents=True, exist_ok=True)
    path.joinpath(filename).write_text(content, encoding="utf-8")


def fetch_html(url: str) -> str:
    try:
        response = requests.get(
            url,
            headers={"User-Agent": DEFAULT_USER_AGENT},
            timeout=30,
        )
        response.raise_for_status()
        response.encoding = response.apparent_encoding or "utf-8"
        return response.text
    except requests.RequestException as exc:
        raise Exception(f"Failed to fetch El Comercio HTML: {exc}") from exc


def fetch_items_via_html(feed_url: str, artifact_dir: Optional[str] = None) -> List[Dict]:
    html = fetch_html(feed_url)
    items = extract_archive_items(html, feed_url)
    if not items:
        _write_artifact(artifact_dir, "el_comercio-response.html", html)
    return items


async def _fetch_items_via_browser(feed_url: str, artifact_dir: Optional[str] = None) -> List[Dict]:
    from playwright.async_api import async_playwright

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        page = await browser.new_page(user_agent=DEFAULT_USER_AGENT)
        page.set_default_timeout(60000)

        try:
            await page.goto(feed_url, wait_until="domcontentloaded", timeout=60000)
            await page.wait_for_timeout(1500)
            for _ in range(3):
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                await page.wait_for_timeout(1500)

            html = await page.content()
            items = extract_archive_items(html, feed_url)
            if not items and artifact_dir:
                _write_artifact(artifact_dir, "el_comercio-rendered.html", html)
                await page.screenshot(
                    path=str(Path(artifact_dir) / "el_comercio-rendered.png"),
                    full_page=True,
                )
            return items
        except Exception:
            if artifact_dir:
                try:
                    html = await page.content()
                except Exception:
                    html = ""
                if html:
                    _write_artifact(artifact_dir, "el_comercio-browser-error.html", html)
                try:
                    await page.screenshot(
                        path=str(Path(artifact_dir) / "el_comercio-browser-error.png"),
                        full_page=True,
                    )
                except Exception:
                    pass
            raise
        finally:
            await browser.close()


def fetch_items_via_browser(feed_url: str, artifact_dir: Optional[str] = None) -> List[Dict]:
    return asyncio.run(_fetch_items_via_browser(feed_url, artifact_dir=artifact_dir))


def _load_scraped_items(feed: dict, artifact_dir: Optional[str] = None) -> List[Dict]:
    try:
        items = fetch_items_via_html(feed["url"], artifact_dir=artifact_dir)
        if items:
            return items
    except Exception as exc:
        _write_artifact(artifact_dir, "el_comercio-http-error.txt", str(exc))
    return fetch_items_via_browser(feed["url"], artifact_dir=artifact_dir)


def fetch_el_comercio_feed(
    feed_id: int,
    translator: Optional[TranslationService] = None,
    artifact_dir: Optional[str] = None,
    max_items_floor: Optional[int] = None,
) -> Dict:
    return run_scrape_feed(
        feed_id,
        config=SOURCE_CONFIG,
        load_items=lambda feed: _load_scraped_items(feed, artifact_dir=artifact_dir),
        translator=translator,
        max_items_floor=max_items_floor,
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
