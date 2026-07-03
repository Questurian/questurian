import json

from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.features.editor_assist.routes as editor_assist_routes
import app.features.editor_assist.research_profile as research_profile_mod
import app.features.editor_assist.writer_brief as writer_brief_mod


def _fake_curator(*, prompt, model_name, max_tokens, temperature):
    return (
        json.dumps(
            {
                "angle_directive": "Open by naming one specific dish at La Mar.",
                "source_facts": [
                    {
                        "fact": "Cevicheria with Peruvian seafood.",
                        "citations": ["https://example.com/a"],
                    },
                    {
                        "fact": "Tasting menu on weekends.",
                        "citations": ["https://example.com/b"],
                    },
                ],
            }
        ),
        model_name,
    )


class _StubLLM:
    def __init__(self, response_text: str) -> None:
        self._response_text = response_text
        self.last_prompt: str | None = None

    def invoke(self, prompt: str) -> str:
        self.last_prompt = prompt
        return self._response_text


class _FakeGroundedResult:
    def __init__(self, text: str, source_urls: list[str] | None = None) -> None:
        self.text = text
        self.source_urls = source_urls or []
        self.model_name = "gemini-2.5-flash"


def _build_client() -> TestClient:
    app = FastAPI()
    app.include_router(editor_assist_routes.router)
    return TestClient(app)


def _paragraph(word_count: int, *, token: str = "editorial") -> str:
    return " ".join([token] * word_count)


def _research_profile_payload(
    *,
    angle: str | None = None,
    selected_status: str = "supported",
    bucket_findings: int = 2,
) -> str:
    selected_angle = {
        "angle": angle,
        "status": selected_status if angle else "not-requested",
        "summary": (
            f"Verified fact about {angle}."
            if angle and selected_status == "supported"
            else ""
        ),
        "citations": (
            [f"https://example.com/{angle}"]
            if angle and selected_status == "supported"
            else []
        ),
        "reason": f"{angle} support status is {selected_status}." if angle else "",
    }
    findings = [
        {
            "summary": f"Useful standard finding {idx}.",
            "citations": [f"https://example.com/bucket-{idx}"],
        }
        for idx in range(bucket_findings)
    ]
    return json.dumps(
        {
            "selected_angle": selected_angle,
            "standard_buckets": {
                "reputation-summary": findings,
                "specific-offerings": [],
                "experience-texture": [],
                "history-or-ownership": [],
                "practical-usefulness": [],
                "best-for": [],
                "standout-hook": [],
                "social-proof": [],
                "visual-assets": [],
                "caveats-or-fit-warnings": [],
                "timing-tips": [],
                "neighborhood-context": [],
                "crowd-and-vibe": [],
            },
            "warnings": [],
        }
    )


# ---------- Unrelated routes still work (regression coverage) ----------


