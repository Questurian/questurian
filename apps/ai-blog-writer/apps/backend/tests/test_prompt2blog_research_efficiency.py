"""Paid-work reuse and the Gemini schema boundary (#499). No network calls."""
from copy import deepcopy
from types import SimpleNamespace

import pytest

from app.features.prompt2blog import research_v4 as research
from app.features.prompt2blog.contracts_v4 import WorkOrderRequirement
from app.features.prompt2blog import llm as model_calls
from utils.llm_client import VertexTextLLM
from test_prompt2blog_research import _brief, _work_order, _evidence_payload, RecordingGather, StructureLLM


def test_gemini_receives_schema_and_preserves_usage_when_shape_is_invalid():
    requests = []
    usage = {"input_tokens": 10, "output_tokens": 2, "total_tokens": 12}

    class Provider:
        def generate(self, prompts, **kwargs):
            requests.append(kwargs)
            return SimpleNamespace(generations=[[SimpleNamespace(
                text='{}', generation_info={"usage_metadata": usage})]])

    adapter = VertexTextLLM(Provider(), "gemini-2.5-flash")
    schema = {"type": "object", "properties": {"requirements": {"type": "array", "items": {"type": "string"}}}, "required": ["requirements"]}
    with pytest.raises(ValueError, match="missing required"):
        adapter.invoke_json("notes", input_schema=schema, thinking_budget=0)
    assert requests[0]["response_schema"] == schema
    assert requests[0]["response_mime_type"] == "application/json"
    assert requests[0]["thinking_budget"] == 0
    assert adapter.last_usage_metadata == usage


def test_interruption_keeps_finished_search_and_only_buys_missing(monkeypatch):
    monkeypatch.setattr(research, "P2B_V4_GATHER_CONCURRENCY", 1)
    gather = RecordingGather()
    deps = research.ResearchDependencies(gather, StructureLLM(_evidence_payload()))
    saved = {}

    def checkpoint(notes):
        saved.update(notes)
        raise RuntimeError("simulated interruption after durable write")

    with pytest.raises(RuntimeError, match="interruption"):
        research.gather_research(_brief(), _work_order(), deps, checkpoint=checkpoint)
    assert len(saved) == len(gather.calls) == 1
    notes = research.gather_research(_brief(), _work_order(), deps, kept_notes=saved)
    assert len(notes) == len(gather.calls) == 2


def test_question_edit_invalidates_only_its_notes_and_scope_edit_invalidates_all():
    work = _work_order()
    notes = {q.requirement_id: research.GatheredNotes("cited notes") for q in work.requirements}
    stored = research.notes_stage_record(work, notes)
    edited = work.model_copy(update={"requirements": [work.requirements[0].model_copy(update={"question": "New question"}), work.requirements[1]]})
    assert set(research.notes_from_record(stored, edited)) == {"r2"}
    assert research.notes_from_record(stored, work.model_copy(update={"brief_fingerprint": "changed"})) == {}


def test_grouped_search_preserves_both_requirements_without_double_counting():
    work = _work_order()
    work = work.model_copy(update={"requirements": [q.model_copy(update={"search_group": "related"}) for q in work.requirements]})
    gather = RecordingGather()
    notes = research.gather_research(_brief(), work, research.ResearchDependencies(gather, None))
    assert len(gather.calls) == 1
    assert set(notes) == {"r1", "r2"}
    assert sum(note.tokens or 0 for note in notes.values()) == 1200
    assert all(q.question in gather.calls[0][0] for q in work.requirements)


def test_structure_checkpoint_survives_failure_before_premise():
    work = _work_order()
    notes = {q.requirement_id: research.GatheredNotes("cited notes") for q in work.requirements}
    model = StructureLLM(_evidence_payload())
    deps = research.ResearchDependencies(RecordingGather(), model)
    saved = {}

    def checkpoint(batches):
        saved.update(deepcopy(batches))
        raise RuntimeError("interrupted after batch")

    with pytest.raises(RuntimeError, match="interrupted"):
        research.structure_research(work, notes, deps, checkpoint=checkpoint)
    assert len(model.calls) == 1
    research.structure_research(work, notes, deps, kept_batches=saved)
    assert len(model.calls) == 2


def test_schema_failure_is_metered_once_and_correlated(monkeypatch):
    records = []
    observations = []
    from contextlib import contextmanager

    class Adapter:
        model_name = "gemini-2.5-flash"
        last_usage_metadata = {"input_tokens": 5, "output_tokens": 2}

        def invoke_json(self, prompt, **kwargs):
            assert kwargs["thinking_budget"] == 0
            raise ValueError("bad object")

    @contextmanager
    def observed(**kwargs):
        observations.append(kwargs)
        yield SimpleNamespace(record_usage=lambda usage: None)

    monkeypatch.setattr(model_calls, "get_vertex_llm", lambda **kwargs: Adapter())
    monkeypatch.setattr(model_calls, "observe_external_call", observed)
    with pytest.raises(ValueError, match="bad object"):
        model_calls._invoke_json_llm(prompt="notes", max_tokens=8192, temperature=0,
            model_name="gemini-2.5-flash", job_id="p2b.research_structure", schema={"type": "object"},
            correlation_id="run-499", usage_recorder=lambda model, usage: records.append(usage))
    assert len(records) == len(observations) == 1
    assert observations[0]["correlation_id"] == "run-499"


