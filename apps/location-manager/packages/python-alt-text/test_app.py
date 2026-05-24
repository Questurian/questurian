import asyncio
import io
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from starlette.datastructures import Headers, UploadFile

import app


def make_upload_file(
    *,
    filename: str = "test.jpg",
    content_type: str = "image/jpeg",
    payload: bytes = b"image-bytes",
) -> UploadFile:
    return UploadFile(
        filename=filename,
        file=io.BytesIO(payload),
        headers=Headers({"content-type": content_type}),
    )


class AltTextServiceTests(unittest.TestCase):
    def test_test_endpoint_reports_health(self) -> None:
        result = asyncio.run(app.test_endpoint())
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["provider"], "vertex-gemini")

    def test_alt_endpoint_returns_generated_alt_text(self) -> None:
        upload = make_upload_file()
        with patch(
            "app.generate_alt_text_from_data",
            return_value="Chef plating ceviche at a restaurant counter",
        ) as mocked_generate:
            result = asyncio.run(app.alt_only(image=upload))

        self.assertEqual(
            result["alt"], "Chef plating ceviche at a restaurant counter"
        )
        mocked_generate.assert_called_once_with(b"image-bytes", "image/jpeg")

    def test_alt_endpoint_returns_controlled_error_for_missing_project(self) -> None:
        upload = make_upload_file()
        with patch(
            "app.generate_alt_text_from_data",
            side_effect=RuntimeError(
                "GOOGLE_CLOUD_PROJECT environment variable is required."
            ),
        ):
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(app.alt_only(image=upload))

        self.assertEqual(raised.exception.status_code, 500)
        self.assertIn("GOOGLE_CLOUD_PROJECT", str(raised.exception.detail))

    def test_neighborhood_description_endpoint_returns_generated_text(self) -> None:
        request = app.NeighborhoodDescriptionRequest(
            district="Miraflores",
            city="Lima",
            country="Peru",
            category="dining",
        )
        with patch(
            "app.generate_text_from_prompt",
            return_value=(
                "Miraflores mixes leafy residential streets with cafes and restaurants, making it an easy neighborhood to explore on foot. "
                "It feels polished and visitor-friendly while still serving as a lived-in part of Lima."
            ),
        ) as mocked_generate:
            result = asyncio.run(app.neighborhood_description(request=request))

        self.assertIn("Miraflores mixes leafy residential streets", result["description"])
        mocked_generate.assert_called_once()

    def test_parse_json_object_handles_markdown_fences(self) -> None:
        parsed = app.parse_json_object(
            '```json\n{"suggestion":"yes","confidence":0.8,"reason":"Listed amenity","sources":[]}\n```'
        )

        self.assertEqual(parsed["suggestion"], "yes")
        self.assertEqual(parsed["confidence"], 0.8)

    def test_accommodations_prompt_includes_allowed_options_and_context(self) -> None:
        request = app.AccommodationsFieldSuggestionRequest(
            field_key="wifi",
            field_label="WiFi",
            kind="single",
            allowed_options=[
                app.AccommodationsOption(value="yes", label="Yes"),
                app.AccommodationsOption(value="no", label="No"),
            ],
            form_values={"name": "Example Hotel", "address": "123 Main St"},
            api_context={"website": "https://example.com"},
        )

        prompt = app.build_accommodations_field_suggestion_prompt(request)

        self.assertIn("allowed_options", prompt)
        self.assertIn('"value": "yes"', prompt)
        self.assertIn("Example Hotel", prompt)
        self.assertIn("Return only JSON", prompt)

    def test_accommodations_field_suggestion_endpoint_returns_generated_json(self) -> None:
        request = app.AccommodationsFieldSuggestionRequest(
            field_key="wifi",
            field_label="WiFi",
            kind="single",
            allowed_options=[app.AccommodationsOption(value="yes", label="Yes")],
            form_values={"name": "Example Hotel", "address": "123 Main St"},
            api_context={},
        )

        with patch(
            "app.generate_accommodations_field_suggestion",
            return_value={
                "suggestion": "yes",
                "confidence": 0.91,
                "reason": "Official amenities mention WiFi.",
                "sources": [{"label": "Official site", "url": "https://example.com"}],
            },
        ) as mocked_generate:
            result = asyncio.run(app.accommodations_field_suggestion(request=request))

        self.assertEqual(result["suggestion"], "yes")
        self.assertEqual(result["confidence"], 0.91)
        mocked_generate.assert_called_once_with(request)


class UrlFieldSuggestionTests(unittest.TestCase):
    def _url_request(self, **overrides) -> app.FieldSuggestionRequest:
        defaults = {
            "category": "dining",
            "field_key": "menuUrl",
            "field_label": "Menu",
            "kind": "url",
            "allowed_options": [],
            "form_values": {"name": "Maido", "address": "Calle San Martin 399, Lima"},
            "api_context": {"website": "https://maido.pe"},
        }
        defaults.update(overrides)
        return app.FieldSuggestionRequest(**defaults)

    def test_url_prompt_drops_option_constraint_language(self) -> None:
        prompt = app.build_field_suggestion_prompt(self._url_request())

        self.assertIn("absolute http:// or https:// URL", prompt)
        self.assertNotIn("allowed_options", prompt)
        self.assertIn("Maido", prompt)

    def test_url_kind_allows_empty_allowed_options(self) -> None:
        request = self._url_request()
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
        request = self._url_request()
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
        request = self._url_request()
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


class UrlValidationTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
