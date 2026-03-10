from features.scrape_jobs.service.runner import recover_stale_jobs


def main() -> None:
    from rq import Queue, Worker

    from features.scrape_jobs.service.queue import get_queue_name, get_redis_connection

    redis_connection = get_redis_connection()
    recover_stale_jobs()
    queue = Queue(get_queue_name(), connection=redis_connection)
    worker = Worker([queue], connection=redis_connection)
    worker.work(with_scheduler=False)


if __name__ == "__main__":
    main()
