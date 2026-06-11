"""Day Shell Library CRUD routes (ADR 0017): backend-persisted Custom Day
Shells with immutable built-ins."""

import sys
import types

from fastapi import FastAPI
from fastapi.testclient import TestClient

utils_stub = types.ModuleType("utils")
utils_stub.get_vertex_llm = lambda *args, **kwargs: None
utils_stub.parse_json_response = lambda *args, **kwargs: {}
sys.modules.setdefault("utils", utils_stub)

import app.core.database as database  # noqa: E402
import app.features.itineraries_pipeline.routes as routes  # noqa: E402


def _build_client(tmp_path, monkeypatch) -> TestClient:
    monkeypatch.setattr(database, "DATA_DIR", tmp_path)
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "test.db")
    app = FastAPI()
    app.include_router(routes.router)
    return TestClient(app)


def _shell_payload(shell_id: str = "custom_day_shell_test", name: str = "Coffee culture night") -> dict:
    return {
        "id": shell_id,
        "name": name,
        "description": "Operator-built layout",
        "slots": [
            {
                "id": "morning_coffee_1",
                "label": "Morning coffee",
                "daypart": "morning",
                "acceptable_collections": ["dining"],
                "preferred_collections": ["dining"],
                "intent_tags": ["coffee", "cafe"],
                "avoid_tags": [],
            },
            {
                "id": "dinner_2",
                "label": "Dinner",
                "daypart": "dinner",
                "acceptable_collections": ["dining"],
                "preferred_collections": ["dining"],
                "intent_tags": ["dinner"],
                "avoid_tags": [],
            },
        ],
    }


def test_shell_library_crud_round_trip(tmp_path, monkeypatch):
    client = _build_client(tmp_path, monkeypatch)

    assert client.get("/itineraries-pipeline/day-shells").json() == {"shells": []}

    created = client.post("/itineraries-pipeline/day-shells", json=_shell_payload())
    assert created.status_code == 200
    assert created.json()["name"] == "Coffee culture night"

    listed = client.get("/itineraries-pipeline/day-shells").json()["shells"]
    assert [shell["id"] for shell in listed] == ["custom_day_shell_test"]
    assert [slot["id"] for slot in listed[0]["slots"]] == ["morning_coffee_1", "dinner_2"]

    updated_payload = _shell_payload(name="Coffee culture night v2")
    updated = client.put(
        "/itineraries-pipeline/day-shells/custom_day_shell_test", json=updated_payload
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Coffee culture night v2"

    deleted = client.delete("/itineraries-pipeline/day-shells/custom_day_shell_test")
    assert deleted.status_code == 200
    assert client.get("/itineraries-pipeline/day-shells").json() == {"shells": []}


def test_shell_library_duplicate_create_conflicts(tmp_path, monkeypatch):
    client = _build_client(tmp_path, monkeypatch)
    assert client.post("/itineraries-pipeline/day-shells", json=_shell_payload()).status_code == 200
    assert client.post("/itineraries-pipeline/day-shells", json=_shell_payload()).status_code == 409


def test_built_in_shells_are_immutable(tmp_path, monkeypatch):
    client = _build_client(tmp_path, monkeypatch)

    collide = client.post(
        "/itineraries-pipeline/day-shells", json=_shell_payload(shell_id="full_day_balanced")
    )
    assert collide.status_code == 409

    update = client.put(
        "/itineraries-pipeline/day-shells/full_day_balanced",
        json=_shell_payload(shell_id="full_day_balanced"),
    )
    assert update.status_code == 409

    delete = client.delete("/itineraries-pipeline/day-shells/full_day_balanced")
    assert delete.status_code == 409


def test_update_missing_shell_is_404(tmp_path, monkeypatch):
    client = _build_client(tmp_path, monkeypatch)
    response = client.put(
        "/itineraries-pipeline/day-shells/custom_day_shell_missing",
        json=_shell_payload(shell_id="custom_day_shell_missing"),
    )
    assert response.status_code == 404
