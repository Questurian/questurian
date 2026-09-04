"""The Lima regression through the whole mocked v3 graph."""

from __future__ import annotations

import json
from contextlib import contextmanager
from copy import deepcopy
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from fastapi import BackgroundTasks, HTTPException

import app.features.prompt2blog.api.runs as runs_api
import app.features.prompt2blog.routes as prompt2blog_routes
from app.features.prompt2blog.config import P2B_RUN_TOKEN_BUDGET
from app.features.prompt2blog.contracts_v4 import Prompt2BlogV4Request
from app.features.prompt2blog.dependencies import PipelineDependencies
from app.features.prompt2blog.intake_v3 import prepare_v3_runtime_request
from app.features.prompt2blog.orchestrator_v3 import run_pipeline_v3
from app.features.prompt2blog.run_recorder import RunRecorder
from tests.prompt2blog_test_support import response_payload
from utils import llm_model_policy

FIXTURE_PATH = (
    Path(__file__).parents[3]
    / "data"
    / "fixtures"
    / "prompt2blog"
    / "lima-scope-drift-v4.json"
)


def _fixture() -> dict:
    return json.loads(FIXTURE_PATH.read_text())


def _supported_evidence() -> dict:
    evidence = deepcopy(_fixture()["evidence_package"])
    evidence["claims"].extend(
        [
            {
                "claim_id": "c2",
                "text": "Current reporting documents Lima's practical tradeoffs.",
                "source_ids": ["s1"],
                "requirement_ids": ["r2"],
                "as_of": "2026-07-01",
                "confidence": "medium",
            },
            {
                "claim_id": "c3",
                "text": "Comparable earlier reporting shows how those costs moved.",
                "source_ids": ["s1"],
                "requirement_ids": ["r3"],
                "as_of": "2026-07-01",
                "confidence": "medium",
            },
        ]
    )
    evidence["requirements"] = [
        {"requirement_id": "r1", "status": "supported", "claim_ids": ["c1"], "gap": ""},
        {"requirement_id": "r2", "status": "supported", "claim_ids": ["c2"], "gap": ""},
        {"requirement_id": "r3", "status": "supported", "claim_ids": ["c3"], "gap": ""},
    ]
    evidence["gaps"] = []
    return evidence


def _request(**overrides) -> Prompt2BlogV4Request:
    payload = {
        "schema_version": 4,
        "brief": _fixture()["brief"],
            "work_order": _fixture()["work_order"],
        "evidence_package": _supported_evidence(),
        "profiles": {
            "length_id": "medium",
            "creativity_level": "medium",
        },
        "model_routing": {
            "model_name": "test-model",
            "writing_model": "gemini-2.5-flash",
            "audit_model": "gemini-2.5-flash",
        },
    }
    payload.update(overrides)
    return Prompt2BlogV4Request.model_validate(payload)


OUTLINE = {
    "working_title": "What Lima costs now",
    "direct_answer_focus": "Whether Lima still offers long-stay value.",
    "sections": [
        {
            "heading": "What Lima costs now",
            "purpose": "Establish the current cost baseline for Lima.",
            "claim_ids": ["c1"],
            "requirement_ids": ["r1"],
            "target_words": 300,
        },
        {
            "heading": "The tradeoffs behind the price",
            "purpose": "Show the practical tradeoffs a Lima resident meets.",
            "claim_ids": ["c2"],
            "requirement_ids": ["r2"],
            "target_words": 300,
        },
        {
            "heading": "How the Lima picture changed",
            "purpose": "Compare the current baseline with earlier reporting.",
            "claim_ids": ["c3"],
            "requirement_ids": ["r3"],
            "target_words": 300,
        },
    ],
    "takeaway_focus": "What decides the answer for a long stay.",
    "brief_alignment": "Answers the cost question about Lima itself.",
    "unsupported_requirements": [],
}


def _section(heading: str, sentence: str) -> str:
    # The audit's word-count check is deterministic and measured on the real
    # text, so the mocked draft has to be a real medium-length article.
    paragraphs = [" ".join([sentence] * 4) for _ in range(6)]
    return f"## {heading}\n\n" + "\n\n".join(paragraphs)


