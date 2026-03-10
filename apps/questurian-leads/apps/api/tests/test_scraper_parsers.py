from __future__ import annotations

from pathlib import Path
import unittest

from features.diario_correo_feeds.service.parser import extract_section_items
from features.el_comercio_feeds.service.parser import extract_archive_items

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def read_fixture(*parts: str) -> str:
    return (FIXTURES_DIR.joinpath(*parts)).read_text(encoding="utf-8")


class ScraperParserTests(unittest.TestCase):
    def test_el_comercio_parser_extracts_archive_items(self) -> None:
        html = read_fixture("el_comercio", "archive.html")

        items = extract_archive_items(html, "https://elcomercio.pe/archivo/gastronomia/")

        self.assertEqual(len(items), 2)
        self.assertEqual(items[0]["title"], "Ceviche limeño reinventado")
        self.assertEqual(items[0]["published_at"], "10/03/2026")
        self.assertEqual(items[0]["url"], "https://elcomercio.pe/gastronomia/ceviche-limeno/")
        self.assertEqual(items[0]["image_url"], "https://elcomercio.pe/assets/ceviche.jpg")

    def test_diario_correo_parser_extracts_content_cache_items(self) -> None:
        html = read_fixture("diario_correo", "section.html")

        items = extract_section_items(
            html,
            feed_url="https://diariocorreo.pe/gastronomia/",
            section_slug="gastronomia",
        )

        self.assertEqual(len(items), 2)
        self.assertEqual(items[0]["title"], "Sabores del norte conquistan Lima")
        self.assertEqual(
            items[0]["url"],
            "https://diariocorreo.pe/gastronomia/sabores-del-norte/",
        )
        self.assertEqual(
            items[0]["image_url"],
            "https://diariocorreo.pe/media/sabores-del-norte.jpg",
        )
