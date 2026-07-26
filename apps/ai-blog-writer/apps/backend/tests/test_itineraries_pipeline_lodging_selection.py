"""Lodging Anchor selection-stage tests."""

from tests.itineraries_pipeline_test_support import (
    candidate,
    run_selection,
    selection_state,
    single_dinner_request,
)

from app.features.itineraries_pipeline.schemas import ScoredCandidate


def test_include_lodging_defaults_on():
    assert single_dinner_request().include_lodging is True


def test_select_skips_lodging_with_visible_step_when_excluded(monkeypatch):
    request = single_dinner_request().model_copy(update={"include_lodging": False})
    state = selection_state(
        request,
        accommodations=[candidate(9, category="accommodations")],
    )

    output = run_selection(
        state,
        monkeypatch,
        lambda _slot, candidates: [
            ScoredCandidate(candidate=entry, fit_score=90) for entry in candidates
        ],
    )

    assert output["anchor"] is None
    lodging_steps = [step for step in output["steps"] if step.name == "lodging"]
    assert len(lodging_steps) == 1
    assert lodging_steps[0].details["skipped"] is True


def test_select_delivers_low_fit_lodging_flagged_as_warning(monkeypatch):
    state = selection_state(
        single_dinner_request(),
        accommodations=[candidate(9, category="accommodations")],
    )

    output = run_selection(
        state,
        monkeypatch,
        lambda _slot, candidates: [
            ScoredCandidate(candidate=entry, fit_score=10) for entry in candidates
        ],
    )

    lodging_step = next(step for step in output["steps"] if step.name == "lodging")
    assert output["anchor"] is not None
    assert output["anchor"].candidate.id == 9
    assert lodging_step.status == "warning"
    assert lodging_step.details["low_fit"] is True


def test_select_reports_failed_lodging_step_on_empty_pool(monkeypatch):
    state = selection_state(single_dinner_request(), accommodations=[])

    output = run_selection(
        state,
        monkeypatch,
        lambda _slot, candidates: [
            ScoredCandidate(candidate=entry, fit_score=90) for entry in candidates
        ],
    )

    lodging_step = next(step for step in output["steps"] if step.name == "lodging")
    assert output["anchor"] is None
    assert lodging_step.status == "failed"
    assert "No accommodations" in lodging_step.details["issue"]
