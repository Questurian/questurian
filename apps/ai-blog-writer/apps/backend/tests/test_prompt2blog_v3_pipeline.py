"""The Lima regression through the whole mocked v3 graph."""

from __future__ import annotations

import asyncio
import json
from copy import deepcopy
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from fastapi import BackgroundTasks, HTTPException

import app.features.prompt2blog.api.runs as runs_api
import app.features.prompt2blog.routes as prompt2blog_routes
from app.features.prompt2blog.contracts_v3 import Prompt2BlogV3Request
from app.features.prompt2blog.dependencies import PipelineDependencies
from app.features.prompt2blog.intake_v3 import prepare_v3_runtime_request
from app.features.prompt2blog.orchestrator_v3 import run_pipeline_v3
from app.features.prompt2blog.run_recorder import RunRecorder
from tests.prompt2blog_test_support import response_payload

FIXTURE_PATH = (
    Path(__file__).parents[3]
    / "data"
    / "fixtures"
    / "prompt2blog"
    / "lima-scope-drift-v3.json"
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


def _request(**overrides) -> Prompt2BlogV3Request:
    payload = {
        "schema_version": 3,
        "commission": _fixture()["commission"],
        "evidence_package": _supported_evidence(),
        "profiles": {
            "tone_id": "editorial",
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
    return Prompt2BlogV3Request.model_validate(payload)


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
    "commission_alignment": "Answers the cost question about Lima itself.",
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
    "commission_alignment_summary": "Answers the cost question about Lima.",
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
class ScriptedLLM:
    quality_scores: list[int]
    prompts: list[tuple[str, str]] = field(default_factory=list)
    grounded: bool = True

    def invoke_json(self, *, prompt: str, **_kwargs) -> tuple[dict[str, Any], str]:
        if "planning an article before it is written" in prompt:
            self.prompts.append(("outline", prompt))
            return OUTLINE, json.dumps(OUTLINE)
        if "fact-grounding checker" in prompt:
            self.prompts.append(("groundedness", prompt))
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
            return DRAFT, json.dumps(DRAFT)
        self.prompts.append(("compose", prompt))
        return DRAFT, json.dumps(DRAFT)

    def invoke_text(self, *, prompt: str, **_kwargs) -> str:
        self.prompts.append(("title", prompt))
        return "Is Lima still worth a long stay?"

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


def test_the_lima_commission_runs_end_to_end_through_the_v3_graph():
    state, recorder, _llm = _run(quality_scores=[9])

    assert state["completed"] is True
    assert recorder.order == [
        "stage_v3_outline",
        "stage_v3_compose",
        "stage_v3_groundedness",
        "stage_v3_quality_audit",
        "stage_v3_quality_settle",
        "stage_v3_title",
        "stage_v3_finalize",
    ]
    payload = recorder.stages["pipeline_v3"]
    assert payload["pipeline_status"] == "ready_for_staging"
    assert payload["form"]["id"] == "analysis"
    assert payload["commission"]["primary_subject"] == "Lima"
    assert payload["evidence_receipt"]["requirement_status"] == {
        "r1": "supported",
        "r2": "supported",
        "r3": "supported",
    }
    assert state["final_title"] == "Is Lima still worth a long stay?"


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
    assert "you may not change the commission" in " ".join(repair_prompt.split())


def test_the_route_queues_a_run_only_when_research_is_ready(monkeypatch):
    queued: dict[str, Any] = {}

    class FakeRecorder:
        def queue(self, run_id: str, _user_id) -> None:
            queued["run_id"] = run_id

        def record_stage(self, _run_id: str, stage: str, payload: dict) -> None:
            queued[stage] = payload

    monkeypatch.setattr(runs_api, "RunRecorder", FakeRecorder)
    background = BackgroundTasks()

    payload = response_payload(
        asyncio.run(prompt2blog_routes.start_pipeline_v3(_request(), background, None))
    )

    assert payload["status"] == "queued"
    assert payload["run_id"] == queued["run_id"]
    assert queued["pipeline_input_v3"]["form_id"] == "analysis"
    assert len(background.tasks) == 1


def test_the_route_returns_needs_research_without_queueing_anything(monkeypatch):
    def fail_if_used(*_args, **_kwargs):
        raise AssertionError("needs_research must not create a run")

    monkeypatch.setattr(runs_api, "RunRecorder", fail_if_used)
    background = BackgroundTasks()

    payload = response_payload(
        asyncio.run(
            prompt2blog_routes.start_pipeline_v3(
                _request(evidence_package=_fixture()["evidence_package"]),
                background,
                None,
            )
        )
    )

    assert payload["status"] == "needs_research"
    assert "run_id" not in payload
    assert background.tasks == []


def test_editorial_augmentation_is_refused_rather_than_silently_ignored():
    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(
            prompt2blog_routes.start_pipeline_v3(
                _request(enable_editorial_augmentation=True),
                BackgroundTasks(),
                None,
            )
        )

    assert excinfo.value.status_code == 400
    assert "not available on the v3 pipeline" in str(excinfo.value.detail)


def test_the_default_recorder_is_untouched_by_the_v3_entrypoint():
    # The v3 orchestrator must keep using the one adapter that writes runs.
    assert isinstance(PipelineDependencies().recorder, RunRecorder)
    assert uuid4()
