from __future__ import annotations

import json
from datetime import datetime
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from features.batch_fetch.api import routes as batch_routes
from features.batch_fetch.service import runner as batch_runner
from lib.database import execute_query, fetch_one
from tests.support import temporary_database


def insert_youtube_feed() -> int:
    category_id = execute_query("INSERT INTO categories (name) VALUES (?)", ("Peru",))
    return execute_query(
        """INSERT INTO youtube_feeds
           (category_id, channel_id, display_name, channel_url, fetch_interval, is_active, country)
           VALUES (?, ?, ?, ?, ?, 1, ?)""",
        (
            category_id,
            "channel-1",
            "Test Channel",
            "https://youtube.com/channel/channel-1",
            60,
            "Peru",
        ),
    )


class BatchFetchStartTests(unittest.TestCase):
    def test_start_new_batch_fetch_job_records_startup_metadata(self) -> None:
        with temporary_database(), patch.object(batch_runner, "start_batch_fetch_job") as start_mock:
            job = batch_runner.start_new_batch_fetch_job(
                trigger=batch_runner.STARTUP_BATCH_FETCH_TRIGGER,
                youtube_max_results=batch_runner.DEFAULT_STARTUP_YOUTUBE_MAX_RESULTS,
                scrape_max_items_floor=batch_runner.DEFAULT_STARTUP_SCRAPE_MAX_ITEMS_FLOOR,
            )

        config = json.loads(job["config_json"])
        self.assertEqual(job["message"], "Startup recovery batch queued")
        self.assertEqual(config["trigger"], batch_runner.STARTUP_BATCH_FETCH_TRIGGER)
        self.assertEqual(
            config["youtube_max_results"],
            batch_runner.DEFAULT_STARTUP_YOUTUBE_MAX_RESULTS,
        )
        self.assertEqual(
            config["scrape_max_items_floor"],
            batch_runner.DEFAULT_STARTUP_SCRAPE_MAX_ITEMS_FLOOR,
        )
        self.assertGreater(job["total_steps"], 0)
        start_mock.assert_called_once_with(job["id"])

    def test_start_new_batch_fetch_job_raises_when_active_job_exists(self) -> None:
        with temporary_database():
            active_job_id = batch_runner.create_batch_fetch_job()

            with self.assertRaises(batch_runner.ActiveBatchFetchJobError) as ctx:
                batch_runner.start_new_batch_fetch_job()

        self.assertEqual(ctx.exception.job_id, active_job_id)


class BatchFetchRunnerTests(unittest.TestCase):
    def test_run_batch_fetch_job_uses_startup_recovery_overrides(self) -> None:
        with temporary_database():
            youtube_feed_id = insert_youtube_feed()
            job_id = batch_runner.create_batch_fetch_job(
                trigger=batch_runner.STARTUP_BATCH_FETCH_TRIGGER,
                youtube_max_results=batch_runner.DEFAULT_STARTUP_YOUTUBE_MAX_RESULTS,
                scrape_max_items_floor=batch_runner.DEFAULT_STARTUP_SCRAPE_MAX_ITEMS_FLOOR,
            )
            batch_runner.create_batch_fetch_steps(job_id)

            with patch.object(
                batch_runner,
                "fetch_youtube_feed",
                return_value={"status": "SUCCESS"},
            ) as youtube_mock, patch.object(
                batch_runner,
                "fetch_el_comercio_feed",
                return_value={"status": "SUCCESS"},
            ) as el_mock, patch.object(
                batch_runner,
                "fetch_diario_correo_feed",
                return_value={"status": "SUCCESS"},
            ) as diario_mock:
                batch_runner._run_batch_fetch_job(job_id)

        youtube_mock.assert_called_once_with(
            youtube_feed_id,
            max_results=batch_runner.DEFAULT_STARTUP_YOUTUBE_MAX_RESULTS,
        )
        self.assertEqual(
            el_mock.call_args.kwargs["max_items_floor"],
            batch_runner.DEFAULT_STARTUP_SCRAPE_MAX_ITEMS_FLOOR,
        )
        self.assertEqual(
            diario_mock.call_args.kwargs["max_items_floor"],
            batch_runner.DEFAULT_STARTUP_SCRAPE_MAX_ITEMS_FLOOR,
        )

    def test_run_batch_fetch_job_keeps_manual_scrape_defaults(self) -> None:
        with temporary_database():
            job_id = batch_runner.create_batch_fetch_job()
            batch_runner.create_batch_fetch_steps(job_id)

            with patch.object(
                batch_runner,
                "fetch_el_comercio_feed",
                return_value={"status": "SUCCESS"},
            ) as el_mock, patch.object(
                batch_runner,
                "fetch_diario_correo_feed",
                return_value={"status": "SUCCESS"},
            ) as diario_mock:
                batch_runner._run_batch_fetch_job(job_id)

        self.assertIsNone(el_mock.call_args.kwargs["max_items_floor"])
        self.assertIsNone(diario_mock.call_args.kwargs["max_items_floor"])

    def test_run_batch_fetch_job_skips_recently_fetched_sources_during_startup(self) -> None:
        with temporary_database():
            category_id = execute_query("INSERT INTO categories (name) VALUES (?)", ("Peru",))
            youtube_feed_id = execute_query(
                """INSERT INTO youtube_feeds
                   (category_id, channel_id, display_name, channel_url, fetch_interval, is_active, country, last_fetched)
                   VALUES (?, ?, ?, ?, ?, 1, ?, ?)""",
                (
                    category_id,
                    "channel-2",
                    "Fresh Channel",
                    "https://youtube.com/channel/channel-2",
                    60,
                    "Peru",
                    datetime.utcnow().isoformat(),
                ),
            )
            job_id = batch_runner.create_batch_fetch_job(
                trigger=batch_runner.STARTUP_BATCH_FETCH_TRIGGER,
                youtube_max_results=batch_runner.DEFAULT_STARTUP_YOUTUBE_MAX_RESULTS,
                scrape_max_items_floor=batch_runner.DEFAULT_STARTUP_SCRAPE_MAX_ITEMS_FLOOR,
            )
            batch_runner.create_batch_fetch_steps(job_id)

            with patch.object(
                batch_runner,
                "fetch_youtube_feed",
                return_value={"status": "SUCCESS"},
            ) as youtube_mock, patch.object(
                batch_runner,
                "fetch_el_comercio_feed",
                return_value={"status": "SUCCESS"},
            ), patch.object(
                batch_runner,
                "fetch_diario_correo_feed",
                return_value={"status": "SUCCESS"},
            ):
                batch_runner._run_batch_fetch_job(job_id)

            youtube_step = fetch_one(
                """SELECT status, skip_reason
                   FROM batch_fetch_job_steps
                   WHERE job_id = ? AND source_type = 'youtube' AND source_id = ?""",
                (job_id, youtube_feed_id),
            )

        youtube_mock.assert_not_called()
        self.assertEqual(youtube_step["status"], "skipped")
        self.assertIn("Fetched within the last", youtube_step["skip_reason"])


class BatchFetchRouteTests(unittest.TestCase):
    def test_start_batch_fetch_returns_409_when_job_is_active(self) -> None:
        with patch.object(
            batch_routes,
            "start_new_batch_fetch_job",
            side_effect=batch_runner.ActiveBatchFetchJobError(9),
        ):
            with self.assertRaises(HTTPException) as ctx:
                batch_routes.start_batch_fetch(force=False)

        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail, "Batch fetch already running (job_id=9).")
