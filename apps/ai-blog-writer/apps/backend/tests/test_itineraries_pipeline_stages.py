"""Stage-boundary tests for Itinerary Autobuild orchestration."""

from __future__ import annotations

import ast
import asyncio
import sys
import types
from pathlib import Path

utils_stub = types.ModuleType("utils")
utils_stub.get_vertex_llm = lambda *args, **kwargs: None
utils_stub.invoke_vertex_multimodal_text = lambda *args, **kwargs: ""
utils_stub.parse_json_response = lambda *args, **kwargs: {}
utils_stub.vertex_part_from_data = lambda *args, **kwargs: None
sys.modules.setdefault("utils", utils_stub)

from app.features.itineraries_pipeline import candidate_scoring  # noqa: E402
from app.features.itineraries_pipeline import graph as graph_module  # noqa: E402
from app.features.itineraries_pipeline import intent_stage  # noqa: E402
from app.features.itineraries_pipeline import reasons_stage  # noqa: E402
from app.features.itineraries_pipeline import retrieval_stage  # noqa: E402
from app.features.itineraries_pipeline.schemas import (  # noqa: E402
    Candidate,
    DayShell,
    DayShellSelection,
    GenerateItineraryRequest,
    GenerateItineraryResponse,
    IntentSpec,
    PlanStop,
    ScoredCandidate,
    ShellSlot,
    SlotIssue,
)


def _slot(
    slot_id: str = "dinner",
    collections: list[str] | None = None,
) -> ShellSlot:
    return ShellSlot(
        id=slot_id,
        label=slot_id.capitalize(),
        daypart="dinner",
        acceptable_collections=collections or ["dining"],
    )


def _request(*, include_lodging: bool = True) -> GenerateItineraryRequest:
    return GenerateItineraryRequest(
        location="peru|lima",
        title="Lima days",
        brief="Coffee, culture, and a tasting-menu night.",
        day_count=1,
        payload_jwt="token",
        include_lodging=include_lodging,
        day_shells=[
            DayShellSelection(
                day_index=0,
                shell_id="balanced",
                shell_name="Balanced",
                slots=[_slot()],
            )
        ],
    )


def _candidate(
    item_id: int,
    category: str = "dining",
    title: str | None = None,
) -> Candidate:
    return Candidate(
        id=item_id,
        title=title or f"Candidate {item_id}",
        category=category,
    )


def test_candidate_scoring_owns_trace_ranking_and_best_candidate(monkeypatch):
    candidates = [_candidate(1), _candidate(2)]
    recorded = {}

    def fake_score_candidates(**kwargs):
        recorded.update(kwargs)
        kwargs["trace"]["prompt"] = "score prompt"
        kwargs["trace"]["output"] = "score output"
        return [
            ScoredCandidate(candidate=candidates[0], fit_score=61),
            ScoredCandidate(candidate=candidates[1], fit_score=94),
        ]

    monkeypatch.setattr(
        candidate_scoring,
        "score_candidates",
        fake_score_candidates,
    )

    result = candidate_scoring.score_for_slot(
        intent=IntentSpec(keywords=["culture"]),
        slot=_slot(),
        candidates=candidates,
        brief="Culture and dinner",
    )

    assert recorded["model_name"] == candidate_scoring.SCORING_MODEL
    assert result.best().candidate.id == 2
    assert [entry["id"] for entry in result.top()] == [2, 1]
    assert (result.prompt, result.output) == ("score prompt", "score output")


def test_intent_stage_records_warning_when_extraction_is_empty(monkeypatch):
    def fake_extract_intent(**kwargs):
        kwargs["trace"].update(prompt="intent prompt", output="{}")
        return IntentSpec()

    monkeypatch.setattr(intent_stage, "extract_intent", fake_extract_intent)
    state = asyncio.run(intent_stage.extract_request_intent({"request": _request()}))

    assert state["intent"] == IntentSpec()
    step = state["steps"][0]
    assert step.status == "warning"
    assert step.prompt == "intent prompt"
    assert "creative defaults" in step.details["note"]


