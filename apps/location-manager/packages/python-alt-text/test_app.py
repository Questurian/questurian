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


if __name__ == "__main__":
    unittest.main()
