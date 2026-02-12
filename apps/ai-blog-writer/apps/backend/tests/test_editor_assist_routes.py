from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.features.editor_assist.routes as editor_assist_routes


class _StubLLM:
    def __init__(self, response_text: str) -> None:
        self._response_text = response_text
        self.last_prompt: str | None = None

    def invoke(self, prompt: str) -> str:
        self.last_prompt = prompt
        return self._response_text


def _build_client() -> TestClient:
    app = FastAPI()
    app.include_router(editor_assist_routes.router)
    return TestClient(app)


def test_rewrite_block_returns_envelope_content(monkeypatch):
    monkeypatch.setattr(
        editor_assist_routes,
        "get_vertex_llm",
        lambda **_kwargs: _StubLLM(
            "<<<BLOCK>>>\n## Getting Around\n\nUpdated block text.\n<<<END_BLOCK>>>"
        ),
    )

    client = _build_client()
    response = client.post(
        "/editor-assist/rewrite-block",
        json={
            "prompt": "Tighten this section and make it clearer.",
            "block_content": "## Getting Around\n\nOriginal block text.",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["rewritten_content"] == "## Getting Around\n\nUpdated block text."
    assert payload["model_used"] == editor_assist_routes.DEFAULT_MODEL


def test_rewrite_block_strips_markdown_fence_fallback(monkeypatch):
    monkeypatch.setattr(
        editor_assist_routes,
        "get_vertex_llm",
        lambda **_kwargs: _StubLLM("```markdown\n- Bullet one\n- Bullet two\n```"),
    )

    client = _build_client()
    response = client.post(
        "/editor-assist/rewrite-block",
        json={
            "prompt": "Convert this into bullets.",
            "block_content": "Line one. Line two.",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["rewritten_content"] == "- Bullet one\n- Bullet two"


def test_rewrite_block_rejects_empty_output(monkeypatch):
    monkeypatch.setattr(
        editor_assist_routes,
        "get_vertex_llm",
        lambda **_kwargs: _StubLLM("   "),
    )

    client = _build_client()
    response = client.post(
        "/editor-assist/rewrite-block",
        json={
            "prompt": "Improve wording.",
            "block_content": "Original content.",
        },
    )

    assert response.status_code == 502
    assert response.json()["detail"] == "AI rewrite returned empty output"


def test_rewrite_block_sends_title_and_context_to_prompt(monkeypatch):
    stub_llm = _StubLLM("<<<BLOCK>>>\nRefined section.\n<<<END_BLOCK>>>")
    monkeypatch.setattr(
        editor_assist_routes,
        "get_vertex_llm",
        lambda **_kwargs: stub_llm,
    )

    client = _build_client()
    response = client.post(
        "/editor-assist/rewrite-block",
        json={
            "prompt": "Make this section more concise.",
            "block_content": "## Getting Around\n\nOriginal block text.",
            "article_title": "Ica Travel Guide",
            "article_context": "## Intro\nContext block one.\n\n## Tips\nContext block two.",
        },
    )

    assert response.status_code == 200
    assert stub_llm.last_prompt is not None
    assert "Article title (reference only):\nIca Travel Guide" in stub_llm.last_prompt
    assert "<<<ARTICLE_CONTEXT>>>" in stub_llm.last_prompt
    assert "Rewrite only the current markdown block." in stub_llm.last_prompt
