"""HTTP contract tests for Listicle Content Generation orchestration."""

import app.features.editor_assist.listicle_content as listicle_content
import app.features.editor_assist.research_profile as research_profile_mod
from tests.editor_assist_route_test_support import (
    FakeWriterResult,
    build_editor_assist_client,
    paragraph,
)


def test_listicle_guidelines_returns_writer_vocabulary():
    client = build_editor_assist_client()

    response = client.get("/editor-assist/listicle-guidelines")

    assert response.status_code == 200
    payload = response.json()
    assert payload["angles"]["signature-dish"]
    assert payload["tones"]["elevated"]


def test_blurb_target_missing_payload_doc_id_fails_critical_fields(monkeypatch):
    """A blurb target without Payload doc identity hard-blocks before research."""

    def _should_not_be_called(*_args, **_kwargs):
        raise AssertionError("evidence research must not run for CF-failed target")

    monkeypatch.setattr(research_profile_mod, "_invoke_grounded", _should_not_be_called)

    client = build_editor_assist_client()
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
                },
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()["results"]["item-1_blurb"]
    assert payload["status"] == "error"
    assert "payload_doc_id" in payload["error_message"]


def test_intro_target_does_not_invoke_research_profile(monkeypatch):
    def _should_not_be_called(*_args, **_kwargs):
        raise AssertionError("evidence research must not run for intro targets")

    monkeypatch.setattr(research_profile_mod, "_invoke_grounded", _should_not_be_called)

    client = build_editor_assist_client(
        writer=lambda **_kwargs: FakeWriterResult(
            text=paragraph(90),
            model_name="gemini-2.5-pro",
        )
    )
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


def test_skip_existing_preserves_current_content(monkeypatch):
    def _should_not_be_called(*_args, **_kwargs):
        raise AssertionError("evidence research must not run for skipped targets")

    monkeypatch.setattr(research_profile_mod, "_invoke_grounded", _should_not_be_called)

    def _writer_should_not_be_called(**_kwargs):
        raise AssertionError("writer must not run for skipped targets")

    client = build_editor_assist_client(writer=_writer_should_not_be_called)
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


def test_generate_listicle_content_uses_langgraph_runner():
    called = {"graph": False}

    def _fake_graph_runner(*, node_name, step_runner):
        assert node_name == "editor_assist_generate_listicle_content"
        del step_runner
        called["graph"] = True
        return listicle_content.GenerateListicleContentResponse(
            results={
                "item-1_blurb": listicle_content.GenerateListicleTargetResponse(
                    target_id="item-1_blurb",
                    status="generated",
                    markdown="Generated blurb",
                    model_used="gemini-2.5-flash",
                )
            }
        )

    client = build_editor_assist_client(graph_runner=_fake_graph_runner)
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
