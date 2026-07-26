from fastapi.testclient import TestClient

from app.main import app
from app.features.images.image_processor import ImageVariantType, ProcessedVariant
from app.features.images.payload_client import PayloadClient
from tests.images_route_test_support import _auth_headers


def test_upload_social_image_rejects_blank_alt_text():
    client = TestClient(app)

    response = client.post(
        "/images/upload-social-image",
        files={
            "file": ("social.jpg", b"image-bytes", "image/jpeg"),
        },
        data={
            "alt_text": "   ",
            "photographer_credit": "Questurian Creative",
            "location_ref": "42",
        },
        headers=_auth_headers(),
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["step"] == "validate_alt_text"


def test_upload_social_image_success(monkeypatch):
    client = TestClient(app)

    def fake_process_single_variant(
        source_buffer: bytes,
        original_filename: str,
        variant_type: ImageVariantType,
        quality: int = 85,
    ):
        assert source_buffer == b"image-bytes"
        assert original_filename == "social.jpg"
        assert variant_type == ImageVariantType.OPEN_GRAPH
        assert quality == 85
        return ProcessedVariant(
            variant_type=variant_type,
            buffer=b"og-bytes",
            filename="social_open_graph.webp",
            width=1200,
            height=630,
            content_type="image/webp",
            file_size=123,
        )

    async def fake_create_media_set(
        self,
        title: str,
        alt_text: str,
        external_ref: str,
        location_ref: int | None = None,
    ):
        assert title.startswith("Social OG")
        assert alt_text == "Custom social image"
        assert external_ref.startswith("social-og-social-")
        assert location_ref == 42
        return "ms_901"

    async def fake_upload_image(
        self,
        variant,
        alt_text: str,
        photographer_credit: str = "",
        media_set_id: str | None = None,
        location_ref: int | None = None,
    ):
        assert variant.variant_type.value == "open_graph"
        assert alt_text == "Custom social image"
        assert photographer_credit == "Questurian Creative"
        assert media_set_id == "ms_901"
        assert location_ref == 42
        return "901"

    async def fake_wait_for_bunny_original_url(
        *,
        client,
        asset_id: str,
        max_attempts: int = 8,
        delay_seconds: float = 0.35,
    ):
        assert asset_id == "901"
        assert max_attempts == 8
        assert delay_seconds == 0.35
        return "https://cdn.example.com/custom-social.webp"

    monkeypatch.setattr(
        "app.features.images.social.routes.process_single_variant",
        fake_process_single_variant,
    )
    monkeypatch.setattr(
        PayloadClient,
        "create_media_set",
        fake_create_media_set,
    )
    monkeypatch.setattr(
        PayloadClient,
        "upload_image",
        fake_upload_image,
    )
    monkeypatch.setattr(
        "app.features.images.social.routes._wait_for_bunny_original_url",
        fake_wait_for_bunny_original_url,
    )

    response = client.post(
        "/images/upload-social-image",
        files={
            "file": ("social.jpg", b"image-bytes", "image/jpeg"),
        },
        data={
            "alt_text": "Custom social image",
            "photographer_credit": "Questurian Creative",
            "location_ref": "42",
        },
        headers=_auth_headers(),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["mediaSetId"] == "ms_901"
    assert payload["externalRef"].startswith("social-og-social-")
    assert payload["generatedAssetId"] == "901"
    assert payload["generatedImageUrl"] == "https://cdn.example.com/custom-social.webp"
    assert payload["width"] == 1200
    assert payload["height"] == 630