def test_retrieval_stage_derives_collections_and_reports_empty_pools(monkeypatch):
    calls = []

    async def fake_fetch(**kwargs):
        calls.append(kwargs)
        if kwargs["category"] == "dining":
            return [_candidate(1)]
        return []

    monkeypatch.setattr(retrieval_stage, "fetch_candidates", fake_fetch)
    state = asyncio.run(retrieval_stage.retrieve_candidates({"request": _request()}))

    assert [call["category"] for call in calls] == ["dining", "accommodations"]
    assert state["day_shells"][0].name == "Balanced"
    assert state["steps"][0].status == "warning"
    assert state["steps"][0].details == {
        "counts_by_collection": {"dining": 1, "accommodations": 0},
        "empty_collections": ["accommodations"],
    }


def test_reasons_stage_applies_reasons_and_assembles_response(monkeypatch):
    request = _request()
    shell = DayShell(id="balanced", name="Balanced", slots=[_slot()])
    stop = PlanStop(
        slot_id="dinner",
        slot_label="Dinner",
        daypart="dinner",
        block_type="itinerary-dining",
        collection="dining",
        item=1,
        title="Candidate 1",
        selection_reason="fit fallback",
    )
    anchor = ScoredCandidate(
        candidate=_candidate(9, "accommodations", "Hotel Nine"),
        fit_score=40,
        fit_note="lodging fallback",
    )
    issue = SlotIssue(
        day_index=0,
        shell_id="balanced",
        slot_id="nightcap",
        slot_label="Nightcap",
        daypart="nightlife",
        issue="No candidates available for this slot.",
    )

    def fake_write_reasons(**kwargs):
        kwargs["trace"].update(prompt="reasons prompt", output="reasons output")
        return (
            {
                "dining:1": "A specific dinner reason.",
                "accommodations:9": "A specific lodging reason.",
            },
            "A compact plan overview.",
        )

    monkeypatch.setattr(reasons_stage, "write_reasons", fake_write_reasons)
    state = asyncio.run(
        reasons_stage.write_selection_reasons(
            {
                "request": request,
                "model_name": "writer-model",
                "anchor": anchor,
                "day_shells": [shell],
                "plan_days_stops": [[stop]],
                "slot_issues": [issue],
            }
        )
    )
    response = state["response"]

    assert response.days[0].items[0].selection_reason == "A specific dinner reason."
    assert (
        response.days[0].where_staying[0].selection_reason
        == "A specific lodging reason."
    )
    assert response.plan_overview == "A compact plan overview."
    assert response.slot_issues == [issue]
    assert "below the fit threshold" in response.notes[0]
    assert response.steps[-1].prompt == "reasons prompt"


def test_graph_module_is_only_topology_and_public_runner():
    graph_path = (
        Path(__file__).parents[1]
        / "app"
        / "features"
        / "itineraries_pipeline"
        / "graph.py"
    )
    source = graph_path.read_text()
    module = ast.parse(source)
    definitions = [
        node.name
        for node in module.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
    ]

    assert definitions == ["_build_graph", "run_itinerary_pipeline"]
    assert len(source.splitlines()) < 60
    assert "score_candidates" not in source
    assert "fetch_candidates" not in source
    assert "SlotIssue(" not in source


def test_graph_preserves_linear_stage_topology():
    compiled = graph_module._build_graph()
    graph = compiled.get_graph()

    assert list(graph.nodes) == [
        "__start__",
        "intent",
        "retrieve",
        "score",
        "select",
        "reasons",
        "__end__",
    ]
    assert [(edge.source, edge.target) for edge in graph.edges] == [
        ("__start__", "intent"),
        ("intent", "retrieve"),
        ("retrieve", "score"),
        ("score", "select"),
        ("select", "reasons"),
        ("reasons", "__end__"),
    ]


def test_graph_runner_preserves_response_api_and_default_model(monkeypatch):
    expected = GenerateItineraryResponse(days=[], model_used=graph_module.DEFAULT_MODEL)
    invoked = {}

    class FakeGraph:
        async def ainvoke(self, state):
            invoked.update(state)
            return {"response": expected}

    monkeypatch.setattr(graph_module, "_build_graph", lambda: FakeGraph())
    response = asyncio.run(graph_module.run_itinerary_pipeline(_request()))

    assert response is expected
    assert invoked["model_name"] == graph_module.DEFAULT_MODEL
