from __future__ import annotations

from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from app import main as main_module
from lib.database import init_db as init_db_module


class StartupMigrationDetectionTests(unittest.TestCase):
    def test_database_needs_migrations_when_required_tables_are_missing(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = Path(temp_dir) / "leads.db"
            with patch.object(init_db_module, "DATABASE_PATH", database_path), patch.object(
                main_module,
                "DATABASE_PATH",
                database_path,
            ):
                init_db_module.init_database()

                self.assertTrue(main_module._database_needs_migrations())

    def test_database_does_not_need_migrations_when_schema_is_current(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = Path(temp_dir) / "leads.db"
            with patch.object(init_db_module, "DATABASE_PATH", database_path), patch.object(
                main_module,
                "DATABASE_PATH",
                database_path,
            ):
                init_db_module.run_migrations()

                self.assertFalse(main_module._database_needs_migrations())


class StartupBatchFetchTests(unittest.TestCase):
    def test_startup_does_not_enqueue_batch_fetch_when_flag_disabled(self) -> None:
        with patch.object(main_module, "_should_run_migrations", return_value=False), patch.object(
            main_module,
            "_database_needs_migrations",
            return_value=False,
        ), patch.object(
            main_module,
            "_should_run_startup_batch_fetch",
            return_value=False,
        ), patch.object(main_module, "start_new_batch_fetch_job") as start_batch_mock:
            main_module.run_startup_migrations()

        start_batch_mock.assert_not_called()

    def test_startup_enqueues_batch_fetch_after_migrations_when_enabled(self) -> None:
        events: list[str] = []

        with patch.object(main_module, "_should_run_migrations", return_value=True), patch.object(
            main_module,
            "_should_run_startup_batch_fetch",
            return_value=True,
        ), patch.object(
            main_module,
            "run_migrations",
            side_effect=lambda: events.append("migrations"),
        ), patch.object(
            main_module,
            "start_new_batch_fetch_job",
            side_effect=lambda **_: events.append("startup"),
        ) as start_batch_mock:
            main_module.run_startup_migrations()

        self.assertEqual(events, ["migrations", "startup"])
        start_batch_mock.assert_called_once_with(
            trigger=main_module.STARTUP_BATCH_FETCH_TRIGGER,
            youtube_max_results=main_module.DEFAULT_STARTUP_YOUTUBE_MAX_RESULTS,
            scrape_max_items_floor=main_module.DEFAULT_STARTUP_SCRAPE_MAX_ITEMS_FLOOR,
        )

    def test_startup_skips_new_batch_when_active_job_exists(self) -> None:
        with patch.object(main_module, "_should_run_migrations", return_value=False), patch.object(
            main_module,
            "_database_needs_migrations",
            return_value=False,
        ), patch.object(
            main_module,
            "_should_run_startup_batch_fetch",
            return_value=True,
        ), patch.object(
            main_module,
            "start_new_batch_fetch_job",
            side_effect=main_module.ActiveBatchFetchJobError(17),
        ), patch.object(main_module, "LOGGER") as logger_mock:
            main_module.run_startup_migrations()

        logger_mock.info.assert_called_once()

    def test_startup_enqueue_failure_does_not_fail_app_startup(self) -> None:
        with patch.object(main_module, "_should_run_migrations", return_value=False), patch.object(
            main_module,
            "_database_needs_migrations",
            return_value=False,
        ), patch.object(
            main_module,
            "_should_run_startup_batch_fetch",
            return_value=True,
        ), patch.object(
            main_module,
            "start_new_batch_fetch_job",
            side_effect=RuntimeError("boom"),
        ), patch.object(main_module, "LOGGER") as logger_mock:
            main_module.run_startup_migrations()

        logger_mock.exception.assert_called_once()
