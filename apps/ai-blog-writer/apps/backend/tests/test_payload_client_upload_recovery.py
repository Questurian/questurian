import asyncio

import pytest

from app.features.images.image_processor import ImageVariantType
from app.features.images.payload_client import PayloadClient, PayloadUploadError
from tests.payload_client_test_support import (
    install_stub_async_client,
    processed_variant,
)


def test_upload_image_reuses_existing_asset_after_conflict(monkeypatch):
    client = PayloadClient("jwt")
    find_calls = {"count": 0}

    async def fake_find_media_asset(self, media_set_id: str, variant: str):
        find_calls["count"] += 1
        if find_calls["count"] == 1:
            return None
        return {"id": "89"}

    async def fail_delete_media_asset(self, asset_id: str):
        raise AssertionError(
            "delete_media_asset should not be called during conflict recovery"
        )

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
    install_stub_async_client(
        monkeypatch,
        status_code=500,
        response_text='{"errors":[{"message":"mediaSet already has a open_graph variant"}]}',
    )

    asset_id = asyncio.run(
        client.upload_image(
            variant=processed_variant(ImageVariantType.OPEN_GRAPH),
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

    monkeypatch.setattr(
        PayloadClient,
        "find_media_asset_by_variant",
        fake_find_media_asset,
    )
    install_stub_async_client(
        monkeypatch,
        status_code=500,
        response_text='{"errors":[{"message":"upstream outage"}]}',
    )

    with pytest.raises(PayloadUploadError) as exc_info:
        asyncio.run(
            client.upload_image(
                variant=processed_variant(ImageVariantType.HERO),
                alt_text="Alt text",
                media_set_id="7",
                location_ref=42,
            )
        )

    error = exc_info.value
    assert error.step == "upload_image(hero)"
    assert error.status_code == 500
    assert "upstream outage" in error.detail
