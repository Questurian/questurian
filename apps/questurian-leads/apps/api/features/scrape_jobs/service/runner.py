from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import shutil
import traceback
from typing import Callable, Optional

from lib.database import execute_query, fetch_all, fetch_one

from .queue import QueueUnavailableError, enqueue_scrape_worker_job


ACTIVE_STATUSES = {"queued", "running"}
TERMINAL_STATUSES = {"success", "partial", "failed"}
DEFAULT_STALE_MINUTES = 10


def _utc_now_isoformat() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _json_dumps(value: object) -> Optional[str]:
    if value is None:
        return None
    return json.dumps(value, ensure_ascii=True)


def _source_fetcher(source_type: str) -> Callable[..., dict]:
    if source_type == "el_comercio":
        from features.el_comercio_feeds.service.fetcher import fetch_el_comercio_feed

        return fetch_el_comercio_feed

    if source_type == "diario_correo":
        from features.diario_correo_feeds.service.fetcher import fetch_diario_correo_feed

        return fetch_diario_correo_feed

    raise ValueError(f"Unsupported scrape source type: {source_type}")


def _normalize_result_status(result: Optional[dict]) -> str:
    raw = str((result or {}).get("status", "")).strip().upper()
    if raw == "SUCCESS":
        return "success"
    if raw == "PARTIAL":
        return "partial"
    return "failed"


def _build_status_message(source_name: str, status: str, result: Optional[dict] = None) -> str:
    if status == "queued":
        return f"{source_name} scrape queued"
    if status == "running":
        return f"{source_name} scrape running"
    if status == "success":
        new_posts = (result or {}).get("new_post_count") or (result or {}).get("post_count") or 0
        return f"{source_name} scrape finished with {new_posts} new posts"
    if status == "partial":
        new_posts = (result or {}).get("new_post_count") or (result or {}).get("post_count") or 0
        return f"{source_name} scrape finished with partial results ({new_posts} new posts)"
    return f"{source_name} scrape failed"


def _artifact_root() -> Path:
    raw = os.getenv("SCRAPE_ARTIFACTS_DIR", "/tmp/questurian-leads-scrape-artifacts")
    return Path(raw)


def _artifact_dir_for_job(job: dict) -> Path:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return _artifact_root() / f"{job['source_type']}-job-{job['id']}-{timestamp}"


def _prepare_artifact_dir(job: dict) -> Path:
    artifact_dir = _artifact_dir_for_job(job)
    artifact_dir.mkdir(parents=True, exist_ok=True)
    return artifact_dir


