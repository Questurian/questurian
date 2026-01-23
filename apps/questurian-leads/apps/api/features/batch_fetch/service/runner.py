import json
import os
import random
import time
from datetime import datetime, timedelta, timezone
from threading import Thread
from typing import Dict, List, Optional

from lib.database import execute_many, execute_query, fetch_all, fetch_one
from features.feeds.service.fetcher import fetch_feed
from features.instagram_feeds.service.fetcher import fetch_instagram_feed
from features.youtube_feeds.service.fetcher import fetch_youtube_feed
from features.el_comercio_feeds.service.fetcher import fetch_el_comercio_feed
from features.diario_correo_feeds.service.fetcher import fetch_diario_correo_feed

DEFAULT_SKIP_HOURS = 24
DEFAULT_INSTAGRAM_DELAY_MIN = 5
DEFAULT_INSTAGRAM_DELAY_MAX = 10

EL_COMERCIO_DEFAULT_CATEGORY_NAME = "Peru"
EL_COMERCIO_DEFAULT_FEED_URL = "https://elcomercio.pe/archivo/gastronomia/"
EL_COMERCIO_DEFAULT_DISPLAY_NAME = "El Comercio Gastronomia"
EL_COMERCIO_DEFAULT_SECTION = "gastronomia"
EL_COMERCIO_DEFAULT_FETCH_INTERVAL = 60

DIARIO_CORREO_DEFAULT_CATEGORY_NAME = "Peru"
DIARIO_CORREO_DEFAULT_FEED_URL = "https://diariocorreo.pe/gastronomia/"
DIARIO_CORREO_DEFAULT_DISPLAY_NAME = "Diario Correo Gastronomia"
DIARIO_CORREO_DEFAULT_SECTION = "gastronomia"
DIARIO_CORREO_DEFAULT_FETCH_INTERVAL = 60


def _get_skip_hours() -> int:
    raw = os.getenv("BATCH_FETCH_SKIP_HOURS", "")
    try:
        value = int(raw)
    except (TypeError, ValueError):
        value = DEFAULT_SKIP_HOURS
    return max(0, value)


def _get_instagram_delay_range() -> tuple[float, float]:
    min_raw = os.getenv("INSTAGRAM_FETCH_DELAY_MIN_SECONDS", "")
    max_raw = os.getenv("INSTAGRAM_FETCH_DELAY_MAX_SECONDS", "")
    try:
        delay_min = float(min_raw)
    except (TypeError, ValueError):
        delay_min = float(DEFAULT_INSTAGRAM_DELAY_MIN)
    try:
        delay_max = float(max_raw)
    except (TypeError, ValueError):
        delay_max = float(DEFAULT_INSTAGRAM_DELAY_MAX)
    delay_min = max(0.0, delay_min)
    delay_max = max(0.0, delay_max)
    if delay_max < delay_min:
        delay_min, delay_max = delay_max, delay_min
    return delay_min, delay_max


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        if value.endswith("Z"):
            value = value.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(value)
        if parsed.tzinfo is not None:
            parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
        return parsed
    except ValueError:
        return None


def _should_skip(last_fetched: Optional[str], skip_hours: int) -> tuple[bool, Optional[str]]:
    if skip_hours <= 0:
        return False, None
    fetched_at = _parse_iso(last_fetched)
    if not fetched_at:
        return False, None
    now = datetime.utcnow()
    if fetched_at > now:
        return True, "Last fetched timestamp is in the future."
    if now - fetched_at < timedelta(hours=skip_hours):
        return True, f"Fetched within the last {skip_hours} hours."
    return False, None


def _ensure_category(name: str) -> int:
    row = fetch_one("SELECT id FROM categories WHERE name = ?", (name,))
    if row:
        return row["id"]
    return execute_query("INSERT INTO categories (name) VALUES (?)", (name,))


