from fastapi.testclient import TestClient

from app.main import app
from app.features.images.payload_client import PayloadClient, PayloadUploadError


def _auth_headers() -> dict[str, str]:
    return {"Authorization": "Bearer test-token"}


def _variant_files() -> list[tuple[str, tuple[str, bytes, str]]]:
    return [
        ("variants", ("thumbnail.webp", b"thumbnail", "image/webp")),
        ("variants", ("square.webp", b"square", "image/webp")),
        ("variants", ("wide.webp", b"wide", "image/webp")),
        ("variants", ("portrait.webp", b"portrait", "image/webp")),
        ("variants", ("hero.webp", b"hero", "image/webp")),
    ]


def _variant_form_parts(
    variant_types: list[str],
    external_ref: str,
    alt_text: str,
) -> list[tuple[str, tuple[None, str]]]:
    return (
        [("variant_types", (None, variant_type)) for variant_type in variant_types]
        + [("external_ref", (None, external_ref)), ("alt_text", (None, alt_text))]
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
            ],
            external_ref="article-dup",
            alt_text="Alt text",
        ),
        headers=_auth_headers(),
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["step"] == "validate_variant_types"
    assert detail["duplicate_types"] == ["thumbnail"]
    assert detail["missing_types"] == ["square"]


def test_upload_variants_returns_structured_payload_error(monkeypatch):
    client = TestClient(app)

    async def fake_find_media_set(self, external_ref: str):
        return None

    async def fake_create_media_set(
        self,
        title: str,
        alt_text: str,
        external_ref: str,
    ):
        return "23"

    async def fake_upload_image(self, variant, alt_text: str, media_set_id: str | None = None):
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
            ],
            external_ref="article-500",
            alt_text="Alt text",
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
