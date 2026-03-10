from __future__ import annotations

import unittest

from lib.dates import normalize_published_at


class DateNormalizationTests(unittest.TestCase):
    def test_normalize_el_comercio_date_without_time(self) -> None:
        self.assertEqual(
            normalize_published_at("10/03/2026"),
            "2026-03-10T00:00:00+00:00",
        )

    def test_normalize_el_comercio_date_with_time(self) -> None:
        self.assertEqual(
            normalize_published_at("10/03/2026 _ 08:22"),
            "2026-03-10T08:22:00+00:00",
        )
        self.assertEqual(
            normalize_published_at("10/03/2026 08:22"),
            "2026-03-10T08:22:00+00:00",
        )

    def test_normalize_invalid_date_returns_none(self) -> None:
        self.assertIsNone(normalize_published_at("32/03/2026 _ 08:22"))