def test_overlapping_intake_is_rejected_before_work_starts():
    from fastapi import HTTPException
    from app.features.prompt2blog.intake_lock import intake_lock
    with intake_lock("run-499"):
        with pytest.raises(HTTPException) as caught:
            with intake_lock("run-499"):
                pytest.fail("second request entered")
        assert caught.value.status_code == 409
        with intake_lock("different-run"):
            pass
    with intake_lock("run-499"):
        pass


def test_opaque_urls_are_copied_as_handles_and_restored_exactly():
    url = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/" + "aB7_" * 300
    work = _work_order()
    notes = {q.requirement_id: research.GatheredNotes(f"Cited fact [{url}]", [url]) for q in work.requirements}
    payload = _evidence_payload()
    payload["sources"][0]["url"] = "URL1"
    model = StructureLLM(payload)
    result = research._structure_batch(work, work.requirements, notes,
        research.ResearchDependencies(None, model))
    assert not result.get("_retryable")
    assert result["sources"][0]["url"] == url
    assert url not in model.calls[0]["prompt"]
    assert "URL1" in model.calls[0]["prompt"]
    assert model.calls[0]["prompt"].count("Cited fact") == 1


def test_invalid_batch_is_not_cached_but_its_receipt_is_checkpointed():
    # An empty premise settles without a call while the batch is failing, so
    # the first run's only call is the batch itself.
    work = _work_order(
        premise=[],
        requirements=[
            WorkOrderRequirement(
                requirement_id="r1",
                question="What do market stalls charge?",
                kind="load_bearing",
            ),
            WorkOrderRequirement(
                requirement_id="r2",
                question="What is Huaca Pucllana like after dark?",
                kind="texture",
            ),
        ],
    )
    notes = {q.requirement_id: research.GatheredNotes("notes") for q in work.requirements}
    model = StructureLLM({"requirements": []})
    snapshots = []
    research.structure_research(work, notes, research.ResearchDependencies(None, model),
        checkpoint=lambda cache: snapshots.append(deepcopy(cache)))
    assert snapshots[0] == {}
    model.payload = _evidence_payload()
    research.structure_research(work, notes, research.ResearchDependencies(None, model),
        kept_batches=snapshots[-1])
    # The unusable batch, bought again, then the premise pass -- which the
    # first run skipped, because an empty premise with no claims settles itself.
    assert len(model.calls) == 3


def test_cache_drops_entries_no_future_call_can_hit():
    work = _work_order()
    notes = {q.requirement_id: research.GatheredNotes("cited notes") for q in work.requirements}
    model = StructureLLM(_evidence_payload())
    snapshots = []
    research.structure_research(work, notes, research.ResearchDependencies(None, model),
        kept_batches={"stale-key-from-a-cut-question": {"claims": []}},
        checkpoint=lambda cache: snapshots.append(deepcopy(cache)))
    assert "stale-key-from-a-cut-question" not in snapshots[-1]
    # One batch and one premise pass, and nothing carried from the cut plan.
    assert len(snapshots[-1]) == 2

    # The surviving entries are the ones a rerun of this same plan reuses.
    model.calls.clear()
    research.structure_research(work, notes, research.ResearchDependencies(None, model),
        kept_batches=snapshots[-1])
    assert model.calls == []


def test_a_source_url_that_is_not_a_link_names_itself_in_the_failure(caplog):
    work = _work_order()
    notes = {q.requirement_id: research.GatheredNotes("Cited fact", ["https://example.pe/a"])
             for q in work.requirements}
    payload = _evidence_payload()
    payload["sources"][0]["url"] = "www.example.pe"
    result = research._structure_batch(work, work.requirements, notes,
        research.ResearchDependencies(None, StructureLLM(payload)))
    assert result["_retryable"] is True
    assert "www.example.pe" in caplog.text


def test_withdrawing_an_unrelated_assumption_keeps_the_searches_it_never_touched():
    """Striking one misread assumption used to discard every saved search.

    `requirement_fingerprint` hashed the whole premise, so a question that
    never declared an assumption still lost its answer when that assumption
    was withdrawn. Run b88081a0 lost eighteen paid searches that way.
    """
    from app.features.prompt2blog.contracts_v4 import WorkOrderAssumption

    work = _work_order(
        premise=[
            WorkOrderAssumption(assumption_id="a1", statement="Prices are published."),
            WorkOrderAssumption(assumption_id="a2", statement="The bridge is open."),
        ]
    )
    notes = {q.requirement_id: research.GatheredNotes("cited notes") for q in work.requirements}
    stored = research.notes_stage_record(work, notes)

    # r1 declares a1; r2 declares nothing. Withdraw a2, which neither uses.
    without_a2 = work.model_copy(
        update={"premise": [item for item in work.premise if item.assumption_id != "a2"]}
    )

    kept = research.notes_from_record(stored, without_a2)

    assert set(kept) == {"r1", "r2"}, "an assumption nobody declared invalidated everything"

    # Withdrawing a1 still invalidates r1, which does declare it.
    without_a1 = work.model_copy(
        update={"premise": [item for item in work.premise if item.assumption_id != "a1"]}
    )
    assert set(research.notes_from_record(stored, without_a1)) == {"r2"}
