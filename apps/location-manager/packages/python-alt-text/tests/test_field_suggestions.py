import unittest
from unittest.mock import patch

import app
from tests.support import make_url_field_suggestion_request


class UrlFieldSuggestionTests(unittest.TestCase):
    def test_url_kind_allows_empty_allowed_options(self) -> None:
        request = make_url_field_suggestion_request()
        with patch(
            "app.generate_grounded_json_from_prompt",
            return_value={
                "suggestion": "https://maido.pe/menu",
                "confidence": 0.82,
                "reason": "Linked from the venue's homepage.",
                "sources": [],
            },
        ):
            result = app.generate_field_suggestion(request)

        self.assertEqual(result["suggestion"], "https://maido.pe/menu")
        self.assertEqual(result["confidence"], 0.82)

    def test_url_kind_rejects_non_http_suggestion(self) -> None:
        request = make_url_field_suggestion_request()
        with patch(
            "app.generate_grounded_json_from_prompt",
            return_value={
                "suggestion": "maido.pe/menu",
                "confidence": 0.9,
                "reason": "",
                "sources": [],
            },
        ):
            result = app.generate_field_suggestion(request)

        self.assertIsNone(result["suggestion"])
        self.assertEqual(result["confidence"], 0)

    def test_url_kind_passes_through_null_suggestion(self) -> None:
        request = make_url_field_suggestion_request()
        with patch(
            "app.generate_grounded_json_from_prompt",
            return_value={
                "suggestion": None,
                "confidence": 0.3,
                "reason": "No canonical link found.",
                "sources": [],
            },
        ):
            result = app.generate_field_suggestion(request)

        self.assertIsNone(result["suggestion"])
        self.assertEqual(result["confidence"], 0.3)

    def test_single_kind_still_requires_allowed_options(self) -> None:
        request = app.FieldSuggestionRequest(
            category="dining",
            field_key="type",
            field_label="Type",
            kind="single",
            allowed_options=[],
            form_values={"name": "Maido"},
        )
        with self.assertRaises(ValueError):
            app.generate_field_suggestion(request)

    def test_unknown_kind_rejected(self) -> None:
        request = app.FieldSuggestionRequest(
            category="dining",
            field_key="menuUrl",
            field_label="Menu",
            kind="freetext",
            allowed_options=[],
            form_values={"name": "Maido"},
        )
        with self.assertRaises(ValueError):
            app.generate_field_suggestion(request)