def _ensure_el_comercio_feed() -> dict:
    feed = fetch_one("SELECT * FROM el_comercio_feeds ORDER BY id LIMIT 1", ())
    if feed:
        return feed
    category_id = _ensure_category(EL_COMERCIO_DEFAULT_CATEGORY_NAME)
    feed_id = execute_query(
        """INSERT INTO el_comercio_feeds
           (category_id, url, display_name, section, fetch_interval, is_active)
           VALUES (?, ?, ?, ?, ?, 1)""",
        (
            category_id,
            EL_COMERCIO_DEFAULT_FEED_URL,
            EL_COMERCIO_DEFAULT_DISPLAY_NAME,
            EL_COMERCIO_DEFAULT_SECTION,
            EL_COMERCIO_DEFAULT_FETCH_INTERVAL,
        ),
    )
    return fetch_one("SELECT * FROM el_comercio_feeds WHERE id = ?", (feed_id,))


def _ensure_diario_correo_feed() -> dict:
    feed = fetch_one("SELECT * FROM diario_correo_feeds ORDER BY id LIMIT 1", ())
    if feed:
        return feed
    category_id = _ensure_category(DIARIO_CORREO_DEFAULT_CATEGORY_NAME)
    feed_id = execute_query(
        """INSERT INTO diario_correo_feeds
           (category_id, url, display_name, section, fetch_interval, is_active)
           VALUES (?, ?, ?, ?, ?, 1)""",
        (
            category_id,
            DIARIO_CORREO_DEFAULT_FEED_URL,
            DIARIO_CORREO_DEFAULT_DISPLAY_NAME,
            DIARIO_CORREO_DEFAULT_SECTION,
            DIARIO_CORREO_DEFAULT_FETCH_INTERVAL,
        ),
    )
    return fetch_one("SELECT * FROM diario_correo_feeds WHERE id = ?", (feed_id,))


def _update_job(job_id: int, **fields: object) -> None:
    if not fields:
        return
    columns = ", ".join([f"{key} = ?" for key in fields.keys()])
    params = list(fields.values()) + [job_id]
    execute_query(f"UPDATE batch_fetch_jobs SET {columns} WHERE id = ?", tuple(params))


def _update_step(step_id: int, **fields: object) -> None:
    if not fields:
        return
    columns = ", ".join([f"{key} = ?" for key in fields.keys()])
    params = list(fields.values()) + [step_id]
    execute_query(f"UPDATE batch_fetch_job_steps SET {columns} WHERE id = ?", tuple(params))


def _get_feed_state(source_type: str, source_id: Optional[int]) -> Optional[dict]:
    if source_id is None:
        return None
    if source_type == "rss":
        return fetch_one("SELECT last_fetched, is_active FROM feeds WHERE id = ?", (source_id,))
    if source_type == "instagram":
        return fetch_one("SELECT last_fetched, is_active FROM instagram_feeds WHERE id = ?", (source_id,))
    if source_type == "youtube":
        return fetch_one("SELECT last_fetched, is_active FROM youtube_feeds WHERE id = ?", (source_id,))
    if source_type == "el_comercio":
        return fetch_one("SELECT last_fetched, is_active FROM el_comercio_feeds WHERE id = ?", (source_id,))
    if source_type == "diario_correo":
        return fetch_one("SELECT last_fetched, is_active FROM diario_correo_feeds WHERE id = ?", (source_id,))
    return None


def _format_step_label(step: dict) -> str:
    name = step.get("source_name") or ""
    if step.get("source_type") == "instagram" and name and not name.startswith("@"):
        name = f"@{name}"
    if name:
        return f"{step.get('source_type')}: {name}"
    return str(step.get("source_type"))


def create_batch_fetch_job(force: bool = False) -> int:
    skip_hours = _get_skip_hours()
    delay_min, delay_max = _get_instagram_delay_range()
    config = json.dumps({
        "skip_hours": skip_hours,
        "instagram_delay_min_seconds": delay_min,
        "instagram_delay_max_seconds": delay_max,
        "force": bool(force),
    })
    return execute_query(
        """INSERT INTO batch_fetch_jobs
           (status, message, config_json, total_steps, completed_steps, success_steps, failed_steps, skipped_steps)
           VALUES (?, ?, ?, 0, 0, 0, 0, 0)""",
        ("queued", "Queued", config),
    )


