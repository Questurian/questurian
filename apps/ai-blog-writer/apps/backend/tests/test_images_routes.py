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
        ("variants", ("open_graph.webp", b"open-graph", "image/webp")),
        ("variants", ("editorial.webp", b"editorial", "image/webp")),
    ]


def _variant_form_parts(
    variant_types: list[str],
    external_ref: str,
    alt_text: str,
    location_ref: int,
    photographer_credit: str = "",
) -> list[tuple[str, tuple[None, str]]]:
    return (
        [("variant_types", (None, variant_type)) for variant_type in variant_types]
        + [
            ("external_ref", (None, external_ref)),
            ("alt_text", (None, alt_text)),
            ("photographer_credit", (None, photographer_credit)),
            ("location_ref", (None, str(location_ref))),
        ]
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


def test_upload_variants_rejects_non_positive_location_ref():
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
            location_ref=0,
        ),
        headers=_auth_headers(),
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["step"] == "validate_location_ref"
    assert detail["location_ref"] == 0


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
    ):
        assert location_ref == 321
        return "23"

    async def fake_upload_image(
        self,
        variant,
        alt_text: str,
        photographer_credit: str = "",
        media_set_id: str | None = None,
        location_ref: int | None = None,
    ):
        assert location_ref == 321
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


def test_pexels_search_requires_api_key(monkeypatch):
    client = TestClient(app)
    monkeypatch.delenv("PEXELS_API_KEY", raising=False)

    response = client.get("/images/pexels/search", params={"query": "beach"})

    assert response.status_code == 500
    detail = response.json()["detail"]
    assert detail["step"] == "validate_pexels_key"
    assert detail["env_var"] == "PEXELS_API_KEY"


def test_pexels_search_returns_mapped_results(monkeypatch):
    client = TestClient(app)
    monkeypatch.setenv("PEXELS_API_KEY", "test-pexels-key")

    class FakePexelsResponse:
        status_code = 200

        def json(self):
            return {
                "page": 1,
                "per_page": 2,
                "total_results": 999,
                "photos": [
                    {
                        "id": 123,
                        "width": 3000,
                        "height": 2000,
                        "url": "https://www.pexels.com/photo/123/",
                        "photographer": "Jane Doe",
                        "photographer_url": "https://www.pexels.com/@janedoe",
                        "alt": "Mountain lake",
                        "src": {
                            "medium": "https://images.pexels.com/photos/123/medium.jpeg",
                            "large2x": "https://images.pexels.com/photos/123/large2x.jpeg",
                            "portrait": "https://images.pexels.com/photos/123/portrait.jpeg",
                        },
                    }
                ],
            }

    class FakeAsyncClient:
        def __init__(self, timeout: float):
            assert timeout == 15.0

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def get(self, url: str, params: dict, headers: dict):
            assert url == "https://api.pexels.com/v1/search"
            assert headers["Authorization"] == "test-pexels-key"
            assert params["query"] == "mountains"
            assert params["per_page"] == 2
            assert params["page"] == 1
            return FakePexelsResponse()

    monkeypatch.setattr(
        "app.features.images.routes.httpx.AsyncClient",
        FakeAsyncClient,
    )

    response = client.get(
        "/images/pexels/search",
        params={"query": "mountains", "per_page": 2},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["query"] == "mountains"
    assert payload["per_page"] == 2
    assert payload["total_results"] == 999
    assert len(payload["photos"]) == 1
    assert payload["photos"][0]["id"] == 123
    assert payload["photos"][0]["photographer"] == "Jane Doe"
    assert payload["photos"][0]["image_url"].endswith("medium.jpeg")
