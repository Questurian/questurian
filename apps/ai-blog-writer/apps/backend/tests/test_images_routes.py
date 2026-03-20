import base64

from fastapi.testclient import TestClient

from app.main import app
from app.features.images.image_processor import ImageVariantType, ProcessedVariant
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
    photographer_credit: str = "Photo by Test",
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
        "app.features.images.routes.process_single_variant",
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
        "app.features.images.routes._wait_for_bunny_original_url",
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
        "app.features.images.routes._download_external_image",
        fake_download,
    )
    monkeypatch.setattr(
        "app.features.images.routes.process_image_variants",
        fake_process,
    )
    monkeypatch.setattr(
        "app.features.images.routes.upload_image_set",
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
        "app.features.images.routes._download_external_image",
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


def test_generate_social_image_success(monkeypatch):
    client = TestClient(app)

    async def fake_get_media_asset(self, asset_id: str | int):
        if str(asset_id) == "77":
            return {
                "id": "77",
                "filename": "featured_editorial.webp",
                "mediaSet": "ms_777",
                "variant": "editorial",
                "width": 1600,
                "height": 1200,
                "bunny_original_url": None,
                "url": None,
            }
        if str(asset_id) == "901":
            return {
                "id": "901",
                "filename": "featured_open_graph.webp",
                "mediaSet": "ms_777",
                "variant": "open_graph",
                "width": 1200,
                "height": 630,
                "bunny_original_url": "https://cdn.example.com/featured_open_graph.webp",
                "url": None,
            }
        return None

    async def fake_list_media_assets(self, media_set_id: str | int):
        assert str(media_set_id) == "ms_777"
        return [
            {
                "id": "11",
                "filename": "small_square.webp",
                "mediaSet": "ms_777",
                "variant": "square",
                "width": 1080,
                "height": 1080,
                "bunny_original_url": None,
                "url": None,
            },
            {
                "id": "12",
                "filename": "large_hero.webp",
                "mediaSet": "ms_777",
                "variant": "hero",
                "width": 2100,
                "height": 900,
                "bunny_original_url": None,
                "url": None,
            },
        ]

    async def fake_upload_image(
        self,
        variant,
        alt_text: str,
        photographer_credit: str = "",
        media_set_id: str | None = None,
        location_ref: int | None = None,
    ):
        assert variant.variant_type.value == "open_graph"
        assert media_set_id == "ms_777"
        assert location_ref is None
        return "901"

    async def fake_download_media_asset_file(*, payload_client, jwt_token: str, filename: str):
        assert jwt_token == "test-token"
        assert filename == "large_hero.webp"
        return b"source-image-bytes"

    def fake_process_single_variant(
        source_buffer: bytes,
        original_filename: str,
        variant_type: ImageVariantType,
        quality: int = 85,
    ):
        assert source_buffer == b"source-image-bytes"
        assert original_filename == "large_hero.webp"
        assert variant_type == ImageVariantType.OPEN_GRAPH
        assert quality == 85
        return ProcessedVariant(
            variant_type=ImageVariantType.OPEN_GRAPH,
            buffer=b"og-image-bytes",
            filename="large_hero_open_graph.webp",
            width=1200,
            height=630,
            content_type="image/webp",
            file_size=321,
        )

    monkeypatch.setattr(
        PayloadClient,
        "get_media_asset_by_id",
        fake_get_media_asset,
    )
    monkeypatch.setattr(
        PayloadClient,
        "list_media_assets_by_media_set",
        fake_list_media_assets,
    )
    monkeypatch.setattr(
        PayloadClient,
        "upload_image",
        fake_upload_image,
    )
    monkeypatch.setattr(
        "app.features.images.routes._download_media_asset_file",
        fake_download_media_asset_file,
    )
    monkeypatch.setattr(
        "app.features.images.routes.process_single_variant",
        fake_process_single_variant,
    )

    response = client.post(
        "/images/generate-social-image",
        json={"featuredAssetId": 77},
        headers=_auth_headers(),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["mediaSetId"] == "ms_777"
    assert payload["sourceAssetId"] == "12"
    assert payload["generatedAssetId"] == "901"
    assert payload["generatedImageUrl"] == "https://cdn.example.com/featured_open_graph.webp"
    assert payload["width"] == 1200
    assert payload["height"] == 630


def test_generate_social_image_rejects_non_positive_featured_asset_id():
    client = TestClient(app)

    response = client.post(
        "/images/generate-social-image",
        json={"featuredAssetId": 0},
        headers=_auth_headers(),
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["step"] == "validate_featured_asset_id"
    assert detail["featured_asset_id"] == 0


def test_generate_social_image_rejects_featured_asset_without_media_set(monkeypatch):
    client = TestClient(app)

    async def fake_get_media_asset(self, asset_id: str | int):
        assert str(asset_id) == "88"
        return {
            "id": "88",
            "filename": "orphan_image.webp",
            "mediaSet": None,
            "variant": "editorial",
            "width": 1600,
            "height": 1200,
            "bunny_original_url": None,
            "url": None,
        }

    monkeypatch.setattr(
        PayloadClient,
        "get_media_asset_by_id",
        fake_get_media_asset,
    )

    response = client.post(
        "/images/generate-social-image",
        json={"featuredAssetId": 88},
        headers=_auth_headers(),
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["step"] == "validate_featured_media_set"
    assert detail["featured_asset_id"] == 88


def test_generate_social_image_requires_generated_bunny_url(monkeypatch):
    client = TestClient(app)

    async def fake_get_media_asset(self, asset_id: str | int):
        if str(asset_id) == "99":
            return {
                "id": "99",
                "filename": "featured_editorial.webp",
                "mediaSet": "ms_999",
                "variant": "editorial",
                "width": 1600,
                "height": 1200,
                "bunny_original_url": None,
                "url": None,
            }
        if str(asset_id) == "777":
            return {
                "id": "777",
                "filename": "generated_open_graph.webp",
                "mediaSet": "ms_999",
                "variant": "open_graph",
                "width": 1200,
                "height": 630,
                "bunny_original_url": None,
                "url": "https://payload.example.com/file.webp",
            }
        return None

    async def fake_list_media_assets(self, media_set_id: str | int):
        assert str(media_set_id) == "ms_999"
        return [
            {
                "id": "201",
                "filename": "hero.webp",
                "mediaSet": "ms_999",
                "variant": "hero",
                "width": 2100,
                "height": 900,
                "bunny_original_url": None,
                "url": None,
            },
        ]

    async def fake_upload_image(
        self,
        variant,
        alt_text: str,
        photographer_credit: str = "",
        media_set_id: str | None = None,
        location_ref: int | None = None,
    ):
        assert variant.variant_type.value == "open_graph"
        assert media_set_id == "ms_999"
        return "777"

    async def fake_download_media_asset_file(*, payload_client, jwt_token: str, filename: str):
        assert filename == "hero.webp"
        return b"source-image"

    def fake_process_single_variant(
        source_buffer: bytes,
        original_filename: str,
        variant_type: ImageVariantType,
        quality: int = 85,
    ):
        return ProcessedVariant(
            variant_type=variant_type,
            buffer=b"og-bytes",
            filename="hero_open_graph.webp",
            width=1200,
            height=630,
            content_type="image/webp",
            file_size=123,
        )

    monkeypatch.setattr(
        PayloadClient,
        "get_media_asset_by_id",
        fake_get_media_asset,
    )
    monkeypatch.setattr(
        PayloadClient,
        "list_media_assets_by_media_set",
        fake_list_media_assets,
    )
    monkeypatch.setattr(
        PayloadClient,
        "upload_image",
        fake_upload_image,
    )
    monkeypatch.setattr(
        "app.features.images.routes._download_media_asset_file",
        fake_download_media_asset_file,
    )
    monkeypatch.setattr(
        "app.features.images.routes.process_single_variant",
        fake_process_single_variant,
    )

    response = client.post(
        "/images/generate-social-image",
        json={"featuredAssetId": 99},
        headers=_auth_headers(),
    )

    assert response.status_code == 502
    detail = response.json()["detail"]
    assert detail["step"] == "validate_generated_bunny_url"
    assert detail["generated_asset_id"] == "777"


def test_flux_edit_requires_bfl_api_key(monkeypatch):
    client = TestClient(app)
    monkeypatch.delenv("BFL_API_KEY", raising=False)

    response = client.post(
        "/images/flux-edit",
        data={"prompt": "Keep the scene composition intact."},
        files={
            "reference_image": ("reference.png", b"reference-bytes", "image/png"),
        },
        headers=_auth_headers(),
    )

    assert response.status_code == 500
    detail = response.json()["detail"]
    assert detail["step"] == "validate_bfl_config"
    assert detail["env_var"] == "BFL_API_KEY"


def test_flux_edit_success(monkeypatch):
    client = TestClient(app)
    monkeypatch.setenv("BFL_API_KEY", "test-bfl-key")
    monkeypatch.setenv("BFL_BASE_URL", "https://api.bfl.ai")
    monkeypatch.setenv("BFL_MODEL_ID", "flux-2-pro-preview")

    calls = {
        "payload": None,
        "poll_count": 0,
    }

    class FakeResponse:
        def __init__(
            self,
            status_code: int,
            *,
            json_body=None,
            text: str = "",
            content: bytes = b"",
            headers: dict | None = None,
        ):
            self.status_code = status_code
            self._json_body = json_body
            self.text = text
            self.content = content
            self.headers = headers or {}

        def json(self):
            if self._json_body is None:
                raise ValueError("No JSON body")
            return self._json_body

    class FakeAsyncClient:
        def __init__(self, timeout: float, follow_redirects: bool = False):
            self.timeout = timeout
            self.follow_redirects = follow_redirects

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url: str, headers: dict, json: dict):
            assert self.timeout == 30.0
            assert url == "https://api.bfl.ai/v1/flux-2-pro-preview"
            assert headers["x-key"] == "test-bfl-key"
            assert headers["Content-Type"] == "application/json"
            calls["payload"] = json
            return FakeResponse(
                200,
                json_body={
                    "id": "task_123",
                    "polling_url": "https://api.bfl.ai/v1/get_result?id=task_123",
                    "cost": 3.5,
                    "input_mp": 1.25,
                    "output_mp": 1.0,
                },
            )

        async def get(self, url: str, headers: dict | None = None):
            if url == "https://api.bfl.ai/v1/get_result?id=task_123":
                assert self.timeout == 15.0
                assert headers is not None
                assert headers["x-key"] == "test-bfl-key"
                calls["poll_count"] += 1
                if calls["poll_count"] == 1:
                    return FakeResponse(
                        200,
                        json_body={"id": "task_123", "status": "Pending"},
                    )
                return FakeResponse(
                    200,
                    json_body={
                        "id": "task_123",
                        "status": "Ready",
                        "result": {"sample": "https://delivery.bfl.ai/result.png"},
                    },
                )

            assert url == "https://delivery.bfl.ai/result.png"
            assert self.timeout == 60.0
            assert self.follow_redirects is True
            return FakeResponse(
                200,
                content=b"png-bytes",
                headers={"content-type": "image/png"},
            )

    monkeypatch.setattr(
        "app.features.images.bfl_client.httpx.AsyncClient",
        FakeAsyncClient,
    )

    response = client.post(
        "/images/flux-edit",
        data={"prompt": "Keep the exact framing and improve realism."},
        files={
            "reference_image": ("reference.png", b"reference-bytes", "image/png"),
        },
        headers=_auth_headers(),
    )

    assert response.status_code == 200
    assert response.content == b"png-bytes"
    assert response.headers["content-type"].startswith("image/png")
    assert response.headers["x-bfl-request-id"] == "task_123"
    assert response.headers["x-bfl-model"] == "flux-2-pro-preview"
    assert response.headers["x-bfl-cost"] == "3.5"
    assert response.headers["x-bfl-input-mp"] == "1.25"
    assert response.headers["x-bfl-output-mp"] == "1.0"
    assert "flux-2-pro-preview-task_123.png" in response.headers["content-disposition"]
    assert calls["poll_count"] == 2

    assert calls["payload"]["prompt"] == "Keep the exact framing and improve realism."
    assert calls["payload"]["disable_pup"] is True
    assert calls["payload"]["safety_tolerance"] == 2
    assert calls["payload"]["output_format"] == "png"
    assert "width" not in calls["payload"]
    assert "height" not in calls["payload"]
    assert "seed" not in calls["payload"]
    assert base64.b64decode(calls["payload"]["input_image"]) == b"reference-bytes"


def test_flux_edit_supports_model_size_and_extra_references(monkeypatch):
    client = TestClient(app)
    monkeypatch.setenv("BFL_API_KEY", "test-bfl-key")
    monkeypatch.setenv("BFL_BASE_URL", "https://api.bfl.ai")
    monkeypatch.setenv("BFL_MODEL_ID", "flux-2-pro-preview")

    calls = {
        "payload": None,
        "poll_count": 0,
    }

    class FakeResponse:
        def __init__(
            self,
            status_code: int,
            *,
            json_body=None,
            text: str = "",
            content: bytes = b"",
            headers: dict | None = None,
        ):
            self.status_code = status_code
            self._json_body = json_body
            self.text = text
            self.content = content
            self.headers = headers or {}

        def json(self):
            if self._json_body is None:
                raise ValueError("No JSON body")
            return self._json_body

    class FakeAsyncClient:
        def __init__(self, timeout: float, follow_redirects: bool = False):
            self.timeout = timeout
            self.follow_redirects = follow_redirects

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url: str, headers: dict, json: dict):
            assert self.timeout == 30.0
            assert url == "https://api.bfl.ai/v1/flux-2-flex"
            assert headers["x-key"] == "test-bfl-key"
            calls["payload"] = json
            return FakeResponse(
                200,
                json_body={
                    "id": "task_flex",
                    "polling_url": "https://api.bfl.ai/v1/get_result?id=task_flex",
                    "cost": 7.2,
                    "input_mp": 1.8,
                    "output_mp": 0.75,
                },
            )

        async def get(self, url: str, headers: dict | None = None):
            if url == "https://api.bfl.ai/v1/get_result?id=task_flex":
                calls["poll_count"] += 1
                if calls["poll_count"] == 1:
                    return FakeResponse(200, json_body={"id": "task_flex", "status": "Pending"})
                return FakeResponse(
                    200,
                    json_body={
                        "id": "task_flex",
                        "status": "Ready",
                        "result": {"sample": "https://delivery.bfl.ai/flex.png"},
                    },
                )

            assert url == "https://delivery.bfl.ai/flex.png"
            return FakeResponse(
                200,
                content=b"flex-bytes",
                headers={"content-type": "image/png"},
            )

    monkeypatch.setattr(
        "app.features.images.bfl_client.httpx.AsyncClient",
        FakeAsyncClient,
    )

    response = client.post(
        "/images/flux-edit",
        data={
            "prompt": "Keep the room but swap the rug and pull the styling from the other references.",
            "model_id": "flux-2-flex",
            "width": "1200",
            "height": "624",
            "safety_tolerance": "4",
            "prompt_upsampling": "true",
            "seed": "42",
        },
        files=[
            ("reference_image", ("reference.png", b"reference-bytes", "image/png")),
            ("additional_reference_images", ("texture.png", b"texture-bytes", "image/png")),
            ("additional_reference_images", ("chair.png", b"chair-bytes", "image/png")),
        ],
        headers=_auth_headers(),
    )

    assert response.status_code == 200
    assert response.content == b"flex-bytes"
    assert response.headers["x-bfl-model"] == "flux-2-flex"
    assert calls["poll_count"] == 2
    assert calls["payload"]["prompt_upsampling"] is True
    assert "disable_pup" not in calls["payload"]
    assert calls["payload"]["width"] == 1200
    assert calls["payload"]["height"] == 624
    assert calls["payload"]["safety_tolerance"] == 4
    assert calls["payload"]["seed"] == 42
    assert base64.b64decode(calls["payload"]["input_image"]) == b"reference-bytes"
    assert base64.b64decode(calls["payload"]["input_image_2"]) == b"texture-bytes"
    assert base64.b64decode(calls["payload"]["input_image_3"]) == b"chair-bytes"


def test_flux_edit_rejects_partial_dimensions():
    client = TestClient(app)

    response = client.post(
        "/images/flux-edit",
        data={
            "prompt": "Keep the architecture as-is.",
            "width": "1200",
        },
        files={
            "reference_image": ("reference.png", b"reference-bytes", "image/png"),
        },
        headers=_auth_headers(),
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["step"] == "validate_flux_dimensions"
    assert detail["width"] == 1200
    assert "height" not in detail


def test_flux_edit_returns_structured_moderation_error(monkeypatch):
    client = TestClient(app)
    monkeypatch.setenv("BFL_API_KEY", "test-bfl-key")

    class FakeResponse:
        def __init__(self, status_code: int, *, json_body=None):
            self.status_code = status_code
            self._json_body = json_body
            self.text = ""
            self.headers = {}
            self.content = b""

        def json(self):
            return self._json_body

    class FakeAsyncClient:
        def __init__(self, timeout: float, follow_redirects: bool = False):
            self.timeout = timeout
            self.follow_redirects = follow_redirects

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url: str, headers: dict, json: dict):
            return FakeResponse(
                200,
                json_body={
                    "id": "task_456",
                    "polling_url": "https://api.bfl.ai/v1/get_result?id=task_456",
                },
            )

        async def get(self, url: str, headers: dict | None = None):
            return FakeResponse(
                200,
                json_body={"id": "task_456", "status": "Request Moderated", "result": None},
            )

    monkeypatch.setattr(
        "app.features.images.bfl_client.httpx.AsyncClient",
        FakeAsyncClient,
    )

    response = client.post(
        "/images/flux-edit",
        data={"prompt": "Replace the landmark with something unsafe."},
        files={
            "reference_image": ("reference.png", b"reference-bytes", "image/png"),
        },
        headers=_auth_headers(),
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["message"] == "BFL moderated this request"
    assert detail["step"] == "poll_flux_edit"
    assert detail["bfl_status"] == "Request Moderated"


def test_flux_edit_preserves_upstream_rate_limit_status(monkeypatch):
    client = TestClient(app)
    monkeypatch.setenv("BFL_API_KEY", "test-bfl-key")

    class FakeResponse:
        status_code = 429
        text = '{"detail":"Rate limit exceeded"}'
        headers = {}
        content = b""

        def json(self):
            return {"detail": "Rate limit exceeded"}

    class FakeAsyncClient:
        def __init__(self, timeout: float, follow_redirects: bool = False):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url: str, headers: dict, json: dict):
            return FakeResponse()

    monkeypatch.setattr(
        "app.features.images.bfl_client.httpx.AsyncClient",
        FakeAsyncClient,
    )

    response = client.post(
        "/images/flux-edit",
        data={"prompt": "Keep the architecture as-is."},
        files={
            "reference_image": ("reference.png", b"reference-bytes", "image/png"),
        },
        headers=_auth_headers(),
    )

    assert response.status_code == 429
    detail = response.json()["detail"]
    assert detail["message"] == "BFL request failed"
    assert detail["step"] == "submit_flux_edit"
    assert detail["provider_status_code"] == 429


def test_flux_edit_preserves_upstream_service_unavailable_status(monkeypatch):
    client = TestClient(app)
    monkeypatch.setenv("BFL_API_KEY", "test-bfl-key")

    class FakeResponse:
        def __init__(self, status_code: int, *, json_body=None):
            self.status_code = status_code
            self._json_body = json_body
            self.text = '{"detail":"BFL maintenance"}' if status_code == 503 else ""
            self.headers = {}
            self.content = b""

        def json(self):
            if self._json_body is not None:
                return self._json_body
            return {"detail": "BFL maintenance"}

    class FakeAsyncClient:
        def __init__(self, timeout: float, follow_redirects: bool = False):
            self.timeout = timeout
            self.follow_redirects = follow_redirects

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url: str, headers: dict, json: dict):
            return FakeResponse(
                200,
                json_body={
                    "id": "task_789",
                    "polling_url": "https://api.bfl.ai/v1/get_result?id=task_789",
                },
            )

        async def get(self, url: str, headers: dict | None = None):
            if "get_result" in url:
                return FakeResponse(503)
            raise AssertionError(url)

    monkeypatch.setattr(
        "app.features.images.bfl_client.httpx.AsyncClient",
        FakeAsyncClient,
    )

    response = client.post(
        "/images/flux-edit",
        data={"prompt": "Keep the architecture as-is."},
        files={
            "reference_image": ("reference.png", b"reference-bytes", "image/png"),
        },
        headers=_auth_headers(),
    )

    assert response.status_code == 503
    detail = response.json()["detail"]
    assert detail["message"] == "BFL request failed"
    assert detail["step"] == "poll_flux_edit"
    assert detail["provider_status_code"] == 503


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
            assert params["orientation"] == "portrait"
            return FakePexelsResponse()

    monkeypatch.setattr(
        "app.features.images.routes.httpx.AsyncClient",
        FakeAsyncClient,
    )

    response = client.get(
        "/images/pexels/search",
        params={"query": "mountains", "per_page": 2, "orientation": "portrait"},
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


def test_pexels_search_rejects_invalid_orientation(monkeypatch):
    client = TestClient(app)
    monkeypatch.setenv("PEXELS_API_KEY", "test-pexels-key")

    response = client.get(
        "/images/pexels/search",
        params={"query": "mountains", "orientation": "diagonal"},
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["step"] == "validate_pexels_query"
    assert detail["orientation"] == "diagonal"


def test_unsplash_search_requires_access_key(monkeypatch):
    client = TestClient(app)
    monkeypatch.delenv("UNSPLASH_ACCESS_KEY", raising=False)

    response = client.get("/images/unsplash/search", params={"query": "beach"})

    assert response.status_code == 500
    detail = response.json()["detail"]
    assert detail["step"] == "validate_unsplash_key"
    assert detail["env_var"] == "UNSPLASH_ACCESS_KEY"


def test_unsplash_search_returns_mapped_results(monkeypatch):
    client = TestClient(app)
    monkeypatch.setenv("UNSPLASH_ACCESS_KEY", "test-unsplash-key")

    class FakeUnsplashResponse:
        status_code = 200

        def json(self):
            return {
                "total": 321,
                "results": [
                    {
                        "id": "abc123",
                        "width": 4000,
                        "height": 2600,
                        "description": "Sunset cliffs",
                        "alt_description": "Orange sky over ocean cliffs",
                        "urls": {
                            "small": "https://images.unsplash.com/photo-small",
                            "regular": "https://images.unsplash.com/photo-regular",
                            "full": "https://images.unsplash.com/photo-full",
                        },
                        "links": {
                            "html": "https://unsplash.com/photos/abc123",
                        },
                        "user": {
                            "name": "Alex Lens",
                            "links": {
                                "html": "https://unsplash.com/@alexlens",
                            },
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
            assert url == "https://api.unsplash.com/search/photos"
            assert headers["Authorization"] == "Client-ID test-unsplash-key"
            assert headers["Accept-Version"] == "v1"
            assert params["query"] == "coastline"
            assert params["per_page"] == 12
            assert params["page"] == 1
            assert params["orientation"] == "squarish"
            return FakeUnsplashResponse()

    monkeypatch.setattr(
        "app.features.images.routes.httpx.AsyncClient",
        FakeAsyncClient,
    )

    response = client.get(
        "/images/unsplash/search",
        params={"query": "coastline", "per_page": 12, "orientation": "square"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["query"] == "coastline"
    assert payload["per_page"] == 12
    assert payload["total_results"] == 321
    assert len(payload["photos"]) == 1
    assert payload["photos"][0]["id"] == "abc123"
    assert payload["photos"][0]["photographer"] == "Alex Lens"
    assert payload["photos"][0]["image_url"].endswith("photo-small")


def test_unsplash_search_rejects_invalid_orientation(monkeypatch):
    client = TestClient(app)
    monkeypatch.setenv("UNSPLASH_ACCESS_KEY", "test-unsplash-key")

    response = client.get(
        "/images/unsplash/search",
        params={"query": "coastline", "orientation": "diagonal"},
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["step"] == "validate_unsplash_query"
    assert detail["orientation"] == "diagonal"