DRAFT = {
    "improved_title": "What Lima costs now",
    "improved_content": "\n\n".join(
        [
            _section(
                "What Lima costs now",
                "Official price reporting gives a current baseline for routine "
                "costs in Lima.",
            ),
            _section(
                "The tradeoffs behind the price",
                "The same reporting shows the practical tradeoffs a Lima "
                "resident meets each month.",
            ),
            _section(
                "How the Lima picture changed",
                "Earlier reporting shows how those Lima costs moved over the "
                "period covered.",
            ),
        ]
    ),
    "brief_alignment_summary": "Answers the cost question about Lima.",
    "improvements_applied": ["Grounded every section in a claim."],
    "remaining_gaps": [],
}


@dataclass
class RecordingRecorder:
    stages: dict[str, Any] = field(default_factory=dict)
    order: list[str] = field(default_factory=list)
    artifacts: list[dict[str, Any]] = field(default_factory=list)
    completed: list[str] = field(default_factory=list)
    active: str = ""

    def start_stage(self, _run_id: str, stage: str) -> None:
        self.order.append(stage)
        self.active = stage

    def record_stage(self, _run_id: str, stage: str, payload: dict[str, Any]) -> None:
        self.stages[stage] = payload

    def record_artifact(self, _run_id: str, artifact: dict[str, Any]) -> None:
        self.artifacts.append(artifact)

    def complete(self, run_id: str) -> None:
        self.completed.append(run_id)

    def fail(self, *_args, **_kwargs) -> None:
        raise AssertionError("the mocked v3 run must not fail")

    def active_stage(self, _run_id: str) -> str:
        return self.active


@dataclass
class SpentTokens:
    """Only the half of the tracker the budget gate reads.

    Deliberately not a whole `UsageLedger`: a full one would make
    `PipelineDependencies` try to wire this run's recorder for per-stage
    attribution, which the recording fake here does not support.
    """

    total_tokens: int

    def totals(self) -> dict[str, int]:
        return {"total_tokens": self.total_tokens}


@dataclass
class ScriptedLLM:
    quality_scores: list[int]
    prompts: list[tuple[str, str]] = field(default_factory=list)
    models: dict[str, list[str | None]] = field(default_factory=dict)
    grounded: bool = True
    usage_tracker: Any = None

    def _record_model(self, stage: str, model_name: str | None) -> None:
        self.models.setdefault(stage, []).append(model_name)

    def invoke_json(
        self, *, prompt: str, model_name: str | None = None, **_kwargs
    ) -> tuple[dict[str, Any], str]:
        if "planning an article before it is written" in prompt:
            self.prompts.append(("outline", prompt))
            self._record_model("outline", model_name)
            return OUTLINE, json.dumps(OUTLINE)
        if "fact-grounding checker" in prompt:
            self.prompts.append(("groundedness", prompt))
            self._record_model("groundedness", model_name)
            payload = {
                "grounded": self.grounded,
                "assessment": "Checked against the records.",
                "unsupported_claims": (
                    []
                    if self.grounded
                    else [
                        {
                            "claim": "Rent averages 900 dollars.",
                            "reason": "No record states a rent figure.",
                            "severity": "high",
                        }
                    ]
                ),
            }
            return payload, json.dumps(payload)
        if "quality auditor" in prompt:
            self.prompts.append(("audit", prompt))
            self._record_model("audit", model_name)
            score = (
                self.quality_scores.pop(0)
                if len(self.quality_scores) > 1
                else self.quality_scores[0]
            )
            payload = {
                "overall_score": score,
                "guideline_coverage_score": score,
                "informativeness_score": score,
                "originality_score": score,
                "brief_adherence_score": score,
                "seo_score": score,
                "too_close_to_source": False,
                "constraint_checks": {"audience_match": True, "tone_match": True},
                "required_revisions": [] if score >= 8 else ["Tighten the opening."],
                "quality_summary": "Scored by the scripted auditor.",
            }
            return payload, json.dumps(payload)
        if "repair pass" in prompt:
            self.prompts.append(("repair", prompt))
            self._record_model("repair", model_name)
            return DRAFT, json.dumps(DRAFT)
        self.prompts.append(("compose", prompt))
        self._record_model("compose", model_name)
        return DRAFT, json.dumps(DRAFT)

    def enforce_anti_ai(self, text: str, **_kwargs) -> str:
        return text


def _run(**llm_kwargs) -> tuple[dict[str, Any], RecordingRecorder, ScriptedLLM]:
    llm = ScriptedLLM(**llm_kwargs)
    recorder = RecordingRecorder()
    runtime = prepare_v3_runtime_request(_request())
    state = run_pipeline_v3(
        "lima-v3-run",
        runtime,
        PipelineDependencies(llm=llm, recorder=recorder),
    )
    return state, recorder, llm


