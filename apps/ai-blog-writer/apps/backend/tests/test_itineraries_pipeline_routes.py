from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.features.itineraries_pipeline.routes as itineraries_pipeline_routes
from app.shared.writer_invocation import WriterResult


def _build_client() -> TestClient:
    app = FastAPI()
    app.include_router(itineraries_pipeline_routes.router)
    return TestClient(app)


def test_generate_titles_returns_model_output(monkeypatch):
    captured = {}

    def fake_writer(job_id, **kwargs):
        captured["job_id"] = job_id
        captured["model"] = kwargs.get("model")
        return WriterResult(
            text="1. First title\n2. Second title\n",
            model_name="gemini-2.5-flash",
        )

    monkeypatch.setattr(itineraries_pipeline_routes, "writer_text", fake_writer)

    client = _build_client()
    response = client.post(
        "/itineraries-pipeline/generate-titles",
        json={"prompt": "x" * 25},
    )

    # The route names a job and pins no model: which model titles run on is
    # the gateway's answer, changeable from the dashboard.
    assert captured["job_id"] == "itinerary.title"
    assert captured["model"] is None

    assert response.status_code == 200
    payload = response.json()
    assert payload["text"] == "1. First title\n2. Second title"
    # Whatever answered, reported back. Not a constant this module owns.
    assert payload["model_used"] == "gemini-2.5-flash"


def test_generate_titles_rejects_short_prompt():
    client = _build_client()
    response = client.post(
        "/itineraries-pipeline/generate-titles",
        json={"prompt": "short"},
    )
    assert response.status_code == 422


def _generate_body(**overrides) -> dict:
    body = {
        "location": "peru|lima|miraflores",
        "title": "Three days in Miraflores",
        "brief": "A walkable long weekend for a first-time visitor.",
        "day_count": 1,
        "shared_neighborhoods": [],
        "day_shells": [
            {
                "day_index": 0,
                "shell_id": "classic",
                "shell_name": "Classic",
                "shell_description": "A standard day",
                "slots": [
                    {
                        "id": "s1",
                        "label": "Morning",
                        "daypart": "morning",
                        "acceptable_collections": ["attractions"],
                    }
                ],
            }
        ],
    }
    body.update(overrides)
    return body


def _capture_pipeline(monkeypatch) -> dict:
    """Record the request the pipeline receives, without running it."""
    seen: dict = {}

    async def fake_pipeline(request):
        seen["payload_jwt"] = request.payload_jwt
        return itineraries_pipeline_routes.GenerateItineraryResponse(
            days=[], model_used="stub"
        )

    monkeypatch.setattr(
        itineraries_pipeline_routes, "run_itinerary_pipeline", fake_pipeline
    )
    return seen


def test_generate_takes_the_jwt_from_the_session_cookie(monkeypatch):
    """The frontend has no token to put in the body any more.

    `payload_jwt` used to be a required field; the cookie carries the same JWT,
    so the Payload reads are unaffected.
    """
    monkeypatch.delenv("ABW_API_KEY", raising=False)
    monkeypatch.setenv("ABW_ALLOWED_ORIGINS", "https://abw.questurian.com")
    seen = _capture_pipeline(monkeypatch)

    client = _build_client()
    client.cookies.set("payload-token", "cookie-jwt")
    response = client.post(
        "/itineraries-pipeline/generate",
        json=_generate_body(),
        headers={"Origin": "https://abw.questurian.com"},
    )

    assert response.status_code == 200
    assert seen["payload_jwt"] == "cookie-jwt"


def test_generate_prefers_an_explicit_body_jwt(monkeypatch):
    """Non-browser callers and older frontend builds keep working."""
    monkeypatch.delenv("ABW_API_KEY", raising=False)
    monkeypatch.setenv("ABW_ALLOWED_ORIGINS", "https://abw.questurian.com")
    seen = _capture_pipeline(monkeypatch)

    client = _build_client()
    client.cookies.set("payload-token", "cookie-jwt")
    response = client.post(
        "/itineraries-pipeline/generate",
        json=_generate_body(payload_jwt="body-jwt"),
        headers={"Origin": "https://abw.questurian.com"},
    )

    assert response.status_code == 200
    assert seen["payload_jwt"] == "body-jwt"


def test_generate_401s_with_no_credential_at_all(monkeypatch):
    """Neither a cookie nor a body field means there is nothing to read Payload
    with — a 401, not a 500 deep inside the retrieval stage."""
    monkeypatch.delenv("ABW_API_KEY", raising=False)
    _capture_pipeline(monkeypatch)

    client = _build_client()
    response = client.post("/itineraries-pipeline/generate", json=_generate_body())

    assert response.status_code == 401
    assert "session" in response.json()["detail"]