def test_rewrite_block_returns_envelope_content(monkeypatch):
    class _WriterResult:
        text = "<<<BLOCK>>>\n## Getting Around\n\nUpdated block text.\n<<<END_BLOCK>>>"
        model_name = editor_assist_routes.DEFAULT_MODEL

    monkeypatch.setattr(
        editor_assist_routes,
        "invoke_writer_model",
        lambda **_kwargs: _WriterResult(),
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


# ---------- Structured SEO metadata generation ----------


def test_generate_seo_metadata_returns_structured_patch(monkeypatch):
    captured: dict = {}

    class _StructuredResult:
        payload = {
            "seoTitle": "Two Days in Lima: Food, Art & Coastline",
            "metaDescription": "A compact two-day Lima plan.",
        }
        model_name = editor_assist_routes.SEO_STRUCTURED_DEFAULT_MODEL

    def _fake_structured(**kwargs):
        captured.update(kwargs)
        return _StructuredResult()

    monkeypatch.setattr(
        editor_assist_routes, "invoke_anthropic_structured", _fake_structured
    )

    client = _build_client()
    response = client.post(
        "/editor-assist/generate-seo-metadata",
        json={
            "prompt": "Generate the SEO title and meta description.",
            "seed": json.dumps({"seoTitle": "", "metaDescription": ""}),
            "article_title": "Two Days in Lima",
            "article_context": "Day 1: Barranco murals. Day 2: ceviche crawl.",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["seo_patch"]["seoTitle"].startswith("Two Days in Lima")
    assert payload["model_used"] == editor_assist_routes.SEO_STRUCTURED_DEFAULT_MODEL
    # Endpoint defaults to the Anthropic model since forced-tool calls are
    # Anthropic-only.
    assert captured["model_name"] == editor_assist_routes.SEO_STRUCTURED_DEFAULT_MODEL
    assert captured["tool_name"] == editor_assist_routes.SEO_PATCH_TOOL_NAME
    assert "<<<CURRENT_SEO>>>" in captured["prompt"]
    assert "<<<ARTICLE_CONTEXT>>>" in captured["prompt"]


def test_generate_seo_metadata_empty_patch_is_502(monkeypatch):
    class _EmptyResult:
        payload: dict = {}
        model_name = editor_assist_routes.SEO_STRUCTURED_DEFAULT_MODEL

    monkeypatch.setattr(
        editor_assist_routes,
        "invoke_anthropic_structured",
        lambda **_kwargs: _EmptyResult(),
    )

    client = _build_client()
    response = client.post(
        "/editor-assist/generate-seo-metadata",
        json={
            "prompt": "Generate the SEO title.",
            "seed": json.dumps({"seoTitle": ""}),
        },
    )

    assert response.status_code == 502


# ---------- Listicle pipeline: Critical Fields gate ----------


def test_blurb_target_missing_payload_doc_id_fails_critical_fields(monkeypatch):
    """A blurb target without Payload doc identity hard-blocks before research."""

    def _should_not_be_called(*a, **kw):
        raise AssertionError("evidence research must not run for CF-failed target")

    monkeypatch.setattr(research_profile_mod, "_invoke_grounded", _should_not_be_called)

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
                    "display_name": "La Mar",
                    "location_label": "Miraflores, Lima",
                    # no payload_doc_id
                },
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()["results"]["item-1_blurb"]
    assert payload["status"] == "error"
    assert "payload_doc_id" in payload["error_message"]


# ---------- Listicle pipeline: Research Profile + writer ----------


def test_blurb_with_supported_angle_generates_normally(monkeypatch):
    monkeypatch.setattr(
        research_profile_mod,
        "_invoke_grounded",
        lambda *a, **kw: _FakeGroundedResult(
            _research_profile_payload(angle="signature-dish")
        ),
    )
    monkeypatch.setattr(writer_brief_mod, "_invoke_curator_model", _fake_curator)

    captured = {"prompt": ""}

    class _WriterResult:
        def __init__(self, text: str) -> None:
            self.text = text
            self.model_name = "gemini-2.5-pro"

    def _fake_writer(*, prompt, model_name, max_tokens, temperature):
        captured["prompt"] = prompt
        return _WriterResult(_paragraph(100))

    monkeypatch.setattr(editor_assist_routes, "invoke_writer_model", _fake_writer)

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
                    "display_name": "La Mar",
                    "research_subject": "La Mar",
                    "location_label": "Miraflores, Lima",
                    "payload_doc_id": "doc-1",
                    "angle": "signature-dish",
                },
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()["results"]["item-1_blurb"]
    assert payload["status"] == "generated"
    assert payload["low_confidence"] is False
    assert payload["source_urls"] == [
        "https://example.com/signature-dish",
        "https://example.com/bucket-0",
        "https://example.com/bucket-1",
    ]

    # Dining is on the lean writer path per ADR 0009: the writer prompt is
    # built from the Writer Brief, not the bucket-labeled Research Profile.
    assert "RESEARCH PROFILE" not in captured["prompt"]
    assert "BUILDER CONTEXT" not in captured["prompt"]
    assert "Angle: Open by naming one specific dish at La Mar." in captured["prompt"]
    assert "Source facts (use only what you need):" in captured["prompt"]
    assert "food and travel editor" in captured["prompt"]

    # No Evidence Scan stage (ADR 0010); writer_brief sits between
    # research_profile_completed and writer_called.
    step_names = [s["name"] for s in payload["steps"]]
    assert step_names == [
        "critical_fields_evaluated",
        "research_profile_completed",
        "writer_brief_completed",
        "writer_called",
        "validated",
        "finalized",
    ]


def test_manual_angle_uses_research_profile(monkeypatch):
    monkeypatch.setattr(
        research_profile_mod,
        "_invoke_grounded",
        lambda *a, **kw: _FakeGroundedResult(
            _research_profile_payload(angle="atmosphere")
        ),
    )
    monkeypatch.setattr(writer_brief_mod, "_invoke_curator_model", _fake_curator)

    captured = {"prompt": ""}

    class _WriterResult:
        def __init__(self, text: str) -> None:
            self.text = text
            self.model_name = "gemini-2.5-pro"

    def _fake_writer(*, prompt, model_name, max_tokens, temperature):
        captured["prompt"] = prompt
        return _WriterResult(_paragraph(100))

    monkeypatch.setattr(editor_assist_routes, "invoke_writer_model", _fake_writer)

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
                    "display_name": "La Mar",
                    "location_label": "Miraflores, Lima",
                    "payload_doc_id": "doc-1",
                    "angle": "atmosphere",
                },
            ],
        },
    )

    payload = response.json()["results"]["item-1_blurb"]
    assert response.status_code == 200
    assert payload["status"] == "generated"
    assert payload["requested_angle"] == "atmosphere"
    assert payload["effective_angle"] == "atmosphere"
    assert [s["name"] for s in payload["steps"]] == [
        "critical_fields_evaluated",
        "research_profile_completed",
        "writer_brief_completed",
        "writer_called",
        "validated",
        "finalized",
    ]
    # Dining lean prompt: angle directive comes from the curator, not the
    # legacy BLURB ANGLE block.
    assert "BLURB ANGLE" not in captured["prompt"]
    assert "Angle:" in captured["prompt"]