def test_the_lima_brief_runs_end_to_end_through_the_graph():
    state, recorder, _llm = _run(quality_scores=[9])

    assert state["completed"] is True
    assert recorder.order == [
        "stage_v3_outline",
        "stage_v3_compose",
        "stage_v3_groundedness",
        "stage_v3_quality_audit",
        "stage_v3_quality_settle",
        "stage_v3_finalize",
    ]
    payload = recorder.stages["pipeline_v3"]
    assert payload["pipeline_status"] == "ready_for_staging"
    assert payload["form"]["id"] == "analysis"
    assert payload["work_order"]["primary_subject"] == "Lima"
    assert payload["evidence_receipt"]["requirement_status"] == {
        "r1": "supported",
        "r2": "supported",
        "r3": "supported",
    }
    contexts = payload["debug"]["stage_contexts"]
    assert set(contexts) == {"outline", "compose", "audit", "repair_lock"}
    assert contexts["compose"]["character_count"] > contexts["audit"]["character_count"]
    assert len(contexts["compose"]["fingerprint"]) == 64
    assert "instruction_text" not in payload["debug"]
    # The seed, not a headline anyone paid for (ADR 0034). No stage writes
    # one, and the double no longer answers a text call at all.
    assert state["final_title"] == _fixture()["brief"]["seed"]


def test_balanced_route_reserves_opus_for_drafting_and_repair():
    request = _request(
        model_routing={
            "model_name": "gemini-2.5-flash-lite",
            "writing_model": "claude-opus-5-high",
            "audit_model": "claude-sonnet-5-high",
            "model_stack_id": "opus-led-high",
        }
    )
    llm = ScriptedLLM(quality_scores=[6, 9])
    recorder = RecordingRecorder()

    run_pipeline_v3(
        "balanced-routing-run",
        prepare_v3_runtime_request(request),
        PipelineDependencies(llm=llm, recorder=recorder),
    )

    assert llm.models == {
        "outline": ["claude-sonnet-5-medium"],
        "compose": ["claude-opus-5-high"],
        "groundedness": ["claude-sonnet-5-medium", "claude-sonnet-5-medium"],
        "audit": ["claude-sonnet-5-high", "claude-sonnet-5-high"],
        "repair": ["claude-opus-5-high"],
    }

    # The receipt has to name the same models the run used. `model_used` under
    # the quality review reported the worker model, which v3 never calls, so a
    # review written by Sonnet was filed under a Gemini name.
    review = recorder.stages["pipeline_v3"]["quality_review"]
    assert review["model_used"] == "claude-sonnet-5-high"
    assert review["stage_model_overrides"]["stage_v3_compose"] == "claude-opus-5-high"


def test_a_route_can_move_the_checking_stages_off_claude():
    """The Gemini-checked route: Claude drafts and repairs, Gemini checks.

    Outline, groundedness and title were pinned in `config.py` and unreachable
    from a request, so a route could only move two of the six calls a run
    makes. The point of moving them is not only metered spend -- it is that a
    Claude draft graded by a Claude judge is marked by a model that shares its
    blind spots.
    """
    request = _request(
        model_routing={
            "model_name": "gemini-2.5-flash-lite",
            "writing_model": "claude-opus-5-high",
            "audit_model": "gemini-2.5-pro",
            "outline_model": "gemini-2.5-pro",
            "groundedness_model": "gemini-2.5-pro",
            "model_stack_id": "gemini-checked-high",
        }
    )
    llm = ScriptedLLM(quality_scores=[6, 9])
    recorder = RecordingRecorder()

    run_pipeline_v3(
        "gemini-checked-run",
        prepare_v3_runtime_request(request),
        PipelineDependencies(llm=llm, recorder=recorder),
    )

    assert llm.models == {
        "outline": ["gemini-2.5-pro"],
        "compose": ["claude-opus-5-high"],
        "groundedness": ["gemini-2.5-pro", "gemini-2.5-pro"],
        "audit": ["gemini-2.5-pro", "gemini-2.5-pro"],
        "repair": ["claude-opus-5-high"],
    }


