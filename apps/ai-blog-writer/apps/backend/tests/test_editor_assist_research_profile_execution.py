"""Execution and compatibility seams for Research Profile generation."""

from types import SimpleNamespace

import app.features.editor_assist.research_profile as research_profile
from app.features.editor_assist.research_profile import (
    ResearchProfileRequest,
    ResearchProfileTrace,
)


def test_grounded_failure_returns_the_existing_fallback_shape(monkeypatch):
    def _raise(*_args, **_kwargs):
        raise TimeoutError("grounding timed out")

    monkeypatch.setattr(research_profile, "_invoke_grounded", _raise)

    profile, trace = research_profile.run_research_profile(
        venue_name="La Mar",
        location_label="Lima, Peru",
        category="dining",
        requested_angle="signature-dish",
        grounded_model="gemini-test",
    )

    assert profile.selected_angle.angle == "signature-dish"
    assert profile.selected_angle.status == "unsupported"
    assert profile.usable_for_blurb is False
    assert profile.warnings == ["Research Profile grounded call failed."]
    assert trace.model == "gemini-test"
    assert trace.error == "grounded call raised: TimeoutError('grounding timed out')"
    assert "Venue: La Mar" in trace.prompt


def test_empty_grounded_result_preserves_model_and_empty_response_trace(monkeypatch):
    monkeypatch.setattr(
        research_profile,
        "_invoke_grounded",
        lambda *_args, **_kwargs: SimpleNamespace(
            text="  ",
            model_name="gemini-fallback",
        ),
    )

    profile, trace = research_profile.run_research_profile(
        venue_name="La Mar",
        location_label="Lima, Peru",
        category="dining",
        requested_angle=None,
    )

    assert profile.selected_angle.status == "not-requested"
    assert profile.warnings == ["Research Profile returned empty text."]
    assert trace.raw_response == "  "
    assert trace.model == "gemini-fallback"
    assert trace.error == "grounded call returned empty text"


def test_batch_execution_uses_the_facade_single_profile_seam(monkeypatch):
    calls: list[tuple[str, str]] = []

    def _fake_run_research_profile(
        *,
        venue_name,
        location_label,
        category,
        requested_angle,
        grounded_model,
    ):
        del location_label, category, requested_angle
        calls.append((venue_name, grounded_model))
        return (
            research_profile._fallback_profile(None),
            ResearchProfileTrace(prompt=venue_name, model=grounded_model),
        )

    monkeypatch.setattr(
        research_profile,
        "run_research_profile",
        _fake_run_research_profile,
    )
    requests = [
        ResearchProfileRequest(
            target_id="first",
            venue_name="Venue A",
            location_label="Lima",
            category="dining",
            requested_angle=None,
        ),
        ResearchProfileRequest(
            target_id="second",
            venue_name="Venue B",
            location_label="Lima",
            category="dining",
            requested_angle=None,
        ),
    ]

    results = research_profile.run_research_profiles_concurrently(
        requests,
        grounded_model="gemini-test",
        max_workers=1,
    )

    assert calls == [("Venue A", "gemini-test"), ("Venue B", "gemini-test")]
    assert list(results) == ["first", "second"]
    assert results["first"][1].prompt == "Venue A"
    assert results["second"][1].prompt == "Venue B"
