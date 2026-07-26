from fastapi.testclient import TestClient

from app.main import app
from app.features.images.payload_client import PayloadClient, PayloadUploadError
from tests.images_route_test_support import (
    _auth_headers,
    _variant_files,
    _variant_form_parts,
)


def test_upload_variants_rejects_duplicate_variant_types():
    client = TestClient(app)

    response = client.post(
        "/images/upload-variants",
        files=_variant_files()
        + _variant_form_parts(
            variant_types=[
                "thumbnail",
                "thumbnail",
                "wide",
                "portrait",
                "hero",
                "open_graph",
                "editorial",
            ],
            external_ref="article-dup",
            alt_text="Alt text",
            location_ref=42,
        ),
        headers=_auth_headers(),
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["step"] == "validate_variant_types"
    assert detail["duplicate_types"] == ["thumbnail"]
    assert detail["missing_types"] == ["square"]


def test_upload_variants_rejects_negative_location_ref():
    client = TestClient(app)

    response = client.post(
        "/images/upload-variants",
        files=_variant_files()
        + _variant_form_parts(
            variant_types=[
                "thumbnail",
                "square",
                "wide",
                "portrait",
                "hero",
                "open_graph",
                "editorial",
            ],
            external_ref="article-location",
            alt_text="Alt text",
            location_ref=-1,
        ),
        headers=_auth_headers(),
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["step"] == "validate_location_ref"
    assert detail["location_ref"] == -1


def test_upload_variants_rejects_blank_photographer_credit():
    client = TestClient(app)

    response = client.post(
        "/images/upload-variants",
        files=_variant_files()
        + _variant_form_parts(
            variant_types=[
                "thumbnail",
                "square",
                "wide",
                "portrait",
                "hero",
                "open_graph",
                "editorial",
            ],
            external_ref="article-credit",
            alt_text="Alt text",
            location_ref=42,
            photographer_credit="   ",
        ),
        headers=_auth_headers(),
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["step"] == "validate_photographer_credit"


def test_upload_rejects_blank_photographer_credit():
    client = TestClient(app)

    response = client.post(
        "/images/upload",
        files={
            "file": ("cover.jpg", b"image-bytes", "image/jpeg"),
        },
        data={
            "external_ref": "article-upload-credit",
            "alt_text": "Alt text",
            "photographer_credit": "   ",
            "location_ref": "42",
        },
        headers=_auth_headers(),
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["step"] == "validate_photographer_credit"


def test_upload_variants_returns_structured_payload_error(monkeypatch):
    client = TestClient(app)

    async def fake_find_media_set(self, external_ref: str):
        return None

    async def fake_create_media_set(
        self,
        title: str,
        alt_text: str,
        external_ref: str,
        location_ref: int | None = None,
        tags: list | None = None,
    ):
        assert location_ref == 321
        assert tags is None
        return "23"

    async def fake_upload_image(
        self,
        variant,
        alt_text: str,
        photographer_credit: str = "",
        media_set_id: str | None = None,
        location_ref: int | None = None,
        tags: list | None = None,
    ):
        assert location_ref == 321
        assert tags is None
        assert photographer_credit == "Photo by Test Photographer"
        if variant.variant_type.value == "thumbnail":
            return "101"
        raise PayloadUploadError(
            step="upload_image(square)",
            message="Payload rejected the upload",
            status_code=500,
            detail="Something went wrong.",
            request_url="http://localhost:4000/api/media-assets",
        )

    monkeypatch.setattr(
        PayloadClient,
        "find_media_set_by_external_ref",
        fake_find_media_set,
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

    response = client.post(
        "/images/upload-variants",
        files=_variant_files()
        + _variant_form_parts(
            variant_types=[
                "thumbnail",
                "square",
                "wide",
                "portrait",
                "hero",
                "open_graph",
                "editorial",
            ],
            external_ref="article-500",
            alt_text="Alt text",
            location_ref=321,
            photographer_credit="Photo by Test Photographer",
        ),
        headers=_auth_headers(),
    )

    assert response.status_code == 502
    detail = response.json()["detail"]
    assert detail["message"] == "Failed to upload variants to Payload CMS"
    assert detail["step"] == "upload_image(square)"
    assert detail["failed_variant"] == "square"
    assert detail["media_set_id"] == "23"
    assert detail["partial_variant_asset_ids"] == {"thumbnail": "101"}
    assert detail["payload_error"]["status_code"] == 500
    assert detail["payload_error"]["detail"] == "Something went wrong."
