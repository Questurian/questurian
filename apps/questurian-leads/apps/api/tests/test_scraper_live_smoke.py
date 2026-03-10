from __future__ import annotations

import os
import unittest

from features.diario_correo_feeds.service.fetcher import fetch_items_via_html, run_spider as run_diario_spider
from features.el_comercio_feeds.service.fetcher import run_spider as run_el_comercio_spider


@unittest.skipUnless(
    os.getenv("RUN_LIVE_SCRAPE_TESTS") == "1",
    "Set RUN_LIVE_SCRAPE_TESTS=1 to run live scraper smoke checks.",
)
class LiveScraperSmokeTests(unittest.TestCase):
    def test_el_comercio_live_smoke(self) -> None:
        items = run_el_comercio_spider()
        self.assertGreater(len(items), 0)
        self.assertTrue(items[0]["url"].startswith("http"))
        self.assertTrue(items[0]["title"])

    def test_diario_correo_live_smoke(self) -> None:
        items = run_diario_spider()
        if not items:
            items = fetch_items_via_html(
                "https://diariocorreo.pe/gastronomia/",
                "gastronomia",
            )

        self.assertGreater(len(items), 0)
        self.assertTrue(items[0]["url"].startswith("http"))
        self.assertTrue(items[0]["title"])
