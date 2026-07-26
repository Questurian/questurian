from fastapi.testclient import TestClient

from app.main import app
from app.features.images.image_processor import ImageVariantType, ProcessedVariant
from tests.images_route_test_support import _auth_headers


def test_import_external_requires_authorization():
    client = TestClient(app)

    response = client.post(
        "/images/import-external",
        data={
            "provider": "unsplash",
            "source_url": "https://images.unsplash.com/photo-123",
            "external_ref": "article-featured",
            "alt_text": "Alt text",
            "photographer_credit": "Photo by Tester",
            "location_ref": "42",
        },
    )

    assert response.status_code == 401
    detail = response.json()["detail"]
    assert detail["step"] == "validate_auth"


def test_import_external_rejects_disallowed_host():
    client = TestClient(app)

    response = client.post(
        "/images/import-external",
        data={
            "provider": "unsplash",
            "source_url": "https://example.com/photo.jpg",
            "external_ref": "article-featured",
            "alt_text": "Alt text",
            "photographer_credit": "Photo by Tester",
            "location_ref": "42",
        },
        headers=_auth_headers(),
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["step"] == "validate_external_source_url"
    assert detail["provider"] == "unsplash"


def test_import_external_uploads_variants(monkeypatch):
    client = TestClient(app)

    downloaded = {"called": False}
    processed = {"called": False}
    uploaded = {"called": False}

    async def fake_download(source_url: str, provider: str):
        downloaded["called"] = True
        assert provider == "unsplash"
        assert source_url == "https://images.unsplash.com/photo-test-id"
        return {
            "content": b"external-image-bytes",
            "content_type": "image/jpeg",
            "size_bytes": len(b"external-image-bytes"),
        }

    def fake_process(source_buffer: bytes, original_filename: str, alt_text: str):
        processed["called"] = True
        assert source_buffer == b"external-image-bytes"
        assert original_filename.startswith("unsplash-photo-test-id")
        assert alt_text == "Colorful street in Cartagena"
        return {
            variant: ProcessedVariant(
                variant_type=variant,
                buffer=f"{variant.value}-bytes".encode("utf-8"),
                filename=f"{variant.value}.webp",
                width=100,
                height=100,
                content_type="image/webp",
                file_size=123,
            )
            for variant in ImageVariantType
        }

    async def fake_upload(
        jwt_token: str,
        external_ref: str,
        alt_text: str,
        photographer_credit: str,
        location_ref: int,
        variants: dict,
    ):
        uploaded["called"] = True
        assert jwt_token == "test-token"
        assert external_ref == "article-featured"
        assert alt_text == "Colorful street in Cartagena"
        assert photographer_credit == "Jane Doe / Unsplash"
        assert location_ref == 77
        assert set(variants.keys()) == set(ImageVariantType)
        return {
            "mediaSetId": "ms_123",
            "variantAssetIds": {
                "thumbnail": "101",
                "square": "102",
                "wide": "103",
                "portrait": "104",
                "hero": "105",
                "open_graph": "106",
                "editorial": "107",
            },
        }

    monkeypatch.setattr(
        "app.features.images.uploads.routes._download_external_image",
        fake_download,
    )
    monkeypatch.setattr(
        "app.features.images.uploads.routes.process_image_variants",
        fake_process,
    )
    monkeypatch.setattr(
        "app.features.images.uploads.routes.upload_image_set",
        fake_upload,
    )

    response = client.post(
        "/images/import-external",
        data={
            "provider": "unsplash",
            "source_url": "https://images.unsplash.com/photo-test-id",
            "photo_id": "photo-test-id",
            "external_ref": "article-featured",
            "alt_text": "Colorful street in Cartagena",
            "photographer_credit": "Jane Doe / Unsplash",
            "location_ref": "77",
        },
        headers=_auth_headers(),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["mediaSetId"] == "ms_123"
    assert payload["provider"] == "unsplash"
    assert payload["sourceUrl"] == "https://images.unsplash.com/photo-test-id"
    assert payload["variantAssetIds"]["editorial"] == "107"
    assert downloaded["called"] is True
    assert processed["called"] is True
    assert uploaded["called"] is True


def test_external_source_requires_authorization():
    client = TestClient(app)

    response = client.get(
        "/images/external-source",
        params={
            "provider": "unsplash",
            "source_url": "https://images.unsplash.com/photo-123",
        },
    )

    assert response.status_code == 401
    detail = response.json()["detail"]
    assert detail["step"] == "validate_auth"


def test_external_source_returns_image_bytes(monkeypatch):
    client = TestClient(app)

    async def fake_download(source_url: str, provider: str):
        assert source_url == "https://images.unsplash.com/photo-download-test"
        assert provider == "unsplash"
        return {
            "content": b"downloaded-image-content",
            "content_type": "image/jpeg",
            "size_bytes": len(b"downloaded-image-content"),
        }

    monkeypatch.setattr(
        "app.features.images.uploads.routes._download_external_image",
        fake_download,
    )

    response = client.get(
        "/images/external-source",
        params={
            "provider": "unsplash",
            "source_url": "https://images.unsplash.com/photo-download-test",
            "photo_id": "photo-download-test",
        },
        headers=_auth_headers(),
    )

    assert response.status_code == 200
    assert response.content == b"downloaded-image-content"
    assert response.headers["content-type"].startswith("image/jpeg")
    assert "photo-download-test" in response.headers["content-disposition"]
