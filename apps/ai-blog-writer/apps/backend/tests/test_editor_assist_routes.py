from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.features.editor_assist.routes as editor_assist_routes
from utils.google_grounding import GroundedGenerationResult


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


def _paragraph(word_count: int, *, token: str = "editorial") -> str:
    return " ".join([token] * word_count)


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
    assert response.json()["detail"] == "AI rewrite graph failed"


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


def test_generate_title_uses_langgraph_runner(monkeypatch):
    called = {"graph": False}

    def _fake_graph_runner(*, step_runner):
        del step_runner
        called["graph"] = True
        return editor_assist_routes.GenerateTitleResponse(title="Graph Generated Title")

    monkeypatch.setattr(
        editor_assist_routes,
        "run_editor_assist_generate_title_graph",
        _fake_graph_runner,
    )

    client = _build_client()
    response = client.post(
        "/editor-assist/generate-title",
        json={
            "current_title": "Old Title",
            "prompt": "Make it clearer.",
        },
    )

    assert response.status_code == 200
    assert response.json()["title"] == "Graph Generated Title"
    assert called["graph"] is True


def test_rewrite_block_uses_langgraph_runner(monkeypatch):
    called = {"graph": False}

    def _fake_graph_runner(*, step_runner):
        del step_runner
        called["graph"] = True
        return editor_assist_routes.RewriteBlockResponse(
            rewritten_content="Graph rewritten block",
            model_used="gemini-2.5-flash",
        )

    monkeypatch.setattr(
        editor_assist_routes,
        "run_editor_assist_rewrite_graph",
        _fake_graph_runner,
    )

    client = _build_client()
    response = client.post(
        "/editor-assist/rewrite-block",
        json={
            "prompt": "Tighten this block.",
            "block_content": "Original block.",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["rewritten_content"] == "Graph rewritten block"
    assert called["graph"] is True


def test_generate_listicle_content_returns_grounded_results(monkeypatch):
    def _fake_grounded(*_args, **_kwargs):
        return GroundedGenerationResult(
            text=_paragraph(100, token="refined"),
            source_urls=["https://example.com/one"],
            model_name="gemini-2.5-flash",
        )

    monkeypatch.setattr(editor_assist_routes, "invoke_google_grounded_text", _fake_grounded)

    client = _build_client()
    response = client.post(
        "/editor-assist/generate-listicle-content",
        json={
            "article_title": "Best Restaurants in Lima",
            "article_type": "single-type-listicle",
            "location_label": "Lima, Peru",
            "targets": [
                {
                    "target_id": "draft-1_header_intro",
                    "field_type": "intro",
                },
                {
                    "target_id": "item-1_blurb",
                    "field_type": "blurb",
                    "category": "dining",
                    "display_name": "La Mar",
                    "research_subject": "La Mar",
                    "location_label": "Miraflores, Lima",
                },
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()["results"]
    assert payload["draft-1_header_intro"]["status"] == "generated"
    assert payload["item-1_blurb"]["status"] == "generated"
    assert payload["item-1_blurb"]["markdown"] == _paragraph(100, token="refined")
    assert payload["item-1_blurb"]["source_urls"] == ["https://example.com/one"]


def test_generate_listicle_content_skips_existing_targets(monkeypatch):
    calls = {"count": 0}

    def _fake_grounded(*_args, **_kwargs):
        calls["count"] += 1
        return GroundedGenerationResult(
            text=_paragraph(100),
            source_urls=[],
            model_name="gemini-2.5-flash",
        )

    monkeypatch.setattr(editor_assist_routes, "invoke_google_grounded_text", _fake_grounded)

    client = _build_client()
    response = client.post(
        "/editor-assist/generate-listicle-content",
        json={
            "article_title": "Best Restaurants in Lima",
            "article_type": "single-type-listicle",
            "location_label": "Lima, Peru",
            "skip_existing": True,
            "targets": [
                {
                    "target_id": "item-1_blurb",
                    "field_type": "blurb",
                    "category": "dining",
                    "current_content": "Keep this copy",
                },
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()["results"]["item-1_blurb"]
    assert payload["status"] == "skipped"
    assert payload["markdown"] == "Keep this copy"
    assert calls["count"] == 0


def test_generate_listicle_content_returns_503_when_grounding_is_unavailable(monkeypatch):
    monkeypatch.setattr(editor_assist_routes, "invoke_google_grounded_text", lambda *_args, **_kwargs: None)

    client = _build_client()
    response = client.post(
        "/editor-assist/generate-listicle-content",
        json={
            "article_title": "Best Restaurants in Lima",
            "article_type": "single-type-listicle",
            "location_label": "Lima, Peru",
            "targets": [
                {
                    "target_id": "item-1_blurb",
                    "field_type": "blurb",
                    "category": "dining",
                },
            ],
        },
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "Grounded research is unavailable for listicle generation"


def test_generate_listicle_content_uses_custom_instruction_and_retries_validation(monkeypatch):
    calls: list[str] = []

    def _fake_grounded(prompt: str, **_kwargs):
        calls.append(prompt)
        if len(calls) == 1:
            return GroundedGenerationResult(
                text="too short",
                source_urls=["https://example.com/one"],
                model_name="gemini-2.5-flash",
            )
        return GroundedGenerationResult(
            text=_paragraph(100, token="improved"),
            source_urls=["https://example.com/two"],
            model_name="gemini-2.5-flash",
        )

    monkeypatch.setattr(editor_assist_routes, "invoke_google_grounded_text", _fake_grounded)

    client = _build_client()
    response = client.post(
        "/editor-assist/generate-listicle-content",
        json={
            "article_title": "Best Restaurants in Lima",
            "article_type": "single-type-listicle",
            "location_label": "Lima, Peru",
            "custom_instruction": "Lean harder into seafood specialties.",
            "targets": [
                {
                    "target_id": "item-1_blurb",
                    "field_type": "blurb",
                    "category": "dining",
                    "display_name": "La Mar",
                    "research_subject": "La Mar",
                },
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()["results"]["item-1_blurb"]
    assert payload["status"] == "generated"
    assert payload["markdown"] == _paragraph(100, token="improved")
    assert payload["source_urls"] == ["https://example.com/one", "https://example.com/two"]
    assert any("CUSTOM INSTRUCTION\nLean harder into seafood specialties." in prompt for prompt in calls)
    assert any("VALIDATION FAILURES" in prompt for prompt in calls[1:])


def test_generate_listicle_content_uses_langgraph_runner(monkeypatch):
    called = {"graph": False}

    def _fake_graph_runner(*, step_runner):
        del step_runner
        called["graph"] = True
        return editor_assist_routes.GenerateListicleContentResponse(
            results={
                "item-1_blurb": editor_assist_routes.GenerateListicleTargetResponse(
                    target_id="item-1_blurb",
                    status="generated",
                    markdown="Generated blurb",
                    model_used="gemini-2.5-flash",
                )
            }
        )

    monkeypatch.setattr(
        editor_assist_routes,
        "run_editor_assist_listicle_generation_graph",
        _fake_graph_runner,
    )

    client = _build_client()
    response = client.post(
        "/editor-assist/generate-listicle-content",
        json={
            "article_title": "Best Restaurants in Lima",
            "article_type": "single-type-listicle",
            "location_label": "Lima, Peru",
            "targets": [
                {
                    "target_id": "item-1_blurb",
                    "field_type": "blurb",
                    "category": "dining",
                },
            ],
        },
    )

    assert response.status_code == 200
    assert response.json()["results"]["item-1_blurb"]["markdown"] == "Generated blurb"
    assert called["graph"] is True