def test_a_route_can_repair_at_a_different_effort_than_it_drafts():
    """Max effort where it is conditional, not where it is unavoidable.

    Repair only fires on a draft that failed, and the run buys exactly one
    attempt, so this is the single call whose strength decides whether a weak
    draft is rescued or handed back. Max on the draft would be paid on every
    run, including the ones that were going to pass.
    """
    request = _request(
        model_routing={
            "model_name": "gemini-2.5-flash-lite",
            "writing_model": "claude-opus-5-high",
            "repair_model": "claude-opus-5-max",
            "audit_model": "gemini-2.5-pro",
            "outline_model": "gemini-2.5-pro",
            "groundedness_model": "gemini-2.5-pro",
            "model_stack_id": "gemini-checked-max-repair",
        }
    )
    llm = ScriptedLLM(quality_scores=[6, 9])
    recorder = RecordingRecorder()

    run_pipeline_v3(
        "max-repair-run",
        prepare_v3_runtime_request(request),
        PipelineDependencies(llm=llm, recorder=recorder),
    )

    assert llm.models["compose"] == ["claude-opus-5-high"]
    assert llm.models["repair"] == ["claude-opus-5-max"]
    # The receipt has to name the model that did the rewrite, not the writer it
    # would have inherited.
    overrides = recorder.stages["pipeline_v3"]["quality_review"][
        "stage_model_overrides"
    ]
    assert overrides["stage_v3_repair"] == "claude-opus-5-max"
    assert overrides["stage_v3_compose"] == "claude-opus-5-high"


def test_repair_follows_the_writer_when_a_route_does_not_name_it():
    request = _request(
        model_routing={
            "model_name": "gemini-2.5-flash-lite",
            "writing_model": "claude-opus-5-high",
            "audit_model": "claude-sonnet-5-high",
            "model_stack_id": "opus-led-high",
        }
    )
    llm = ScriptedLLM(quality_scores=[6, 9])

    run_pipeline_v3(
        "inherited-repair-run",
        prepare_v3_runtime_request(request),
        PipelineDependencies(llm=llm, recorder=RecordingRecorder()),
    )

    assert llm.models["repair"] == ["claude-opus-5-high"]


def test_a_request_that_names_no_checking_models_keeps_the_pinned_defaults():
    """An older client sends three roles, not six, and must route as it always did."""
    request = _request(
        model_routing={
            "model_name": "gemini-2.5-flash-lite",
            "writing_model": "claude-opus-5-high",
            "audit_model": "claude-sonnet-5-high",
            "model_stack_id": "opus-led-high",
        }
    )
    llm = ScriptedLLM(quality_scores=[9])

    run_pipeline_v3(
        "legacy-routing-run",
        prepare_v3_runtime_request(request),
        PipelineDependencies(llm=llm, recorder=RecordingRecorder()),
    )

    assert llm.models["outline"] == ["claude-sonnet-5-medium"]
    assert llm.models["groundedness"] == ["claude-sonnet-5-medium"]


def test_a_claude_written_draft_says_the_creativity_dial_did_not_reach_it(monkeypatch):
    """The control sets a temperature, and the Claude plan transport has none.

    Silently dropping it is what made two drafts at different creativity levels
    indistinguishable with nothing on the run saying why.
    """
    monkeypatch.setattr(llm_model_policy, "anthropic_models_enabled", lambda: False)
    monkeypatch.setattr(
        llm_model_policy, "claude_subscription_models_enabled", lambda: True
    )
    request = _request(
        model_routing={
            "model_name": "gemini-2.5-flash-lite",
            "writing_model": "claude-opus-5-high",
            "audit_model": "claude-sonnet-5-high",
            "model_stack_id": "opus-led-high",
        }
    )
    recorder = RecordingRecorder()

    run_pipeline_v3(
        "creativity-honesty-run",
        prepare_v3_runtime_request(request),
        PipelineDependencies(llm=ScriptedLLM(quality_scores=[9]), recorder=recorder),
    )

    creativity = recorder.stages["pipeline_v3"]["quality_review"]["creativity"]
    assert creativity["applied_to_compose"] is False
    assert creativity["level"] == "medium"
    assert creativity["compose_temperature"] == 0.2


def test_the_v3_run_never_reaches_a_guideline_or_supplement_stage():
    _state, recorder, _llm = _run(quality_scores=[9])

    assert "stage_guideline_fetch" not in recorder.order
    assert "stage_coverage_check" not in recorder.order
    assert "stage_supplement" not in recorder.order
    assert "pipeline_v2" not in recorder.stages


