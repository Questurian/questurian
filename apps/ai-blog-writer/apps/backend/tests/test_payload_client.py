import asyncio

import pytest

from app.features.images.image_processor import ImageVariantType, ProcessedVariant
from app.features.images.payload_client import PayloadClient, PayloadUploadError


def _variant(variant_type: ImageVariantType) -> ProcessedVariant:
    dimensions = {
        ImageVariantType.THUMBNAIL: (1200, 800),
        ImageVariantType.SQUARE: (1080, 1080),
        ImageVariantType.WIDE: (1920, 1080),
        ImageVariantType.PORTRAIT: (1200, 1500),
        ImageVariantType.HERO: (2100, 900),
        ImageVariantType.OPEN_GRAPH: (1200, 630),
        ImageVariantType.EDITORIAL: (1600, 1200),
    }
    width, height = dimensions[variant_type]
    return ProcessedVariant(
        variant_type=variant_type,
        buffer=b"test-image-bytes",
        filename=f"sample_{variant_type.value}.webp",
        width=width,
        height=height,
        content_type="image/webp",
        file_size=16,
    )


def test_upload_image_replaces_existing_variant_before_post(monkeypatch):
    client = PayloadClient("jwt")
    deleted_asset_ids: list[str] = []
    post_calls = {"count": 0}

    async def fake_find_media_asset(self, media_set_id: str, variant: str):
        assert media_set_id == "7"
        assert variant == ImageVariantType.OPEN_GRAPH.value
        return {"id": "67"}

    async def fake_delete_media_asset(self, asset_id: str):
        deleted_asset_ids.append(asset_id)

    class FakeResponse:
        status_code = 201
        text = '{"doc":{"id":"101"}}'

        @staticmethod
        def json():
            return {"doc": {"id": "101"}}

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, *args, **kwargs):
            post_calls["count"] += 1
            return FakeResponse()

    monkeypatch.setattr(
        PayloadClient,
        "find_media_asset_by_variant",
        fake_find_media_asset,
    )
    monkeypatch.setattr(
        PayloadClient,
        "delete_media_asset",
        fake_delete_media_asset,
    )
    monkeypatch.setattr(
        "app.features.images.payload_client.httpx.AsyncClient",
        FakeAsyncClient,
    )

    asset_id = asyncio.run(
        client.upload_image(
            variant=_variant(ImageVariantType.OPEN_GRAPH),
            alt_text="Alt text",
            photographer_credit="Photo by Test",
            media_set_id="7",
            location_ref=42,
        )
    )

    assert deleted_asset_ids == ["67"]
    assert post_calls["count"] == 1
    assert asset_id == "101"


def test_upload_image_detaches_stale_variant_when_payload_delete_file_missing(monkeypatch):
    client = PayloadClient("jwt")
    detached_assets: list[tuple[str, str, str]] = []
    post_calls = {"count": 0}

    async def fake_find_media_asset(self, media_set_id: str, variant: str):
        assert media_set_id == "7"
        assert variant == ImageVariantType.OPEN_GRAPH.value
        return {"id": "67"}

    async def fake_delete_media_asset(self, asset_id: str):
        raise PayloadUploadError(
            step=f"delete_media_asset({asset_id})",
            message="Failed to delete existing media-asset",
            status_code=500,
            detail="Couldn't delete file: featured-27rb3_open_graph.webp",
        )

    async def fake_detach_media_asset_from_media_set(
        self,
        asset_id: str,
        media_set_id: str,
        variant: str,
    ):
        detached_assets.append((asset_id, media_set_id, variant))
        return True

    class FakeResponse:
        status_code = 201
        text = '{"doc":{"id":"101"}}'

        @staticmethod
        def json():
            return {"doc": {"id": "101"}}

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, *args, **kwargs):
            post_calls["count"] += 1
            return FakeResponse()

    monkeypatch.setattr(
        PayloadClient,
        "find_media_asset_by_variant",
        fake_find_media_asset,
    )
    monkeypatch.setattr(
        PayloadClient,
        "delete_media_asset",
        fake_delete_media_asset,
    )
    monkeypatch.setattr(
        PayloadClient,
        "detach_media_asset_from_media_set",
        fake_detach_media_asset_from_media_set,
        raising=False,
    )
    monkeypatch.setattr(
        "app.features.images.payload_client.httpx.AsyncClient",
        FakeAsyncClient,
    )

    asset_id = asyncio.run(
        client.upload_image(
            variant=_variant(ImageVariantType.OPEN_GRAPH),
            alt_text="Alt text",
            photographer_credit="Photo by Test",
            media_set_id="7",
            location_ref=42,
        )
    )

    assert detached_assets == [("67", "7", "open_graph")]
    assert post_calls["count"] == 1
    assert asset_id == "101"


def test_upload_image_reuses_existing_asset_after_conflict(monkeypatch):
    client = PayloadClient("jwt")
    find_calls = {"count": 0}

    async def fake_find_media_asset(self, media_set_id: str, variant: str):
        find_calls["count"] += 1
        if find_calls["count"] == 1:
            return None
        return {"id": "89"}

    async def fail_delete_media_asset(self, asset_id: str):
        raise AssertionError("delete_media_asset should not be called during conflict recovery")

    class FakeResponse:
        status_code = 500
        text = '{"errors":[{"message":"mediaSet already has a open_graph variant"}]}'

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, *args, **kwargs):
            return FakeResponse()

    monkeypatch.setattr(
        PayloadClient,
        "find_media_asset_by_variant",
        fake_find_media_asset,
    )
    monkeypatch.setattr(
        PayloadClient,
        "delete_media_asset",
        fail_delete_media_asset,
    )
    monkeypatch.setattr(
        "app.features.images.payload_client.httpx.AsyncClient",
        FakeAsyncClient,
    )

    asset_id = asyncio.run(
        client.upload_image(
            variant=_variant(ImageVariantType.OPEN_GRAPH),
            alt_text="Alt text",
            media_set_id="7",
            location_ref=42,
        )
    )

    assert asset_id == "89"
    assert find_calls["count"] == 2


def test_upload_image_raises_when_payload_error_and_no_existing_variant(monkeypatch):
    client = PayloadClient("jwt")

    async def fake_find_media_asset(self, media_set_id: str, variant: str):
        return None

    class FakeResponse:
        status_code = 500
        text = '{"errors":[{"message":"upstream outage"}]}'

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, *args, **kwargs):
            return FakeResponse()

    monkeypatch.setattr(
        PayloadClient,
        "find_media_asset_by_variant",
        fake_find_media_asset,
    )
    monkeypatch.setattr(
        "app.features.images.payload_client.httpx.AsyncClient",
        FakeAsyncClient,
    )

    with pytest.raises(PayloadUploadError) as exc_info:
        asyncio.run(
            client.upload_image(
                variant=_variant(ImageVariantType.HERO),
                alt_text="Alt text",
                media_set_id="7",
                location_ref=42,
            )
        )

    error = exc_info.value
    assert error.step == "upload_image(hero)"
    assert error.status_code == 500
    assert "upstream outage" in error.detail