def _write_artifact(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _finalize_artifact_dir(path: Optional[Path]) -> Optional[str]:
    if path is None:
        return None

    try:
        has_files = any(path.iterdir())
    except FileNotFoundError:
        return None

    if not has_files:
        shutil.rmtree(path, ignore_errors=True)
        return None

    return str(path)


def _update_job(job_id: int, **fields: object) -> None:
    if not fields:
        return
    columns = ", ".join([f"{key} = ?" for key in fields.keys()])
    params = list(fields.values()) + [job_id]
    execute_query(f"UPDATE scrape_jobs SET {columns} WHERE id = ?", tuple(params))


def create_scrape_job(source_type: str, feed_id: int, source_name: str) -> int:
    return execute_query(
        """INSERT INTO scrape_jobs
           (source_type, feed_id, source_name, status, message)
           VALUES (?, ?, ?, 'queued', ?)""",
        (
            source_type,
            feed_id,
            source_name,
            _build_status_message(source_name, "queued"),
        ),
    )


def get_job(job_id: int) -> Optional[dict]:
    return fetch_one("SELECT * FROM scrape_jobs WHERE id = ?", (job_id,))


def get_active_job(source_type: Optional[str] = None, feed_id: Optional[int] = None) -> Optional[dict]:
    query = "SELECT * FROM scrape_jobs WHERE status IN ('queued', 'running')"
    params: list[object] = []
    if source_type:
        query += " AND source_type = ?"
        params.append(source_type)
    if feed_id is not None:
        query += " AND feed_id = ?"
        params.append(feed_id)
    query += " ORDER BY created_at DESC, id DESC LIMIT 1"
    return fetch_one(query, tuple(params))


def get_current_job(source_type: Optional[str] = None) -> Optional[dict]:
    active = get_active_job(source_type=source_type)
    if active:
        return active

    query = "SELECT * FROM scrape_jobs WHERE 1=1"
    params: list[object] = []
    if source_type:
        query += " AND source_type = ?"
        params.append(source_type)
    query += " ORDER BY created_at DESC, id DESC LIMIT 1"
    return fetch_one(query, tuple(params))


def list_jobs(
    *,
    source_type: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
) -> list[dict]:
    query = "SELECT * FROM scrape_jobs WHERE 1=1"
    params: list[object] = []
    if source_type:
        query += " AND source_type = ?"
        params.append(source_type)
    if status:
        query += " AND status = ?"
        params.append(status)
    query += " ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    return fetch_all(query, tuple(params))


def queue_scrape_job(source_type: str, feed_id: int, source_name: str) -> dict:
    active = get_active_job(source_type=source_type, feed_id=feed_id)
    if active:
        return active

    job_id = create_scrape_job(source_type, feed_id, source_name)

    try:
        redis_job_id = enqueue_scrape_worker_job(job_id)
    except QueueUnavailableError:
        _update_job(
            job_id,
            status="failed",
            finished_at=_utc_now_isoformat(),
            message=f"{source_name} scrape queue unavailable",
            error_message="Redis queue is unavailable. Start Redis and the scrape worker.",
        )
        raise

    _update_job(job_id, redis_job_id=redis_job_id)
    job = get_job(job_id)
    if not job:
        raise RuntimeError(f"Queued scrape job {job_id} could not be loaded")
    return job


def process_scrape_job(job_id: int) -> dict:
    job = get_job(job_id)
    if not job:
        raise RuntimeError(f"Scrape job {job_id} not found")

    artifact_dir = _prepare_artifact_dir(job)
    _update_job(
        job_id,
        status="running",
        started_at=_utc_now_isoformat(),
        message=_build_status_message(job["source_name"], "running"),
    )

    try:
        fetcher = _source_fetcher(job["source_type"])
        result = fetcher(job["feed_id"], artifact_dir=str(artifact_dir))
        normalized_status = _normalize_result_status(result)
        finalized_artifacts = _finalize_artifact_dir(artifact_dir)
        _update_job(
            job_id,
            status=normalized_status,
            finished_at=_utc_now_isoformat(),
            message=_build_status_message(job["source_name"], normalized_status, result),
            result_json=_json_dumps(result),
            error_message=(result or {}).get("error_message"),
            artifact_dir=finalized_artifacts,
        )
        return result
    except Exception as exc:
        _write_artifact(artifact_dir / "traceback.txt", traceback.format_exc())
        finalized_artifacts = _finalize_artifact_dir(artifact_dir)
        _update_job(
            job_id,
            status="failed",
            finished_at=_utc_now_isoformat(),
            message=_build_status_message(job["source_name"], "failed"),
            error_message=str(exc),
            artifact_dir=finalized_artifacts,
        )
        raise


def recover_stale_jobs(max_age_minutes: Optional[int] = None) -> int:
    if max_age_minutes is None:
        raw = os.getenv("SCRAPE_JOB_STALE_MINUTES", "").strip()
        try:
            max_age_minutes = int(raw)
        except (TypeError, ValueError):
            max_age_minutes = DEFAULT_STALE_MINUTES
    max_age_minutes = max(1, max_age_minutes)

    recovered = 0
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=max_age_minutes)
    running_jobs = fetch_all(
        "SELECT * FROM scrape_jobs WHERE status = 'running' ORDER BY started_at ASC, id ASC",
        (),
    )

    for job in running_jobs:
        started_at = _parse_datetime(job.get("started_at"))
        if not started_at or started_at >= cutoff:
            continue
        _update_job(
            job["id"],
            status="failed",
            finished_at=_utc_now_isoformat(),
            message=f"{job['source_name']} scrape recovered after stale worker state",
            error_message="Worker was interrupted before the scrape job completed.",
        )
        recovered += 1

    return recovered
