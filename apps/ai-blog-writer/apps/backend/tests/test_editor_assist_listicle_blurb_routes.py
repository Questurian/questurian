"""HTTP contract tests for researched Listicle Content Generation blurbs."""

import app.features.editor_assist.research_profile as research_profile_mod
import app.features.editor_assist.writer_brief as writer_brief_mod
from tests.editor_assist_route_test_support import (
    FakeGroundedResult,
    FakeWriterResult,
    build_editor_assist_client,
    build_fake_curator,
    paragraph,
    research_profile_payload,
)


DINING_CURATOR = build_fake_curator(
    angle_directive="Open by naming one specific dish at La Mar.",
    source_facts=[
        ("Cevicheria with Peruvian seafood.", "https://example.com/a"),
        ("Tasting menu on weekends.", "https://example.com/b"),
    ],
)

ACCOMMODATIONS_CURATOR = build_fake_curator(
    angle_directive=(
        "Open by placing Hotel B on the ridge above the old quarter, "
        "naming what sits on either side."
    ),
    source_facts=[
        ("Set on a ridge above the medina.", "https://example.com/a"),
        ("Walking distance to the souk.", "https://example.com/b"),
    ],
)

ATTRACTIONS_CURATOR = build_fake_curator(
    angle_directive=(
        "Open by naming the cliffside route at Mirador C and one "
        "concrete reason it earns the stop."
    ),
    source_facts=[
        ("The route follows a cliffside path.", "https://example.com/a"),
        ("Morning visits avoid the tour-bus peak.", "https://example.com/b"),
    ],
)


def _build_prompt_capturing_writer(captured: dict[str, str], *, word_count: int = 100):
    def _fake_writer(*, prompt, model_name, max_tokens, temperature):
        del max_tokens, temperature
        captured["prompt"] = prompt
        return FakeWriterResult(paragraph(word_count), model_name)

    return _fake_writer


def test_blurb_with_supported_angle_generates_normally(monkeypatch):
    monkeypatch.setattr(
        research_profile_mod,
        "_invoke_grounded",
        lambda *_args, **_kwargs: FakeGroundedResult(
            research_profile_payload(angle="signature-dish")
        ),
    )
    monkeypatch.setattr(writer_brief_mod, "_invoke_curator_model", DINING_CURATOR)
    captured = {"prompt": ""}

    client = build_editor_assist_client(writer=_build_prompt_capturing_writer(captured))
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
    assert "RESEARCH PROFILE" not in captured["prompt"]
    assert "BUILDER CONTEXT" not in captured["prompt"]
    assert "Angle: Open by naming one specific dish at La Mar." in captured["prompt"]
    assert "Source facts (use only what you need):" in captured["prompt"]
    assert "food and travel editor" in captured["prompt"]
    assert [step["name"] for step in payload["steps"]] == [
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
        lambda *_args, **_kwargs: FakeGroundedResult(
            research_profile_payload(angle="atmosphere")
        ),
    )
    monkeypatch.setattr(writer_brief_mod, "_invoke_curator_model", DINING_CURATOR)
    captured = {"prompt": ""}

    client = build_editor_assist_client(writer=_build_prompt_capturing_writer(captured))
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

    assert response.status_code == 200
    payload = response.json()["results"]["item-1_blurb"]
    assert payload["status"] == "generated"
    assert payload["requested_angle"] == "atmosphere"
    assert payload["effective_angle"] == "atmosphere"
    assert [step["name"] for step in payload["steps"]] == [
        "critical_fields_evaluated",
        "research_profile_completed",
        "writer_brief_completed",
        "writer_called",
        "validated",
        "finalized",
    ]
    assert "BLURB ANGLE" not in captured["prompt"]
    assert "Angle:" in captured["prompt"]


def test_blurb_with_no_evidence_takes_identity_only_path(monkeypatch):
    monkeypatch.setattr(
        research_profile_mod,
        "_invoke_grounded",
        lambda *_args, **_kwargs: FakeGroundedResult(
            research_profile_payload(
                angle="signature-dish",
                selected_status="unsupported",
                bucket_findings=0,
            )
        ),
    )
    captured = {"prompt": ""}

    client = build_editor_assist_client(
        writer=_build_prompt_capturing_writer(captured, word_count=95)
    )
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
    assert "EVIDENCE STATUS" in captured["prompt"]
    assert "No public evidence was found" in captured["prompt"]
    assert "EVIDENCE PROFILE FINDINGS" not in captured["prompt"]
    research_step = next(
        step
        for step in payload["steps"]
        if step["name"] == "research_profile_completed"
    )
    assert research_step["status"] == "failed"


def test_accommodations_blurb_runs_lean_path(monkeypatch):
    monkeypatch.setattr(
        research_profile_mod,
        "_invoke_grounded",
        lambda *_args, **_kwargs: FakeGroundedResult(
            research_profile_payload(angle="location-and-setting")
        ),
    )
    monkeypatch.setattr(
        writer_brief_mod, "_invoke_curator_model", ACCOMMODATIONS_CURATOR
    )
    captured = {"prompt": ""}

    client = build_editor_assist_client(writer=_build_prompt_capturing_writer(captured))
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
    assert "RESEARCH PROFILE" not in captured["prompt"]
    assert "BUILDER CONTEXT" not in captured["prompt"]
    assert "Hotel B" in captured["prompt"]
    assert "Angle: Open by placing Hotel B on the ridge" in captured["prompt"]
    assert "Source facts (use only what you need):" in captured["prompt"]
    assert "travel editor" in captured["prompt"]
    assert "accommodations listicle" in captured["prompt"]
    assert [step["name"] for step in payload["steps"]] == [
        "critical_fields_evaluated",
        "research_profile_completed",
        "writer_brief_completed",
        "writer_called",
        "validated",
        "finalized",
    ]


def test_attractions_blurb_runs_lean_path(monkeypatch):
    monkeypatch.setattr(
        research_profile_mod,
        "_invoke_grounded",
        lambda *_args, **_kwargs: FakeGroundedResult(
            research_profile_payload(angle="signature-feature")
        ),
    )
    monkeypatch.setattr(writer_brief_mod, "_invoke_curator_model", ATTRACTIONS_CURATOR)
    captured = {"prompt": ""}

    client = build_editor_assist_client(writer=_build_prompt_capturing_writer(captured))
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
    assert "RESEARCH PROFILE" not in captured["prompt"]
    assert "BUILDER CONTEXT" not in captured["prompt"]
    assert "Mirador C" in captured["prompt"]
    assert "Angle: Open by naming the cliffside route" in captured["prompt"]
    assert "Source facts (use only what you need):" in captured["prompt"]
    assert "travel editor" in captured["prompt"]
    assert "attractions listicle" in captured["prompt"]
    assert [step["name"] for step in payload["steps"]] == [
        "critical_fields_evaluated",
        "research_profile_completed",
        "writer_brief_completed",
        "writer_called",
        "validated",
        "finalized",
    ]
