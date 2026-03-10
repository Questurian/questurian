from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import sys
from typing import Callable, Optional

from features.translation.service.translator import TranslationService, get_translator
from lib.database import execute_query, fetch_one
from lib.dates import normalize_published_at

DEFAULT_SCRAPY_SETTINGS_MODULE = "apps.api.scrapy_settings"
REPO_ROOT = Path(__file__).resolve().parents[4]
API_ROOT = REPO_ROOT / "apps" / "api"


@dataclass(frozen=True)
class ScrapeSourceConfig:
    source_key: str
    feed_table: str
    posts_table: str
    fetch_logs_table: str
    feed_id_column: str
    source_name: str
    default_country: str = "Peru"
    default_section: str = "gastronomia"
    default_language: str = "es"
    max_items: int = 15
    scrapy_settings_module: str = DEFAULT_SCRAPY_SETTINGS_MODULE
    spider_timeout_seconds: int = 60


def _utc_now_isoformat() -> str:
    return datetime.now(timezone.utc).isoformat()


def _summarize_scrapy_error(stderr: str, stdout: str) -> str:
    combined = "\n".join(part.strip() for part in (stderr, stdout) if part and part.strip())
    lowered = combined.lower()

    if "no module named 'apps'" in lowered or 'no module named "apps"' in lowered:
        return (
            "Scrapy could not import apps.api.scrapy_settings. "
            "The scraper must run from the questurian-leads repo root."
        )

    if "scrapy_playwright" in lowered and "no module named" in lowered:
        return "scrapy-playwright is not installed in the API environment."

    if "playwright" in lowered and (
        "executable doesn't exist" in lowered
        or "browser has not been found" in lowered
        or "please run the following command" in lowered
    ):
        return (
            "Playwright Chromium is not installed in the API environment. "
            "Run `python -m playwright install --with-deps chromium`."
        )

    if "timeout" in lowered:
        return "Scrapy spider timed out while waiting for the source page."

    lines = [line.strip() for line in combined.splitlines() if line.strip()]
    return lines[-1] if lines else "Scrapy spider failed without stderr output."


def run_scrapy_spider(
    spider_path: Path,
    *,
    settings_module: str = DEFAULT_SCRAPY_SETTINGS_MODULE,
    timeout_seconds: int = 60,
) -> list[dict]:
    env = os.environ.copy()
    existing_pythonpath = env.get("PYTHONPATH", "")
    pythonpath_parts = [str(REPO_ROOT), str(API_ROOT)]
    if existing_pythonpath:
        pythonpath_parts.append(existing_pythonpath)
    env["PYTHONPATH"] = os.pathsep.join(pythonpath_parts)

    try:
        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "scrapy",
                "runspider",
                str(spider_path),
                "-s",
                f"SCRAPY_SETTINGS_MODULE={settings_module}",
                "-O",
                "-:json",
            ],
            capture_output=True,
            cwd=str(REPO_ROOT),
            env=env,
            text=True,
            timeout=timeout_seconds,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"Spider timed out after {timeout_seconds} seconds.") from exc

    if result.returncode != 0:
        raise RuntimeError(_summarize_scrapy_error(result.stderr, result.stdout))

    payload = result.stdout.strip()
    if not payload:
        return []

    try:
        items = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Spider returned invalid JSON: {exc}") from exc

    return items if isinstance(items, list) else [items]


def _translate_item(
    article: dict,
    *,
    translator: TranslationService,
    default_language: str,
) -> tuple[Optional[str], Optional[str], str, str, Optional[str]]:
    title_translated = None
    excerpt_translated = None
    translation_status = "pending"
    translated_at = None
    detected_language = article.get("language") or default_language

    title = article.get("title")
    if title:
        title_translated, title_status = translator.translate_text(
            title,
            source=detected_language,
            target="en",
        )
        if title_status == "translated":
            translation_status = "translated"
            translated_at = _utc_now_isoformat()

    excerpt = article.get("excerpt")
    if excerpt:
        excerpt_translated, _ = translator.translate_text(
            excerpt,
            source=detected_language,
            target="en",
        )

    return (
        title_translated,
        excerpt_translated,
        detected_language,
        translation_status,
        translated_at,
    )