def create_batch_fetch_steps(job_id: int) -> int:
    steps: List[tuple] = []

    feeds = fetch_all(
        "SELECT id, source_name FROM feeds WHERE is_active = 1 ORDER BY id",
        (),
    )
    steps.extend([
        (job_id, "rss", feed["id"], feed.get("source_name"), "pending")
        for feed in feeds
    ])

    instagram_feeds = fetch_all(
        "SELECT id, username, display_name FROM instagram_feeds WHERE is_active = 1 ORDER BY id",
        (),
    )
    for feed in instagram_feeds:
        display = feed.get("display_name") or feed.get("username")
        steps.append((job_id, "instagram", feed["id"], display, "pending"))

    youtube_feeds = fetch_all(
        "SELECT id, display_name FROM youtube_feeds WHERE is_active = 1 ORDER BY id",
        (),
    )
    for feed in youtube_feeds:
        steps.append((job_id, "youtube", feed["id"], feed.get("display_name"), "pending"))

    el_feed = _ensure_el_comercio_feed()
    if el_feed:
        steps.append((job_id, "el_comercio", el_feed.get("id"), el_feed.get("display_name"), "pending"))

    diario_feed = _ensure_diario_correo_feed()
    if diario_feed:
        steps.append((job_id, "diario_correo", diario_feed.get("id"), diario_feed.get("display_name"), "pending"))

    if steps:
        execute_many(
            """INSERT INTO batch_fetch_job_steps
               (job_id, source_type, source_id, source_name, status)
               VALUES (?, ?, ?, ?, ?)""",
            steps,
        )

    total_steps = len(steps)
    _update_job(job_id, total_steps=total_steps)
    return total_steps


def get_job(job_id: int) -> Optional[dict]:
    job = fetch_one("SELECT * FROM batch_fetch_jobs WHERE id = ?", (job_id,))
    return job


def get_job_detail(job_id: int) -> Optional[dict]:
    job = get_job(job_id)
    if not job:
        return None
    steps = fetch_all(
        "SELECT * FROM batch_fetch_job_steps WHERE job_id = ? ORDER BY id",
        (job_id,),
    )
    job["steps"] = steps
    return job


def list_jobs(limit: int = 20, offset: int = 0) -> List[dict]:
    return fetch_all(
        "SELECT * FROM batch_fetch_jobs ORDER BY id DESC LIMIT ? OFFSET ?",
        (limit, offset),
    )


def get_active_job() -> Optional[dict]:
    return fetch_one(
        "SELECT * FROM batch_fetch_jobs WHERE status IN ('queued', 'running') ORDER BY id DESC LIMIT 1",
        (),
    )


def get_current_job_detail() -> Optional[dict]:
    job = get_active_job()
    if not job:
        job = fetch_one(
            "SELECT * FROM batch_fetch_jobs ORDER BY id DESC LIMIT 1",
            (),
        )
    if not job:
        return None
    return get_job_detail(job["id"])


def start_batch_fetch_job(job_id: int, force: bool = False) -> None:
    thread = Thread(target=_run_batch_fetch_job, args=(job_id, force), daemon=True)
    thread.start()


