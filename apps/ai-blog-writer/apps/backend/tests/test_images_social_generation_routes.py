from fastapi.testclient import TestClient

from app.main import app
from app.features.images.image_processor import ImageVariantType, ProcessedVariant
from app.features.images.payload_client import PayloadClient
from tests.images_route_test_support import _auth_headers


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

    async def fake_download_media_asset_file(
        *, payload_client, jwt_token: str, filename: str
    ):
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
        "app.features.images.social.routes._download_media_asset_file",
        fake_download_media_asset_file,
    )
    monkeypatch.setattr(
        "app.features.images.social.routes.process_single_variant",
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
    assert (
        payload["generatedImageUrl"]
        == "https://cdn.example.com/featured_open_graph.webp"
    )
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


def test_generate_social_image_rejects_missing_featured_reference():
    client = TestClient(app)

    response = client.post(
        "/images/generate-social-image",
        json={},
        headers=_auth_headers(),
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["step"] == "validate_featured_asset_id"


def test_generate_social_image_rejects_non_positive_featured_media_set_id():
    client = TestClient(app)

    response = client.post(
        "/images/generate-social-image",
        json={"featuredMediaSetId": 0},
        headers=_auth_headers(),
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["step"] == "validate_featured_media_set_id"
    assert detail["featured_media_set_id"] == 0


def test_generate_social_image_supports_featured_media_set_id(monkeypatch):
    client = TestClient(app)

    async def fake_list_media_assets(self, media_set_id: str | int):
        assert str(media_set_id) == "555"
        return [
            {
                "id": "31",
                "filename": "composite_square.webp",
                "mediaSet": "555",
                "variant": "square",
                "width": 1080,
                "height": 1080,
                "bunny_original_url": None,
                "url": None,
            },
            {
                "id": "32",
                "filename": "composite_hero.webp",
                "mediaSet": "555",
                "variant": "hero",
                "width": 2100,
                "height": 900,
                "bunny_original_url": None,
                "url": None,
            },
        ]

    async def fake_get_media_asset(self, asset_id: str | int):
        assert str(asset_id) == "902"
        return {
            "id": "902",
            "filename": "composite_open_graph.webp",
            "mediaSet": "555",
            "variant": "open_graph",
            "width": 1200,
            "height": 630,
            "bunny_original_url": "https://cdn.example.com/composite_open_graph.webp",
            "url": None,
        }

    async def fake_upload_image(
        self,
        variant,
        alt_text: str,
        photographer_credit: str = "",
        media_set_id: str | None = None,
        location_ref: int | None = None,
    ):
        assert variant.variant_type.value == "open_graph"
        assert media_set_id == "555"
        return "902"

    async def fake_download_media_asset_file(
        *, payload_client, jwt_token: str, filename: str
    ):
        assert filename == "composite_hero.webp"
        return b"source-image-bytes"

    def fake_process_single_variant(
        source_buffer: bytes,
        original_filename: str,
        variant_type: ImageVariantType,
        quality: int = 85,
    ):
        assert source_buffer == b"source-image-bytes"
        assert variant_type == ImageVariantType.OPEN_GRAPH
        return ProcessedVariant(
            variant_type=ImageVariantType.OPEN_GRAPH,
            buffer=b"og-image-bytes",
            filename="composite_hero_open_graph.webp",
            width=1200,
            height=630,
            content_type="image/webp",
            file_size=321,
        )

    monkeypatch.setattr(
        PayloadClient,
        "list_media_assets_by_media_set",
        fake_list_media_assets,
    )
    monkeypatch.setattr(
        PayloadClient,
        "get_media_asset_by_id",
        fake_get_media_asset,
    )
    monkeypatch.setattr(
        PayloadClient,
        "upload_image",
        fake_upload_image,
    )
    monkeypatch.setattr(
        "app.features.images.social.routes._download_media_asset_file",
        fake_download_media_asset_file,
    )
    monkeypatch.setattr(
        "app.features.images.social.routes.process_single_variant",
        fake_process_single_variant,
    )

    response = client.post(
        "/images/generate-social-image",
        json={"featuredMediaSetId": 555},
        headers=_auth_headers(),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["featuredAssetId"] is None
    assert payload["mediaSetId"] == "555"
    assert payload["sourceAssetId"] == "32"
    assert payload["generatedAssetId"] == "902"
    assert (
        payload["generatedImageUrl"]
        == "https://cdn.example.com/composite_open_graph.webp"
    )


def test_generate_social_image_supports_featured_asset_without_media_set(
    monkeypatch,
):
    client = TestClient(app)

    async def fake_get_media_asset_after_upload(self, asset_id: str | int):
        if str(asset_id) == "88":
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
        if str(asset_id) == "889":
            return {
                "id": "889",
                "filename": "orphan_image_open_graph.webp",
                "mediaSet": None,
                "variant": "open_graph",
                "width": 1200,
                "height": 630,
                "bunny_original_url": "https://cdn.example.com/orphan_image_open_graph.webp",
                "url": None,
            }
        return None

    async def fake_list_media_assets(self, media_set_id: str | int):
        raise AssertionError(
            "list_media_assets_by_media_set should not be called for orphan assets"
        )

    async def fake_create_media_set(
        self,
        title: str,
        alt_text: str,
        external_ref: str,
        location_ref: int | None = None,
        tags: list | None = None,
    ):
        assert title == "Social OG featured 88"
        assert alt_text == ""
        assert external_ref.startswith("social-og-featured-88-")
        assert location_ref is None
        assert tags is None
        return "ms_social_88"

    async def fake_upload_image(
        self,
        variant,
        alt_text: str,
        photographer_credit: str = "",
        media_set_id: str | None = None,
        location_ref: int | None = None,
    ):
        assert variant.variant_type.value == "open_graph"
        assert media_set_id == "ms_social_88"
        return "889"

    async def fake_download_media_asset_file(
        *,
        payload_client,
        jwt_token: str,
        filename: str,
    ):
        assert filename == "orphan_image.webp"
        return b"source-image"

    def fake_process_single_variant(
        source_buffer: bytes,
        original_filename: str,
        variant_type: ImageVariantType,
        quality: int = 85,
    ):
        assert source_buffer == b"source-image"
        assert original_filename == "orphan_image.webp"
        return ProcessedVariant(
            variant_type=variant_type,
            buffer=b"og-bytes",
            filename="orphan_image_open_graph.webp",
            width=1200,
            height=630,
            content_type="image/webp",
            file_size=123,
        )

    monkeypatch.setattr(
        PayloadClient,
        "get_media_asset_by_id",
        fake_get_media_asset_after_upload,
    )
    monkeypatch.setattr(
        PayloadClient,
        "list_media_assets_by_media_set",
        fake_list_media_assets,
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
        "app.features.images.social.routes._download_media_asset_file",
        fake_download_media_asset_file,
    )
    monkeypatch.setattr(
        "app.features.images.social.routes.process_single_variant",
        fake_process_single_variant,
    )

    response = client.post(
        "/images/generate-social-image",
        json={"featuredAssetId": 88},
        headers=_auth_headers(),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["featuredAssetId"] == "88"
    assert payload["mediaSetId"] == "ms_social_88"
    assert payload["sourceAssetId"] == "88"
    assert payload["generatedAssetId"] == "889"
    assert (
        payload["generatedImageUrl"]
        == "https://cdn.example.com/orphan_image_open_graph.webp"
    )


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

    async def fake_download_media_asset_file(
        *, payload_client, jwt_token: str, filename: str
    ):
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
        "app.features.images.social.routes._download_media_asset_file",
        fake_download_media_asset_file,
    )
    monkeypatch.setattr(
        "app.features.images.social.routes.process_single_variant",
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
