from __future__ import annotations

from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

from features.batch_fetch.service import runner as batch_runner
from features.diario_correo_feeds.service import fetcher as diario_fetcher
from features.el_comercio_feeds.service import fetcher as el_fetcher
from lib.database import execute_query, fetch_all, fetch_one
from lib.scraping import run_scrapy_spider
from tests.support import FakeTranslator, temporary_database


class ScraperPipelineTests(unittest.TestCase):
    def test_el_comercio_fetch_preserves_existing_rows(self) -> None:
        with temporary_database():
            category_id = execute_query("INSERT INTO categories (name) VALUES (?)", ("Peru",))
            feed_id = execute_query(
                """INSERT INTO el_comercio_feeds
                   (category_id, url, display_name, section, fetch_interval, is_active)
                   VALUES (?, ?, ?, ?, ?, 1)""",
                (
                    category_id,
                    "https://elcomercio.pe/archivo/gastronomia/",
                    "El Comercio Gastronomia",
                    "gastronomia",
                    60,
                ),
            )
            execute_query(
                "INSERT INTO el_comercio_posts (el_comercio_feed_id, url, title) VALUES (?, ?, ?)",
                (
                    feed_id,
                    "https://elcomercio.pe/gastronomia/existing-story/",
                    "Existing story",
                ),
            )

            with patch.object(
                el_fetcher,
                "run_spider",
                return_value=[
                    {
                        "url": "https://elcomercio.pe/gastronomia/existing-story/",
                        "title": "Existing story",
                        "published_at": "10/03/2026",
                    },
                    {
                        "url": "https://elcomercio.pe/gastronomia/new-story/",
                        "title": "Nueva historia",
                        "published_at": "10/03/2026",
                        "excerpt": "Texto de prueba",
                        "image_url": "https://elcomercio.pe/assets/new-story.jpg",
                    },
                    {"url": "https://elcomercio.pe/gastronomia/bad-story/", "title": None},
                ],
            ):
                result = el_fetcher.fetch_el_comercio_feed(feed_id, translator=FakeTranslator())

            self.assertEqual(result["status"], "PARTIAL")
            self.assertEqual(result["new_post_count"], 1)
            self.assertEqual(result["existing_post_count"], 1)
            self.assertEqual(result["invalid_post_count"], 1)

            posts = fetch_all(
                "SELECT url, title_translated FROM el_comercio_posts ORDER BY id",
                (),
            )
            self.assertEqual(len(posts), 2)
            self.assertEqual(posts[1]["url"], "https://elcomercio.pe/gastronomia/new-story/")
            self.assertEqual(posts[1]["title_translated"], "EN::Nueva historia")

            log_row = fetch_one(
                """SELECT status, post_count, error_message
                   FROM el_comercio_fetch_logs
                   WHERE el_comercio_feed_id = ?
                   ORDER BY id DESC""",
                (feed_id,),
            )
            self.assertEqual(log_row["status"], "PARTIAL")
            self.assertEqual(log_row["post_count"], 1)
            self.assertIn("missing URL or title", log_row["error_message"])

    def test_diario_correo_fetch_uses_html_fallback(self) -> None:
        with temporary_database():
            category_id = execute_query("INSERT INTO categories (name) VALUES (?)", ("Peru",))
            feed_id = execute_query(
                """INSERT INTO diario_correo_feeds
                   (category_id, url, display_name, section, fetch_interval, is_active)
                   VALUES (?, ?, ?, ?, ?, 1)""",
                (
                    category_id,
                    "https://diariocorreo.pe/gastronomia/",
                    "Diario Correo Gastronomia",
                    "gastronomia",
                    60,
                ),
            )

            fallback_items = [
                {
                    "url": "https://diariocorreo.pe/gastronomia/nueva-nota/",
                    "title": "Nueva nota",
                    "published_at": "2026-03-10T09:00:00-05:00",
                    "excerpt": "Resumen",
                }
            ]

            with patch.object(diario_fetcher, "run_spider", return_value=[]), patch.object(
                diario_fetcher,
                "fetch_items_via_html",
                return_value=fallback_items,
            ) as fallback_mock:
                result = diario_fetcher.fetch_diario_correo_feed(
                    feed_id,
                    translator=FakeTranslator(),
                )

            fallback_mock.assert_called_once()
            self.assertEqual(result["status"], "SUCCESS")
            self.assertEqual(result["new_post_count"], 1)
            saved = fetch_one(
                "SELECT title_translated FROM diario_correo_posts WHERE diario_correo_feed_id = ?",
                (feed_id,),
            )
            self.assertEqual(saved["title_translated"], "EN::Nueva nota")

    def test_batch_fetch_steps_include_scrape_sources(self) -> None:
        with temporary_database():
            job_id = batch_runner.create_batch_fetch_job()
            total_steps = batch_runner.create_batch_fetch_steps(job_id)
            steps = fetch_all(
                "SELECT source_type FROM batch_fetch_job_steps WHERE job_id = ? ORDER BY id",
                (job_id,),
            )

            source_types = {step["source_type"] for step in steps}
            self.assertIn("el_comercio", source_types)
            self.assertIn("diario_correo", source_types)
            self.assertEqual(total_steps, len(steps))

    def test_run_scrapy_spider_surfaces_playwright_install_hint(self) -> None:
        completed = subprocess.CompletedProcess(
            args=["python3", "-m", "scrapy", "runspider"],
            returncode=1,
            stdout="",
            stderr="Executable doesn't exist at /ms-playwright/chromium. Please run the following command",
        )

        with patch("lib.scraping.base.subprocess.run", return_value=completed):
            with self.assertRaisesRegex(RuntimeError, "Playwright Chromium is not installed"):
                run_scrapy_spider(Path("/tmp/spider.py"))
