"""HTTP contract tests for Editor Assist Itinerary Composition."""

import app.features.editor_assist.editorial_actions as editorial_actions
from tests.editor_assist_route_test_support import (
    FakeWriterResult,
    build_editor_assist_client,
)


def test_compose_itinerary_brief_uses_injected_writer():
    client = build_editor_assist_client(
        writer=lambda **_kwargs: FakeWriterResult(
            text="A food-led Lima trip for curious couples.",
            model_name=editorial_actions.DEFAULT_MODEL,
        )
    )

    response = client.post(
        "/editor-assist/compose-itinerary-brief",
        json={
            "traveler_types": ["Couples"],
            "interests": ["Food"],
            "location_label": "Lima, Peru",
        },
    )

    assert response.status_code == 200
    assert response.json()["brief"] == "A food-led Lima trip for curious couples."


def test_compose_itinerary_intro_feeds_plan_signal_into_prompt():
    captured: dict[str, str] = {}

    def _fake_writer(**kwargs):
        captured["prompt"] = kwargs["prompt"]
        return FakeWriterResult(
            text="A polished opener that sets up the day in Barranco.",
            model_name="gemini-2.5-flash",
        )

    client = build_editor_assist_client(writer=_fake_writer)
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
    assert "A single luxurious foodie day anchored in Barranco." in prompt
    assert "most comfortable, central" in prompt
    assert "Mérito" in prompt

    steps = payload["steps"]
    assert [step["name"] for step in steps] == ["inputs", "writer", "finalize"]
    inputs_step = steps[0]
    assert inputs_step["status"] == "ok"
    assert inputs_step["details"]["stop_count"] == 2
    assert inputs_step["details"]["stops_with_reason"] == 1
    writer_step = steps[1]
    assert writer_step["prompt"] == prompt
    assert writer_step["model"]
    assert steps[2]["output"] == payload["intro"]


def test_compose_itinerary_intro_inputs_step_warns_without_plan_overview():
    client = build_editor_assist_client(
        writer=lambda **_kwargs: FakeWriterResult(
            text="An opener.",
            model_name="gemini-2.5-flash",
        )
    )
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
    assert inputs_step["status"] == "warning"
    assert inputs_step["details"]["plan_overview_present"] is False


def test_compose_itinerary_intro_requires_at_least_one_stop():
    def _writer_should_not_be_called(**_kwargs):
        raise AssertionError("writer must not run without stops")

    client = build_editor_assist_client(writer=_writer_should_not_be_called)
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
