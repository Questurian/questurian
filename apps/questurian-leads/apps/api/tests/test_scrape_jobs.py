from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from features.el_comercio_feeds.api import routes as el_routes
from features.scrape_jobs.service import runner as scrape_runner
from features.scrape_jobs.service import queue as scrape_queue
from features.scrape_jobs.service.queue import QueueUnavailableError
from lib.database import execute_query, fetch_one
from tests.support import temporary_database


class ScrapeJobServiceTests(unittest.TestCase):
    def test_queue_scrape_job_reuses_active_job(self) -> None:
        with temporary_database():
            with patch(
                "features.scrape_jobs.service.runner.enqueue_scrape_worker_job",
                return_value="rq-job-1",
            ):
                first = scrape_runner.queue_scrape_job("el_comercio", 1, "El Comercio")
                second = scrape_runner.queue_scrape_job("el_comercio", 1, "El Comercio")

        self.assertEqual(first["id"], second["id"])
        self.assertEqual(second["status"], "queued")

    def test_process_scrape_job_marks_success(self) -> None:
        with temporary_database(), tempfile.TemporaryDirectory() as artifact_root:
            job_id = scrape_runner.create_scrape_job("diario_correo", 7, "Diario Correo")
            with patch.dict("os.environ", {"SCRAPE_ARTIFACTS_DIR": artifact_root}), patch.object(
                scrape_runner,
                "_source_fetcher",
                return_value=lambda feed_id, artifact_dir=None: {
                    "status": "SUCCESS",
                    "new_post_count": 2,
                    "existing_post_count": 1,
                    "invalid_post_count": 0,
                },
            ):
                result = scrape_runner.process_scrape_job(job_id)

            job = scrape_runner.get_job(job_id)
            self.assertEqual(result["status"], "SUCCESS")
            self.assertEqual(job["status"], "success")
            self.assertIsNone(job["artifact_dir"])
            self.assertEqual(json.loads(job["result_json"])["new_post_count"], 2)

    def test_process_scrape_job_failure_persists_traceback_artifact(self) -> None:
        with temporary_database(), tempfile.TemporaryDirectory() as artifact_root:
            job_id = scrape_runner.create_scrape_job("el_comercio", 3, "El Comercio")
            with patch.dict("os.environ", {"SCRAPE_ARTIFACTS_DIR": artifact_root}), patch.object(
                scrape_runner,
                "_source_fetcher",
                return_value=lambda feed_id, artifact_dir=None: (_ for _ in ()).throw(
                    RuntimeError("boom")
                ),
            ):
                with self.assertRaisesRegex(RuntimeError, "boom"):
                    scrape_runner.process_scrape_job(job_id)

            job = scrape_runner.get_job(job_id)
            self.assertEqual(job["status"], "failed")
            self.assertTrue(job["artifact_dir"])
            traceback_path = Path(job["artifact_dir"]) / "traceback.txt"
            self.assertTrue(traceback_path.exists())
            self.assertIn("RuntimeError: boom", traceback_path.read_text(encoding="utf-8"))

    def test_recover_stale_jobs_marks_old_running_job_failed(self) -> None:
        with temporary_database():
            job_id = scrape_runner.create_scrape_job("el_comercio", 9, "El Comercio")
            execute_query(
                """UPDATE scrape_jobs
                   SET status = 'running', started_at = '2026-03-09T00:00:00+00:00'
                   WHERE id = ?""",
                (job_id,),
            )

            recovered = scrape_runner.recover_stale_jobs(max_age_minutes=1)
            job = scrape_runner.get_job(job_id)

        self.assertEqual(recovered, 1)
        self.assertEqual(job["status"], "failed")
        self.assertIn("interrupted", job["error_message"])

    def test_get_current_job_prefers_active_job_for_source(self) -> None:
        with temporary_database():
            older_job_id = scrape_runner.create_scrape_job("el_comercio", 4, "El Comercio")
            execute_query(
                """UPDATE scrape_jobs
                   SET status = 'success', finished_at = '2026-03-10T00:00:00+00:00'
                   WHERE id = ?""",
                (older_job_id,),
            )
            active_job_id = scrape_runner.create_scrape_job("el_comercio", 4, "El Comercio")

            current_job = scrape_runner.get_current_job(source_type="el_comercio")

        self.assertEqual(current_job["id"], active_job_id)


class ScrapeRouteTests(unittest.TestCase):
    def test_el_comercio_trigger_fetch_returns_queued_job(self) -> None:
        with temporary_database(), patch(
            "features.scrape_jobs.service.runner.enqueue_scrape_worker_job",
            return_value="rq-job-123",
        ):
            response = el_routes.trigger_fetch()
            job = scrape_runner.get_job(response.id)

        self.assertEqual(response.source_type, "el_comercio")
        self.assertEqual(response.status, "queued")
        self.assertEqual(job["redis_job_id"], "rq-job-123")

    def test_el_comercio_trigger_fetch_surfaces_queue_unavailable(self) -> None:
        with temporary_database(), patch(
            "features.el_comercio_feeds.api.routes.queue_scrape_job",
            side_effect=QueueUnavailableError("queue offline"),
        ):
            with self.assertRaises(HTTPException) as ctx:
                el_routes.trigger_fetch()

        self.assertEqual(ctx.exception.status_code, 503)
        self.assertEqual(ctx.exception.detail, "queue offline")


class ScrapeQueueConfigTests(unittest.TestCase):
    def test_queue_url_defaults_to_localhost_for_local_dev(self) -> None:
        with patch.dict("os.environ", {}, clear=True):
            self.assertEqual(scrape_queue.get_queue_url(), "redis://localhost:6379/0")

    def test_enqueue_scrape_worker_job_uses_timeout_keyword_for_rq(self) -> None:
        class FakeJob:
            id = "rq-job-1"

        class FakeQueue:
            def __init__(self) -> None:
                self.calls = []

            def enqueue_call(self, **kwargs):
                self.calls.append(kwargs)
                return FakeJob()

        queue = FakeQueue()
        with patch.object(scrape_queue, "get_queue", return_value=queue):
            job_id = scrape_queue.enqueue_scrape_worker_job(42)

        self.assertEqual(job_id, "rq-job-1")
        self.assertEqual(queue.calls[0]["timeout"], scrape_queue.get_job_timeout_seconds())
        self.assertNotIn("job_timeout", queue.calls[0])
