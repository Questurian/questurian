from fastapi.testclient import TestClient

from app.main import app
from app.features.images.payload_client import PayloadClient, PayloadUploadError
from tests.images_route_test_support import _auth_headers


def _composite_request_body() -> dict:
    return {
        "layout": "four-up",
        "sources": [
            {"mediaSetId": 1},
            {"mediaSetId": 2},
            {"mediaSetId": 3},
            {"mediaSetId": 4},
        ],
        "title": "Composite image",
        "altText": "A composite of four scenes",
        "photographerCredit": "Questurian Composite",
        "locationRef": 42,
    }


async def _fake_prepare_ok(request, authorization):
    """Bypass source download/render machinery for composite route tests."""
    return "jwt-token", 42, "Questurian Composite", [], []


def test_create_composite_rolls_back_on_partial_failure(monkeypatch):
    client = TestClient(app)

    deleted_assets: list[str] = []
    deleted_sets: list[str] = []
    upload_calls = {"count": 0}

    async def fake_create_media_set(self, **kwargs):
        return "ms_777"

    async def fake_upload_image(self, variant, **kwargs):
        upload_calls["count"] += 1
        if upload_calls["count"] <= 2:
            return f"asset_{upload_calls['count']}"
        raise PayloadUploadError(
            step=f"upload_image({variant.variant_type.value})",
            message="Payload rejected the upload",
            status_code=400,
            detail="Validation: something is wrong",
        )

    async def fake_delete_media_asset(self, asset_id: str):
        deleted_assets.append(asset_id)

    async def fake_delete_media_set(self, media_set_id: str):
        deleted_sets.append(media_set_id)

    monkeypatch.setattr(
        "app.features.images.composites.routes._prepare", _fake_prepare_ok
    )
    monkeypatch.setattr(PayloadClient, "create_media_set", fake_create_media_set)
    monkeypatch.setattr(PayloadClient, "upload_image", fake_upload_image)
    monkeypatch.setattr(PayloadClient, "delete_media_asset", fake_delete_media_asset)
    monkeypatch.setattr(PayloadClient, "delete_media_set", fake_delete_media_set)

    response = client.post(
        "/images/composites/create",
        json=_composite_request_body(),
        headers=_auth_headers(),
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["message"] == "Failed to create composite MediaSet"
    # The two variants uploaded before the failure are cleaned up...
    assert deleted_assets == ["asset_1", "asset_2"]
    # ...and the orphaned MediaSet is deleted so nothing hangs.
    assert deleted_sets == ["ms_777"]


def test_create_composite_retries_transient_upload_error(monkeypatch):
    client = TestClient(app)

    deleted_assets: list[str] = []
    deleted_sets: list[str] = []
    calls = {"count": 0}

    async def fake_create_media_set(self, **kwargs):
        return "ms_888"

    async def fake_upload_image(self, variant, **kwargs):
        calls["count"] += 1
        # Fail the very first attempt with a transient gateway error, then succeed.
        if calls["count"] == 1:
            raise PayloadUploadError(
                step=f"upload_image({variant.variant_type.value})",
                message="Payload rejected the upload",
                status_code=503,
                detail="Bunny CDN temporarily unavailable",
            )
        return f"asset_{calls['count']}"

    async def fake_delete_media_asset(self, asset_id: str):
        deleted_assets.append(asset_id)

    async def fake_delete_media_set(self, media_set_id: str):
        deleted_sets.append(media_set_id)

    async def fake_sleep(_seconds):
        return None

    monkeypatch.setattr(
        "app.features.images.composites.routes._prepare", _fake_prepare_ok
    )
    monkeypatch.setattr(
        "app.features.images.composites.routes.asyncio.sleep", fake_sleep
    )
    monkeypatch.setattr(PayloadClient, "create_media_set", fake_create_media_set)
    monkeypatch.setattr(PayloadClient, "upload_image", fake_upload_image)
    monkeypatch.setattr(PayloadClient, "delete_media_asset", fake_delete_media_asset)
    monkeypatch.setattr(PayloadClient, "delete_media_set", fake_delete_media_set)

    response = client.post(
        "/images/composites/create",
        json=_composite_request_body(),
        headers=_auth_headers(),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["mediaSetId"] == "ms_888"
    # All seven variants ended up present despite the transient blip.
    assert len(payload["variantAssetIds"]) == 7
    # No rollback should have run on the successful path.
    assert deleted_assets == []
    assert deleted_sets == []
