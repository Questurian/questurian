from __future__ import annotations

import os


DEFAULT_QUEUE_NAME = "scrapes"
DEFAULT_QUEUE_URL = "redis://redis:6379/0"
DEFAULT_JOB_TIMEOUT_SECONDS = 15 * 60


class QueueUnavailableError(RuntimeError):
    """Raised when the Redis-backed queue is not available."""


def get_queue_name() -> str:
    return os.getenv("SCRAPE_QUEUE_NAME", DEFAULT_QUEUE_NAME).strip() or DEFAULT_QUEUE_NAME


def get_queue_url() -> str:
    return os.getenv("SCRAPE_QUEUE_URL", DEFAULT_QUEUE_URL).strip() or DEFAULT_QUEUE_URL


def get_job_timeout_seconds() -> int:
    raw = os.getenv("SCRAPE_JOB_TIMEOUT_SECONDS", "").strip()
    try:
        value = int(raw)
    except (TypeError, ValueError):
        value = DEFAULT_JOB_TIMEOUT_SECONDS
    return max(60, value)


def get_redis_connection():
    try:
        from redis import Redis
    except ModuleNotFoundError as exc:
        raise QueueUnavailableError(
            "redis is not installed. Install API requirements before using queued scrapes."
        ) from exc

    return Redis.from_url(get_queue_url())


def get_queue():
    try:
        from rq import Queue
    except ModuleNotFoundError as exc:
        raise QueueUnavailableError(
            "rq is not installed. Install API requirements before using queued scrapes."
        ) from exc

    return Queue(
        get_queue_name(),
        connection=get_redis_connection(),
        default_timeout=get_job_timeout_seconds(),
    )


def enqueue_scrape_worker_job(job_id: int) -> str:
    queue = get_queue()
    try:
        job = queue.enqueue_call(
            func="features.scrape_jobs.service.runner.process_scrape_job",
            args=(job_id,),
            job_timeout=get_job_timeout_seconds(),
            result_ttl=24 * 60 * 60,
            failure_ttl=7 * 24 * 60 * 60,
        )
    except Exception as exc:
        raise QueueUnavailableError(f"Unable to enqueue scrape job: {exc}") from exc
    return job.id
