import utils.google_grounding as google_grounding


class _FakeResponse:
    def __init__(self, *, ok: bool, payload: dict | None = None, status_code: int = 200, text: str = "") -> None:
        self.ok = ok
        self._payload = payload or {}
        self.status_code = status_code
        self.text = text

    def json(self) -> dict:
        return self._payload


class _FakeSession:
    def __init__(self, responses: list[_FakeResponse]) -> None:
        self._responses = list(responses)
        self.calls: list[dict] = []

    def post(self, url: str, *, json: dict, timeout: int) -> _FakeResponse:
        self.calls.append(
            {
                "url": url,
                "json": json,
                "timeout": timeout,
            }
        )
        return self._responses.pop(0)


class _FakeGoogleAuth:
    @staticmethod
    def default(*, scopes: list[str]):
        return object(), "demo-project"


def _reset_grounding_cache(monkeypatch) -> None:
    monkeypatch.setattr(google_grounding, "_grounding_session", None)
    monkeypatch.setattr(google_grounding, "_grounding_project", None)
    monkeypatch.setattr(google_grounding, "_grounding_location", None)


def test_invoke_google_grounded_text_uses_google_search_rest(monkeypatch):
    fake_session = _FakeSession(
        [
            _FakeResponse(
                ok=True,
                payload={
                    "candidates": [
                        {
                            "content": {
                                "parts": [{"text": "hello from grounding"}],
                            },
                            "groundingMetadata": {
                                "groundingChunks": [
                                    {"web": {"uri": "https://example.com/one"}},
                                ]
                            },
                        }
                    ],
                    "modelVersion": "gemini-2.5-flash",
                },
            )
        ]
    )

    _reset_grounding_cache(monkeypatch)
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "demo-project")
    monkeypatch.setenv("GOOGLE_CLOUD_LOCATION", "us-central1")
    monkeypatch.setattr(google_grounding, "google_auth", _FakeGoogleAuth)
    monkeypatch.setattr(google_grounding, "AuthorizedSession", lambda _credentials: fake_session)

    result = google_grounding.invoke_google_grounded_text(
        "Return hello.",
        model_name="gemini-2.5-flash",
        max_tokens=321,
        temperature=0.25,
    )

    assert result is not None
    assert result.text == "hello from grounding"
    assert result.source_urls == ["https://example.com/one"]
    assert result.model_name == "gemini-2.5-flash"
    assert fake_session.calls[0]["url"].endswith(
        "/publishers/google/models/gemini-2.5-flash:generateContent"
    )
    assert fake_session.calls[0]["json"]["tools"] == [{"googleSearch": {}}]
    assert fake_session.calls[0]["json"]["generationConfig"] == {
        "temperature": 0.25,
        "maxOutputTokens": 321,
    }


def test_invoke_google_grounded_text_uses_fallback_model_after_non_ok_response(monkeypatch):
    fake_session = _FakeSession(
        [
            _FakeResponse(ok=False, status_code=400, text="unsupported model"),
            _FakeResponse(
                ok=True,
                payload={
                    "candidates": [
                        {
                            "content": {
                                "parts": [{"text": "fallback response"}],
                            }
                        }
                    ],
                    "modelVersion": "gemini-2.5-flash-lite",
                },
            ),
        ]
    )

    _reset_grounding_cache(monkeypatch)
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "demo-project")
    monkeypatch.setenv("GOOGLE_CLOUD_LOCATION", "us-central1")
    monkeypatch.setattr(google_grounding, "google_auth", _FakeGoogleAuth)
    monkeypatch.setattr(google_grounding, "AuthorizedSession", lambda _credentials: fake_session)

    result = google_grounding.invoke_google_grounded_text(
        "Return hello.",
        model_name="gemini-2.5-pro",
        fallback_model_name="gemini-2.5-flash-lite",
    )

    assert result is not None
    assert result.text == "fallback response"
    assert result.model_name == "gemini-2.5-flash-lite"
    assert len(fake_session.calls) == 2
    assert fake_session.calls[0]["url"].endswith(
        "/publishers/google/models/gemini-2.5-pro:generateContent"
    )
    assert fake_session.calls[1]["url"].endswith(
        "/publishers/google/models/gemini-2.5-flash-lite:generateContent"
    )