def test_blurb_with_no_evidence_takes_identity_only_path(monkeypatch):
    """Demote-and-warn: operator angle unsupported + no bucket findings takes identity-only prompt."""
    monkeypatch.setattr(
        research_profile_mod,
        "_invoke_grounded",
        lambda *a, **kw: _FakeGroundedResult(
            _research_profile_payload(
                angle="signature-dish",
                selected_status="unsupported",
                bucket_findings=0,
            )
        ),
    )

    captured = {"prompt": ""}

    class _WriterResult:
        def __init__(self, text: str) -> None:
            self.text = text
            self.model_name = "gemini-2.5-pro"

    def _fake_writer(*, prompt, model_name, max_tokens, temperature):
        captured["prompt"] = prompt
        return _WriterResult(_paragraph(95))

    monkeypatch.setattr(editor_assist_routes, "invoke_writer_model", _fake_writer)

    client = _build_client()
    response = client.post(
        "/editor-assist/generate-listicle-content",
        json={
            "article_title": "Best Bars in Lima",
            "article_type": "single-type-listicle",
            "location_label": "Lima, Peru",
            "targets": [
                {
                    "target_id": "item-1_blurb",
                    "field_type": "blurb",
                    "category": "dining",
                    "display_name": "Brand New Place",
                    "location_label": "Barranco, Lima",
                    "payload_doc_id": "doc-1",
                    "angle": "signature-dish",
                },
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()["results"]["item-1_blurb"]
    assert payload["status"] == "generated"
    assert payload["low_confidence"] is True
    # Identity-only prompt is used.
    assert "EVIDENCE STATUS" in captured["prompt"]
    assert "No public evidence was found" in captured["prompt"]
    # No findings to splice in.
    assert "EVIDENCE PROFILE FINDINGS" not in captured["prompt"]
    # Research Profile step marked failed but writer still runs.
    step_names = [s["name"] for s in payload["steps"]]
    assert "research_profile_completed" in step_names
    rp_step = next(
        s for s in payload["steps"] if s["name"] == "research_profile_completed"
    )
    assert rp_step["status"] == "failed"


# ---------- Accommodations lean pipeline (ADR 0011) ----------


def _fake_accommodations_curator(*, prompt, model_name, max_tokens, temperature):
    return (
        json.dumps(
            {
                "angle_directive": (
                    "Open by placing Hotel B on the ridge above the old quarter, "
                    "naming what sits on either side."
                ),
                "source_facts": [
                    {
                        "fact": "Set on a ridge above the medina.",
                        "citations": ["https://example.com/a"],
                    },
                    {
                        "fact": "Walking distance to the souk.",
                        "citations": ["https://example.com/b"],
                    },
                ],
            }
        ),
        model_name,
    )


def test_accommodations_blurb_runs_lean_path(monkeypatch):
    monkeypatch.setattr(
        research_profile_mod,
        "_invoke_grounded",
        lambda *a, **kw: _FakeGroundedResult(
            _research_profile_payload(angle="location-and-setting")
        ),
    )
    monkeypatch.setattr(
        writer_brief_mod, "_invoke_curator_model", _fake_accommodations_curator
    )

    captured = {"prompt": ""}

    class _WriterResult:
        def __init__(self, text: str) -> None:
            self.text = text
            self.model_name = "gemini-2.5-pro"

    def _fake_writer(*, prompt, model_name, max_tokens, temperature):
        captured["prompt"] = prompt
        return _WriterResult(_paragraph(100))

    monkeypatch.setattr(editor_assist_routes, "invoke_writer_model", _fake_writer)

    client = _build_client()
    response = client.post(
        "/editor-assist/generate-listicle-content",
        json={
            "article_title": "Best Hotels in Marrakech",
            "article_type": "single-type-listicle",
            "location_label": "Marrakech, Morocco",
            "targets": [
                {
                    "target_id": "item-1_blurb",
                    "field_type": "blurb",
                    "category": "accommodations",
                    "display_name": "Hotel B",
                    "research_subject": "Hotel B",
                    "location_label": "Medina, Marrakech",
                    "payload_doc_id": "doc-1",
                    "angle": "location-and-setting",
                },
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()["results"]["item-1_blurb"]
    assert payload["status"] == "generated"
    assert payload["requested_angle"] == "location-and-setting"
    assert payload["effective_angle"] == "location-and-setting"

    # Accommodations is on the lean writer path per ADR 0011: prompt is built
    # from the Writer Brief, not the bucket-labeled Research Profile.
    assert "RESEARCH PROFILE" not in captured["prompt"]
    assert "BUILDER CONTEXT" not in captured["prompt"]
    assert "Hotel B" in captured["prompt"]
    assert "Angle: Open by placing Hotel B on the ridge" in captured["prompt"]
    assert "Source facts (use only what you need):" in captured["prompt"]
    assert "travel editor" in captured["prompt"]
    assert "accommodations listicle" in captured["prompt"]

    step_names = [s["name"] for s in payload["steps"]]
    assert step_names == [
        "critical_fields_evaluated",
        "research_profile_completed",
        "writer_brief_completed",
        "writer_called",
        "validated",
        "finalized",
    ]


# ---------- Attractions lean pipeline (ADR 0012) ----------


def _fake_attractions_curator(*, prompt, model_name, max_tokens, temperature):
    return (
        json.dumps(
            {
                "angle_directive": (
                    "Open by naming the cliffside route at Mirador C and one "
                    "concrete reason it earns the stop."
                ),
                "source_facts": [
                    {
                        "fact": "The route follows a cliffside path.",
                        "citations": ["https://example.com/a"],
                    },
                    {
                        "fact": "Morning visits avoid the tour-bus peak.",
                        "citations": ["https://example.com/b"],
                    },
                ],
            }
        ),
        model_name,
    )


def test_attractions_blurb_runs_lean_path(monkeypatch):
    monkeypatch.setattr(
        research_profile_mod,
        "_invoke_grounded",
        lambda *a, **kw: _FakeGroundedResult(
            _research_profile_payload(angle="signature-feature")
        ),
    )
    monkeypatch.setattr(
        writer_brief_mod, "_invoke_curator_model", _fake_attractions_curator
    )

    captured = {"prompt": ""}

    class _WriterResult:
        def __init__(self, text: str) -> None:
            self.text = text
            self.model_name = "gemini-2.5-pro"

    def _fake_writer(*, prompt, model_name, max_tokens, temperature):
        captured["prompt"] = prompt
        return _WriterResult(_paragraph(100))

    monkeypatch.setattr(editor_assist_routes, "invoke_writer_model", _fake_writer)

    client = _build_client()
    response = client.post(
        "/editor-assist/generate-listicle-content",
        json={
            "article_title": "Best Things to Do in Lima",
            "article_type": "single-type-listicle",
            "location_label": "Lima, Peru",
            "targets": [
                {
                    "target_id": "item-1_blurb",
                    "field_type": "blurb",
                    "category": "attractions",
                    "display_name": "Mirador C",
                    "research_subject": "Mirador C",
                    "location_label": "Barranco, Lima",
                    "payload_doc_id": "doc-1",
                    "angle": "signature-feature",
                },
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()["results"]["item-1_blurb"]
    assert payload["status"] == "generated"
    assert payload["requested_angle"] == "signature-feature"
    assert payload["effective_angle"] == "signature-feature"

    # Attractions is on the lean writer path per ADR 0012.
    assert "RESEARCH PROFILE" not in captured["prompt"]
    assert "BUILDER CONTEXT" not in captured["prompt"]
    assert "Mirador C" in captured["prompt"]
    assert "Angle: Open by naming the cliffside route" in captured["prompt"]
    assert "Source facts (use only what you need):" in captured["prompt"]
    assert "travel editor" in captured["prompt"]
    assert "attractions listicle" in captured["prompt"]

    step_names = [s["name"] for s in payload["steps"]]
    assert step_names == [
        "critical_fields_evaluated",
        "research_profile_completed",
        "writer_brief_completed",
        "writer_called",
        "validated",
        "finalized",
    ]


# ---------- Intros bypass evidence research ----------


def test_intro_target_does_not_invoke_evidence_profile(monkeypatch):
    def _should_not_be_called(*a, **kw):
        raise AssertionError("evidence research must not run for intro targets")

    monkeypatch.setattr(research_profile_mod, "_invoke_grounded", _should_not_be_called)

    class _WriterResult:
        def __init__(self, text: str) -> None:
            self.text = text
            self.model_name = "gemini-2.5-pro"

    monkeypatch.setattr(
        editor_assist_routes,
        "invoke_writer_model",
        lambda **kw: _WriterResult(_paragraph(90)),
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
                    "target_id": "draft-1_header_intro",
                    "field_type": "intro",
                    "location_label": "Lima, Peru",
                },
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()["results"]["draft-1_header_intro"]
    assert payload["status"] == "generated"


# ---------- Skip-existing ----------


def test_skip_existing_preserves_current_content(monkeypatch):
    def _should_not_be_called(*a, **kw):
        raise AssertionError("evidence research must not run for skipped targets")

    monkeypatch.setattr(research_profile_mod, "_invoke_grounded", _should_not_be_called)

    def _writer_should_not_be_called(**kw):
        raise AssertionError("writer must not run for skipped targets")

    monkeypatch.setattr(
        editor_assist_routes, "invoke_writer_model", _writer_should_not_be_called
    )

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
                    "display_name": "La Mar",
                    "location_label": "Miraflores, Lima",
                    "payload_doc_id": "doc-1",
                },
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()["results"]["item-1_blurb"]
    assert payload["status"] == "skipped"
    assert payload["markdown"] == "Keep this copy"


# ---------- Graph runner integration (unchanged) ----------


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
                    "payload_doc_id": "doc-1",
                    "display_name": "La Mar",
                    "location_label": "Miraflores, Lima",
                },
            ],
        },
    )

    assert response.status_code == 200
    assert response.json()["results"]["item-1_blurb"]["markdown"] == "Generated blurb"
    assert called["graph"] is True


# ---------- Itinerary intro composer (ADR 0018) ----------


def test_compose_itinerary_intro_feeds_plan_signal_into_prompt(monkeypatch):
    captured: dict[str, str] = {}

    class _WriterResult:
        text = "A polished opener that sets up the day in Barranco."
        model_name = "gemini-2.5-flash"

    def _fake_writer(**kwargs):
        captured["prompt"] = kwargs["prompt"]
        return _WriterResult()

    monkeypatch.setattr(editor_assist_routes, "invoke_writer_model", _fake_writer)

    client = _build_client()
    response = client.post(
        "/editor-assist/compose-itinerary-intro",
        json={
            "article_title": "One Perfect Day in Lima",
            "location_label": "Lima, Peru",
            "list_tone": "elevated",
            "plan_overview": "A single luxurious foodie day anchored in Barranco.",
            "day_count": 1,
            "stops": [
                {
                    "title": "Grand Hotel",
                    "category": "Where You're Staying",
                    "day_label": "Day 1",
                    "selection_reason": "most comfortable, central",
                },
                {
                    "title": "Mérito",
                    "category": "Dining",
                    "day_label": "Day 1",
                },
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["intro"] == "A polished opener that sets up the day in Barranco."

    prompt = captured["prompt"]
    # The plan overview is the spine; the per-stop reason is texture.
    assert "A single luxurious foodie day anchored in Barranco." in prompt
    assert "most comfortable, central" in prompt
    assert "Mérito" in prompt

    # An inspectable step timeline accompanies the run (parity with Autobuild).
    steps = payload["steps"]
    assert [step["name"] for step in steps] == ["inputs", "writer", "finalize"]
    inputs_step = steps[0]
    assert inputs_step["status"] == "ok"  # plan overview present
    assert inputs_step["details"]["stop_count"] == 2
    assert inputs_step["details"]["stops_with_reason"] == 1
    writer_step = steps[1]
    assert writer_step["prompt"] == prompt
    assert writer_step["model"]
    assert steps[2]["output"] == payload["intro"]


def test_compose_itinerary_intro_inputs_step_warns_without_plan_overview(monkeypatch):
    class _WriterResult:
        text = "An opener."
        model_name = "gemini-2.5-flash"

    monkeypatch.setattr(
        editor_assist_routes, "invoke_writer_model", lambda **_kwargs: _WriterResult()
    )

    client = _build_client()
    response = client.post(
        "/editor-assist/compose-itinerary-intro",
        json={
            "article_title": "One Perfect Day in Lima",
            "location_label": "Lima, Peru",
            "stops": [{"title": "Mérito", "category": "Dining"}],
        },
    )

    assert response.status_code == 200
    inputs_step = response.json()["steps"][0]
    # No plan overview is a soft signal — the inputs step flags it as a warning.
    assert inputs_step["status"] == "warning"
    assert inputs_step["details"]["plan_overview_present"] is False


def test_compose_itinerary_intro_requires_at_least_one_stop(monkeypatch):
    def _writer_should_not_be_called(**kwargs):
        raise AssertionError("writer must not run without stops")

    monkeypatch.setattr(
        editor_assist_routes, "invoke_writer_model", _writer_should_not_be_called
    )

    client = _build_client()
    response = client.post(
        "/editor-assist/compose-itinerary-intro",
        json={
            "article_title": "One Perfect Day in Lima",
            "location_label": "Lima, Peru",
            "stops": [],
        },
    )

    assert response.status_code == 400
    assert "stop" in response.json()["detail"].lower()
