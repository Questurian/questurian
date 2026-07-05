from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.features.staged_drafts.routes as staged_drafts_routes
from app.features.staged_drafts.storage import (
    delete_all_staged_drafts,
    get_staged_draft,
    list_staged_drafts,
    upsert_staged_draft,
)

STORAGE_KEY = "test_staged_drafts_v2"


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(staged_drafts_routes.router)
    return TestClient(app)


def test_storage_upsert_get_list_delete_round_trip():
    delete_all_staged_drafts(STORAGE_KEY)
    try:
        saved = upsert_staged_draft(
            STORAGE_KEY, "staged_1", {"title": "First", "blocks": []}
        )
        assert saved["id"] == "staged_1"
        assert saved["title"] == "First"
        assert saved["createdAt"] and saved["updatedAt"]

        fetched = get_staged_draft(STORAGE_KEY, "staged_1")
        assert fetched is not None
        assert fetched["title"] == "First"

        assert get_staged_draft(STORAGE_KEY, "missing") is None

        upsert_staged_draft(STORAGE_KEY, "staged_2", {"title": "Second"})
        drafts = list_staged_drafts(STORAGE_KEY)
        assert {d["id"] for d in drafts} == {"staged_1", "staged_2"}
    finally:
        delete_all_staged_drafts(STORAGE_KEY)


def test_storage_upsert_same_id_updates_not_duplicates():
    delete_all_staged_drafts(STORAGE_KEY)
    try:
        first = upsert_staged_draft(STORAGE_KEY, "staged_1", {"title": "Original"})
        second = upsert_staged_draft(STORAGE_KEY, "staged_1", {"title": "Edited"})

        drafts = list_staged_drafts(STORAGE_KEY)
        assert len(drafts) == 1
        assert drafts[0]["title"] == "Edited"
        # created_at is preserved across updates; updated_at moves forward.
        assert second["createdAt"] == first["createdAt"]
    finally:
        delete_all_staged_drafts(STORAGE_KEY)


def test_routes_full_lifecycle():
    client = _client()
    delete_all_staged_drafts(STORAGE_KEY)
    try:
        # Empty to start.
        listed = client.get("/staged-drafts", params={"storageKey": STORAGE_KEY})
        assert listed.status_code == 200
        assert listed.json() == {"drafts": []}

        # Upsert via PUT.
        put = client.put(
            "/staged-drafts/staged_abc",
            params={"storageKey": STORAGE_KEY},
            json={"title": "Hello", "blocks": []},
        )
        assert put.status_code == 200
        assert put.json()["id"] == "staged_abc"
        assert put.json()["title"] == "Hello"

        # GET one resolves (the original "Article not found" bug: this must succeed
        # regardless of which client created the draft).
        got = client.get(
            "/staged-drafts/staged_abc", params={"storageKey": STORAGE_KEY}
        )
        assert got.status_code == 200
        assert got.json()["title"] == "Hello"

        # Unknown id → 404.
        missing = client.get(
            "/staged-drafts/nope", params={"storageKey": STORAGE_KEY}
        )
        assert missing.status_code == 404

        # DELETE one.
        deleted = client.delete(
            "/staged-drafts/staged_abc", params={"storageKey": STORAGE_KEY}
        )
        assert deleted.status_code == 204
        assert (
            client.get(
                "/staged-drafts/staged_abc", params={"storageKey": STORAGE_KEY}
            ).status_code
            == 404
        )
    finally:
        delete_all_staged_drafts(STORAGE_KEY)


def test_conditional_put_succeeds_with_matching_expected_updated_at():
    client = _client()
    delete_all_staged_drafts(STORAGE_KEY)
    try:
        created = client.put(
            "/staged-drafts/staged_cas",
            params={"storageKey": STORAGE_KEY},
            json={"title": "v1"},
        ).json()

        updated = client.put(
            "/staged-drafts/staged_cas",
            params={
                "storageKey": STORAGE_KEY,
                "expectedUpdatedAt": created["updatedAt"],
            },
            json={"title": "v2"},
        )
        assert updated.status_code == 200
        assert updated.json()["title"] == "v2"
        assert updated.json()["updatedAt"] != created["updatedAt"]
    finally:
        delete_all_staged_drafts(STORAGE_KEY)


def test_conditional_put_returns_409_with_current_on_stale_timestamp():
    client = _client()
    delete_all_staged_drafts(STORAGE_KEY)
    try:
        created = client.put(
            "/staged-drafts/staged_cas",
            params={"storageKey": STORAGE_KEY},
            json={"title": "v1"},
        ).json()

        # A concurrent (unconditional) write moves updated_at forward.
        client.put(
            "/staged-drafts/staged_cas",
            params={"storageKey": STORAGE_KEY},
            json={"title": "v2", "lastEditedBy": {"id": "2", "email": "other@x.com"}},
        )

        stale = client.put(
            "/staged-drafts/staged_cas",
            params={
                "storageKey": STORAGE_KEY,
                "expectedUpdatedAt": created["updatedAt"],
            },
            json={"title": "v1-edited"},
        )
        assert stale.status_code == 409
        body = stale.json()
        assert body["current"]["title"] == "v2"
        assert body["current"]["lastEditedBy"]["email"] == "other@x.com"

        # The losing write must not have been applied.
        assert (
            client.get(
                "/staged-drafts/staged_cas", params={"storageKey": STORAGE_KEY}
            ).json()["title"]
            == "v2"
        )
    finally:
        delete_all_staged_drafts(STORAGE_KEY)


def test_conditional_put_on_missing_draft_returns_409_with_null_current():
    client = _client()
    delete_all_staged_drafts(STORAGE_KEY)
    try:
        response = client.put(
            "/staged-drafts/staged_gone",
            params={
                "storageKey": STORAGE_KEY,
                "expectedUpdatedAt": "2026-01-01T00:00:00+00:00",
            },
            json={"title": "orphan"},
        )
        assert response.status_code == 409
        assert response.json()["current"] is None
    finally:
        delete_all_staged_drafts(STORAGE_KEY)


def test_put_without_expected_updated_at_still_creates():
    client = _client()
    delete_all_staged_drafts(STORAGE_KEY)
    try:
        created = client.put(
            "/staged-drafts/staged_new",
            params={"storageKey": STORAGE_KEY},
            json={"title": "fresh"},
        )
        assert created.status_code == 200
        assert created.json()["title"] == "fresh"
    finally:
        delete_all_staged_drafts(STORAGE_KEY)


def test_routes_clear_all_and_storage_key_required():
    client = _client()
    delete_all_staged_drafts(STORAGE_KEY)
    try:
        client.put(
            "/staged-drafts/a", params={"storageKey": STORAGE_KEY}, json={"title": "A"}
        )
        client.put(
            "/staged-drafts/b", params={"storageKey": STORAGE_KEY}, json={"title": "B"}
        )
        assert client.delete(
            "/staged-drafts", params={"storageKey": STORAGE_KEY}
        ).status_code == 204
        assert (
            client.get("/staged-drafts", params={"storageKey": STORAGE_KEY}).json()
            == {"drafts": []}
        )

        # Missing/blank storageKey is rejected.
        assert client.get("/staged-drafts", params={"storageKey": ""}).status_code == 400
        assert client.get("/staged-drafts").status_code == 422
    finally:
        delete_all_staged_drafts(STORAGE_KEY)
