import platform

from features.scrape_jobs.service.runner import recover_stale_jobs


def _get_worker_class():
    from rq import SimpleWorker, Worker

    # RQ's default forked worker crashes on macOS when scraper dependencies touch
    # Objective-C runtime state. SimpleWorker keeps local dev stable.
    if platform.system() == "Darwin":
        return SimpleWorker
    return Worker


def main() -> None:
    from rq import Queue

    from features.scrape_jobs.service.queue import get_queue_name, get_redis_connection

    redis_connection = get_redis_connection()
    recover_stale_jobs()
    queue = Queue(get_queue_name(), connection=redis_connection)
    worker = _get_worker_class()([queue], connection=redis_connection)
    worker.work(with_scheduler=False)


if __name__ == "__main__":
    main()