def _record_fetch_log(
    feed_id: int,
    *,
    config: ScrapeSourceConfig,
    status: str,
    post_count: int,
    error_message: Optional[str],
) -> int:
    return execute_query(
        f"""INSERT INTO {config.fetch_logs_table}
           ({config.feed_id_column}, status, post_count, error_message)
           VALUES (?, ?, ?, ?)""",
        (feed_id, status, post_count, error_message),
    )


def record_fetch_failure(feed_id: int, config: ScrapeSourceConfig, error_message: str) -> dict:
    log_id = _record_fetch_log(
        feed_id,
        config=config,
        status="FAILED",
        post_count=0,
        error_message=error_message,
    )
    return {
        "log_id": log_id,
        "status": "FAILED",
        "post_count": 0,
        "new_post_count": 0,
        "existing_post_count": 0,
        "invalid_post_count": 0,
        "error_message": error_message,
    }


def _persist_scraped_items(
    feed_id: int,
    *,
    feed: dict,
    config: ScrapeSourceConfig,
    scraped_items: list[dict],
    translator: TranslationService,
) -> dict:
    new_post_count = 0
    existing_post_count = 0
    invalid_post_count = 0
    errors: list[str] = []

    if not scraped_items:
        errors.append("No items scraped; check the source HTML or scraper settings.")

    for article in scraped_items[: config.max_items]:
        try:
            url = article.get("url")
            title = article.get("title")
            if not url or not title:
                errors.append("Skipping article - missing URL or title")
                invalid_post_count += 1
                continue

            existing = fetch_one(
                f"SELECT id FROM {config.posts_table} WHERE url = ?",
                (url,),
            )
            if existing:
                existing_post_count += 1
                continue

            (
                title_translated,
                excerpt_translated,
                detected_language,
                translation_status,
                translated_at,
            ) = _translate_item(
                article,
                translator=translator,
                default_language=config.default_language,
            )

            execute_query(
                f"""INSERT INTO {config.posts_table}
                   ({config.feed_id_column}, url, title, published_at, section, country,
                    image_url, excerpt, language, source, approval_status,
                    title_translated, excerpt_translated, detected_language,
                    translation_status, translated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)""",
                (
                    feed_id,
                    url,
                    title,
                    normalize_published_at(article.get("published_at")),
                    article.get("section") or feed.get("section") or config.default_section,
                    article.get("country") or config.default_country,
                    article.get("image_url"),
                    article.get("excerpt"),
                    article.get("language") or config.default_language,
                    article.get("source") or config.source_name,
                    title_translated,
                    excerpt_translated,
                    detected_language,
                    translation_status,
                    translated_at,
                ),
            )
            new_post_count += 1
        except Exception as exc:
            errors.append(f"Article {article.get('url', 'unknown')}: {exc}")
            invalid_post_count += 1

    execute_query(
        f"UPDATE {config.feed_table} SET last_fetched = ? WHERE id = ?",
        (_utc_now_isoformat(), feed_id),
    )

    valid_count = new_post_count + existing_post_count
    if valid_count == 0:
        status = "FAILED"
    elif errors:
        status = "PARTIAL"
    else:
        status = "SUCCESS"

    error_message = "; ".join(errors) if errors else None
    log_id = _record_fetch_log(
        feed_id,
        config=config,
        status=status,
        post_count=new_post_count,
        error_message=error_message,
    )

    return {
        "log_id": log_id,
        "status": status,
        "post_count": new_post_count,
        "new_post_count": new_post_count,
        "existing_post_count": existing_post_count,
        "invalid_post_count": invalid_post_count,
        "error_message": error_message,
    }


def run_scrape_feed(
    feed_id: int,
    *,
    config: ScrapeSourceConfig,
    load_items: Callable[[dict], list[dict]],
    translator: Optional[TranslationService] = None,
) -> dict:
    feed = fetch_one(f"SELECT * FROM {config.feed_table} WHERE id = ?", (feed_id,))
    if not feed:
        raise ValueError(f"Feed {feed_id} not found")

    try:
        scraped_items = load_items(feed)
        return _persist_scraped_items(
            feed_id,
            feed=feed,
            config=config,
            scraped_items=scraped_items,
            translator=translator or get_translator(),
        )
    except Exception as exc:
        return record_fetch_failure(feed_id, config, str(exc))
