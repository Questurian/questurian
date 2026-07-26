import asyncio

from app.features.images.image_processor import ImageVariantType
from app.features.images.payload_client import PayloadClient, PayloadUploadError
from tests.payload_client_test_support import (
    install_stub_async_client,
    processed_variant,
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

    def record_post():
        post_calls["count"] += 1

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
    install_stub_async_client(
        monkeypatch,
        status_code=201,
        response_text='{"doc":{"id":"101"}}',
        on_post=record_post,
    )

    asset_id = asyncio.run(
        client.upload_image(
            variant=processed_variant(ImageVariantType.OPEN_GRAPH),
            alt_text="Alt text",
            photographer_credit="Photo by Test",
            media_set_id="7",
            location_ref=42,
        )
    )

    assert deleted_asset_ids == ["67"]
    assert post_calls["count"] == 1
    assert asset_id == "101"


def test_upload_image_detaches_stale_variant_when_payload_delete_file_missing(
    monkeypatch,
):
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

    def record_post():
        post_calls["count"] += 1

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
    install_stub_async_client(
        monkeypatch,
        status_code=201,
        response_text='{"doc":{"id":"101"}}',
        on_post=record_post,
    )

    asset_id = asyncio.run(
        client.upload_image(
            variant=processed_variant(ImageVariantType.OPEN_GRAPH),
            alt_text="Alt text",
            photographer_credit="Photo by Test",
            media_set_id="7",
            location_ref=42,
        )
    )

    assert detached_assets == [("67", "7", "open_graph")]
    assert post_calls["count"] == 1
    assert asset_id == "101"
