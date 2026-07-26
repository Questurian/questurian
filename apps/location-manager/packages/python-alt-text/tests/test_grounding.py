import unittest

import app


class GroundingTests(unittest.TestCase):
    def test_parse_json_object_handles_markdown_fences(self) -> None:
        parsed = app.parse_json_object(
            '```json\n{"suggestion":"yes","confidence":0.8,"reason":"Listed amenity","sources":[]}\n```'
        )

        self.assertEqual(parsed["suggestion"], "yes")
        self.assertEqual(parsed["confidence"], 0.8)

    def test_accepts_https_url(self) -> None:
        self.assertTrue(app.is_valid_http_url("https://example.com/menu"))

    def test_accepts_http_url(self) -> None:
        self.assertTrue(app.is_valid_http_url("http://example.com"))

    def test_rejects_scheme_relative(self) -> None:
        self.assertFalse(app.is_valid_http_url("//example.com"))

    def test_rejects_bare_domain(self) -> None:
        self.assertFalse(app.is_valid_http_url("example.com"))

    def test_rejects_non_string(self) -> None:
        self.assertFalse(app.is_valid_http_url(None))
        self.assertFalse(app.is_valid_http_url(42))