def _run_batch_fetch_job(job_id: int, force: bool = False) -> None:
    started_at = datetime.utcnow().isoformat()
    _update_job(job_id, status="running", started_at=started_at, message="Starting batch fetch")

    steps = fetch_all(
        "SELECT * FROM batch_fetch_job_steps WHERE job_id = ? ORDER BY id",
        (job_id,),
    )
    if not steps:
        finished_at = datetime.utcnow().isoformat()
        _update_job(
            job_id,
            status="completed",
            finished_at=finished_at,
            message="No active sources to fetch",
            completed_steps=0,
            success_steps=0,
            failed_steps=0,
            skipped_steps=0,
        )
        return

    skip_hours = _get_skip_hours()
    delay_min, delay_max = _get_instagram_delay_range()

    completed_steps = 0
    success_steps = 0
    failed_steps = 0
    skipped_steps = 0
    instagram_calls = 0

    try:
        for step in steps:
            step_id = step["id"]
            source_type = step["source_type"]
            source_id = step.get("source_id")
            label = _format_step_label(step)

            _update_job(job_id, message=f"Processing {label}")
            _update_step(step_id, status="running", started_at=datetime.utcnow().isoformat())

            feed_state = _get_feed_state(source_type, source_id)
            if feed_state is None and source_type not in ("el_comercio", "diario_correo"):
                error_message = "Source not found."
                _update_step(
                    step_id,
                    status="failed",
                    finished_at=datetime.utcnow().isoformat(),
                    error_message=error_message,
                )
                failed_steps += 1
                completed_steps += 1
                _update_job(
                    job_id,
                    completed_steps=completed_steps,
                    success_steps=success_steps,
                    failed_steps=failed_steps,
                    skipped_steps=skipped_steps,
                )
                continue

            if feed_state and feed_state.get("is_active") == 0:
                _update_step(
                    step_id,
                    status="skipped",
                    finished_at=datetime.utcnow().isoformat(),
                    skip_reason="Feed is inactive.",
                )
                skipped_steps += 1
                completed_steps += 1
                _update_job(
                    job_id,
                    completed_steps=completed_steps,
                    success_steps=success_steps,
                    failed_steps=failed_steps,
                    skipped_steps=skipped_steps,
                )
                continue

            if feed_state and not force:
                should_skip, reason = _should_skip(feed_state.get("last_fetched"), skip_hours)
                if should_skip:
                    _update_step(
                        step_id,
                        status="skipped",
                        finished_at=datetime.utcnow().isoformat(),
                        skip_reason=reason,
                    )
                    skipped_steps += 1
                    completed_steps += 1
                    _update_job(
                        job_id,
                        completed_steps=completed_steps,
                        success_steps=success_steps,
                        failed_steps=failed_steps,
                        skipped_steps=skipped_steps,
                    )
                    continue

            if source_type == "instagram" and instagram_calls > 0:
                delay_seconds = random.uniform(delay_min, delay_max)
                if delay_seconds > 0:
                    time.sleep(delay_seconds)

            result: Optional[Dict] = None
            error_message = None
            step_status = "success"

            try:
                if source_type == "rss":
                    result = fetch_feed(int(source_id))
                elif source_type == "instagram":
                    instagram_calls += 1
                    result = fetch_instagram_feed(int(source_id))
                elif source_type == "youtube":
                    result = fetch_youtube_feed(int(source_id))
                elif source_type == "el_comercio":
                    result = fetch_el_comercio_feed(int(source_id))
                elif source_type == "diario_correo":
                    result = fetch_diario_correo_feed(int(source_id))
                else:
                    raise ValueError(f"Unsupported source type: {source_type}")

                if result and str(result.get("status", "")).upper() == "FAILED":
                    step_status = "failed"
                    error_message = result.get("error_message")
                else:
                    step_status = "success"
                    error_message = result.get("error_message") if result else None

            except Exception as exc:
                step_status = "failed"
                error_message = str(exc)

            if step_status == "failed":
                failed_steps += 1
            else:
                success_steps += 1

            completed_steps += 1

            _update_step(
                step_id,
                status=step_status,
                finished_at=datetime.utcnow().isoformat(),
                result_json=json.dumps(result) if result is not None else None,
                error_message=error_message,
            )

            _update_job(
                job_id,
                completed_steps=completed_steps,
                success_steps=success_steps,
                failed_steps=failed_steps,
                skipped_steps=skipped_steps,
            )

        finished_at = datetime.utcnow().isoformat()
        final_status = "completed_with_errors" if failed_steps > 0 else "completed"
        _update_job(
            job_id,
            status=final_status,
            finished_at=finished_at,
            message="Batch fetch finished",
        )

    except Exception as exc:
        finished_at = datetime.utcnow().isoformat()
        _update_job(
            job_id,
            status="failed",
            finished_at=finished_at,
            error_message=str(exc),
            message="Batch fetch failed",
        )