def test_context_only_cities_never_become_the_article_structure():
    _state, recorder, llm = _run(quality_scores=[9])

    artifact = recorder.artifacts[0]
    markdown = artifact["markdown"]
    headings = [line for line in markdown.splitlines() if line.startswith("##")]
    assert headings
    assert all("Medellín" not in heading for heading in headings)
    assert all("Buenos Aires" not in heading for heading in headings)
    # The scope rule still travelled with every writing prompt.
    outline_prompt = next(prompt for kind, prompt in llm.prompts if kind == "outline")
    assert "context-only reference may calibrate a fact" in " ".join(
        outline_prompt.split()
    )


def test_a_low_score_spends_a_repair_pass_and_re_checks_grounding():
    _state, recorder, llm = _run(quality_scores=[5, 9])

    assert recorder.order.count("stage_v3_repair") == 1
    assert recorder.order.count("stage_v3_groundedness") == 2
    assert recorder.order.count("stage_v3_quality_audit") == 2
    repair_prompt = next(prompt for kind, prompt in llm.prompts if kind == "repair")
    assert "you may not change the brief" in " ".join(repair_prompt.split())


def test_a_weak_draft_buys_one_repair_and_then_asks_for_a_human():
    # The auditor never passes this draft. The old loop bought two repairs --
    # each one a rewrite, an anti-AI pass, a grounding re-check and a re-audit
    # -- before giving up on it anyway.
    state, recorder, _llm = _run(quality_scores=[4])

    assert recorder.order.count("stage_v3_repair") == 1
    settle = recorder.stages["stage_v3_quality_settle"]
    assert settle["repair_attempts"] == 1
    assert settle["repair_decision"]["reason"] == "attempt_limit_reached"

    review = state["response_payload"]["quality_review"]
    assert state["response_payload"]["pipeline_status"] == "needs_revision"
    assert review["repair_decision"]["route"] == "settle"
    assert review["repair_decision"]["problems"]


def test_an_expensive_run_stops_before_buying_a_repair():
    llm = ScriptedLLM(
        quality_scores=[4],
        usage_tracker=SpentTokens(total_tokens=P2B_RUN_TOKEN_BUDGET),
    )
    recorder = RecordingRecorder()

    state = run_pipeline_v3(
        "expensive-v3-run",
        prepare_v3_runtime_request(_request()),
        PipelineDependencies(llm=llm, recorder=recorder),
    )

    assert "stage_v3_repair" not in recorder.order
    assert recorder.order.count("stage_v3_quality_audit") == 1
    decision = state["response_payload"]["quality_review"]["repair_decision"]
    assert decision["reason"] == "token_budget_reached"
    assert decision["tokens_spent"] == P2B_RUN_TOKEN_BUDGET
    # The article still comes back -- as the operator's problem, not as a
    # failure and not as something worth another 90,000 tokens.
    assert state["response_payload"]["pipeline_status"] == "needs_revision"
    assert state["response_payload"]["improved_article"]["content"]


def test_the_route_queues_a_run_only_when_research_is_ready(monkeypatch):
    queued: dict[str, Any] = {}

    class FakeRecorder:
        def queue(self, run_id: str, _user_id) -> None:
            queued["run_id"] = run_id

        def record_stage(self, _run_id: str, stage: str, payload: dict) -> None:
            queued[stage] = payload

    monkeypatch.setattr(runs_api, "RunRecorder", FakeRecorder)
    monkeypatch.setattr(runs_api, "_prompt2blog_credential_for_run", lambda: None)
    background = BackgroundTasks()

    payload = response_payload(
        prompt2blog_routes.start_pipeline_v3(_request(), background, None)
    )

    assert payload["status"] == "queued"
    assert payload["run_id"] == queued["run_id"]
    assert queued["pipeline_input_v3"]["form_id"] == "analysis"
    assert len(background.tasks) == 1


def test_the_route_binds_the_article_credential_before_queueing(monkeypatch):
    from app.features.claude_connection.prompt2blog_credential import (
        Prompt2BlogCredential,
    )

    credential = Prompt2BlogCredential(
        label="Article account",
        token="sk-ant-oat01-PROMPT2BLOG-ONLY",
        updated_at="2026-08-28T12:00:00+00:00",
    )

    class FakeRecorder:
        def queue(self, _run_id: str, _user_id) -> None:
            return None

        def record_stage(self, _run_id: str, _stage: str, _payload: dict) -> None:
            return None

    monkeypatch.setattr(runs_api, "RunRecorder", FakeRecorder)
    monkeypatch.setattr(
        runs_api,
        "_prompt2blog_credential_for_run",
        lambda: credential,
        raising=False,
    )
    background = BackgroundTasks()

    response_payload(
        prompt2blog_routes.start_pipeline_v3(_request(), background, None)
    )

    assert background.tasks[0].args[-1] is credential
    assert credential.token not in repr(background.tasks[0])


def test_the_background_run_keeps_the_bound_credential_for_its_whole_run(monkeypatch):
    from app.features.claude_connection.prompt2blog_credential import (
        Prompt2BlogCredential,
    )

    credential = Prompt2BlogCredential(
        label="Article account",
        token="sk-ant-oat01-PROMPT2BLOG-ONLY",
        updated_at="2026-08-28T12:00:00+00:00",
    )
    events = []

    @contextmanager
    def fake_scope(token: str):
        events.append(("enter", token))
        try:
            yield
        finally:
            events.append(("exit", token))

    monkeypatch.setattr(runs_api, "prompt2blog_credential_scope", fake_scope)
    monkeypatch.setattr(
        runs_api,
        "run_pipeline_v3",
        lambda _run_id, _request: events.append(("run", credential.token)),
    )

    runs_api._run_pipeline_v3_background(
        "run-id",
        prepare_v3_runtime_request(_request()),
        credential,
    )

    assert events == [
        ("enter", credential.token),
        ("run", credential.token),
        ("exit", credential.token),
    ]


def test_the_route_returns_needs_research_without_queueing_anything(monkeypatch):
    def fail_if_used(*_args, **_kwargs):
        raise AssertionError("needs_research must not create a run")

    monkeypatch.setattr(runs_api, "RunRecorder", fail_if_used)
    background = BackgroundTasks()

    payload = response_payload(
        prompt2blog_routes.start_pipeline_v3( _request(evidence_package=_fixture()["evidence_package"]), background, None, )
    )

    assert payload["status"] == "needs_research"
    assert "run_id" not in payload
    assert background.tasks == []


def test_editorial_augmentation_is_refused_rather_than_silently_ignored():
    with pytest.raises(HTTPException) as excinfo:
        prompt2blog_routes.start_pipeline_v3( _request(enable_editorial_augmentation=True), BackgroundTasks(), None, )

    assert excinfo.value.status_code == 400
    assert "not available on the v3 pipeline" in str(excinfo.value.detail)


def test_the_default_recorder_is_untouched_by_the_v3_entrypoint():
    # The v3 orchestrator must keep using the one adapter that writes runs.
    assert isinstance(PipelineDependencies().recorder, RunRecorder)
    assert uuid4()


# --- the seed is the title (ADR 0034) --------------------------------------


def test_no_stage_writes_a_headline():
    """The guard that keeps the deleted stage deleted.

    `invoke_text` was the title stage's call and the only one in the graph.
    A double that raises on it turns "somebody put a headline writer back"
    into a failing test rather than a surprise on the next real run.
    """

    class TextIsForbidden(ScriptedLLM):
        def invoke_text(self, **_kwargs):
            raise AssertionError("no stage in the v3 graph may write a headline")

    llm = TextIsForbidden(quality_scores=[9])
    state = run_pipeline_v3(
        "lima-no-headline",
        prepare_v3_runtime_request(_request()),
        PipelineDependencies(llm=llm, recorder=RecordingRecorder()),
    )

    assert state["completed"] is True


def test_the_operators_line_reaches_the_finished_article():
    """Not just the state: the markdown and the stored payload carry it."""
    state, recorder, _llm = _run(quality_scores=[9])
    seed = _fixture()["brief"]["seed"]

    assert state["final_title"] == seed
    assert state["final_markdown"].startswith(f"# {seed}")
    assert recorder.stages["pipeline_v3"]["improved_article"]["title"] == seed


def test_the_audit_is_the_last_stage_that_spends_anything():
    """What the resume net now hangs off (ADR 0034).

    Settle and finalize run after it and neither calls a model, so a failure
    for want of an account cannot happen later than the audit. If that stops
    being true the resume suite is simulating the wrong failure.
    """
    _state, recorder, llm = _run(quality_scores=[9])

    paid = {stage for stage, _prompt in llm.prompts}
    after_audit = recorder.order[recorder.order.index("stage_v3_quality_audit") + 1 :]

    assert after_audit == ["stage_v3_quality_settle", "stage_v3_finalize"]
    assert paid.isdisjoint({"quality_settle", "finalize"})
