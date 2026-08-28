"""V3 outline and compose: commission-first planning, evidence-only prose."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pytest

from app.features.prompt2blog.content.outline_v3 import (
    format_v3_outline_for_prompt,
    sanitize_v3_outline,
    validate_v3_outline,
)
from app.features.prompt2blog.contracts_v3 import Prompt2BlogV3Request
from app.features.prompt2blog.dependencies import PipelineDependencies
from app.features.prompt2blog.intake_v3 import prepare_v3_runtime_request
from app.features.prompt2blog.stages.v3.compose import run_v3_compose_stage
from app.features.prompt2blog.stages.v3.outline import run_v3_outline_stage

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
    evidence = json.loads(json.dumps(_fixture()["evidence_package"]))
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


def _runtime():
    request = Prompt2BlogV3Request.model_validate(
        {
            "schema_version": 3,
            "commission": _fixture()["commission"],
            "evidence_package": _supported_evidence(),
            "profiles": {
                "tone_id": "editorial",
                "length_id": "medium",
                "creativity_level": "medium",
            },
        }
    )
    return prepare_v3_runtime_request(request)


def _state(**overrides) -> dict[str, Any]:
    runtime = _runtime()
    state: dict[str, Any] = {
        "run_id": "v3-run",
        "commission": runtime.commission,
        "evidence": runtime.evidence,
        "instructions": runtime.instructions,
        "stage_contexts": runtime.instructions["stage_contexts"],
        "option_context": runtime.option_context,
        "writing_model": "test-writer",
        "model_name": "test-model",
        "compose_temperature": 0.4,
        "include_debug": True,
        "trace": [],
        "outline_text": "",
    }
    state.update(overrides)
    return state


@dataclass
class FakeRecorder:
    started: list[str] = field(default_factory=list)
    recorded: list[tuple[str, dict[str, Any]]] = field(default_factory=list)

    def start_stage(self, _run_id: str, stage: str) -> None:
        self.started.append(stage)

    def record_stage(self, _run_id: str, stage: str, payload: dict[str, Any]) -> None:
        self.recorded.append((stage, payload))


@dataclass
class FakeLLM:
    json_response: dict[str, Any] = field(default_factory=dict)
    prompts: list[str] = field(default_factory=list)

    def invoke_json(self, *, prompt: str, **_kwargs) -> tuple[dict[str, Any], str]:
        self.prompts.append(prompt)
        return self.json_response, json.dumps(self.json_response)

    def invoke_text(self, *, prompt: str, **_kwargs) -> str:
        self.prompts.append(prompt)
        return ""

    def enforce_anti_ai(self, text: str, **_kwargs) -> str:
        return text


def _dependencies(llm: FakeLLM) -> tuple[PipelineDependencies, FakeRecorder]:
    recorder = FakeRecorder()
    return PipelineDependencies(llm=llm, recorder=recorder), recorder


def _outline_payload(**overrides) -> dict[str, Any]:
    payload = {
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
                "purpose": "Show the practical tradeoffs a resident meets.",
                "claim_ids": ["c2"],
                "requirement_ids": ["r2"],
                "target_words": 300,
            },
            {
                "heading": "How the picture changed",
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
    payload.update(overrides)
    return payload


def _validate(payload: dict[str, Any], target_word_count: int = 900):
    runtime = _runtime()
    return validate_v3_outline(
        sanitize_v3_outline(payload),
        commission=runtime.commission,
        claim_ids={claim["claim_id"] for claim in runtime.evidence["claims"]},
        requirement_ids={
            item["requirement_id"] for item in runtime.evidence["requirements"]
        },
        target_word_count=target_word_count,
    )


@pytest.mark.parametrize("subject_mention", ["Medellín", "MEDELLIN"])
def test_city_only_outline_wording_covers_city_country_primary_subject(
    subject_mention: str,
):
    runtime = _runtime()
    commission = json.loads(json.dumps(runtime.commission))
    commission["primary_subject"] = "Medellín, Colombia"
    commission["scope"]["references"] = []
    payload = _outline_payload()
    payload["sections"][0]["heading"] = f"What {subject_mention} costs now"
    payload["sections"][0]["purpose"] = (
        f"Establish the current cost baseline for {subject_mention}."
    )

    accepted, diagnostics = validate_v3_outline(
        sanitize_v3_outline(payload),
        commission=commission,
        claim_ids={claim["claim_id"] for claim in runtime.evidence["claims"]},
        requirement_ids={
            item["requirement_id"] for item in runtime.evidence["requirements"]
        },
        target_word_count=900,
    )

    assert accepted is True
    assert diagnostics["covers_primary_subject"] is True


def test_unrelated_city_does_not_cover_city_country_primary_subject():
    runtime = _runtime()
    commission = json.loads(json.dumps(runtime.commission))
    commission["primary_subject"] = "Medellín, Colombia"
    commission["scope"]["references"] = []

    accepted, diagnostics = validate_v3_outline(
        sanitize_v3_outline(_outline_payload()),
        commission=commission,
        claim_ids={claim["claim_id"] for claim in runtime.evidence["claims"]},
        requirement_ids={
            item["requirement_id"] for item in runtime.evidence["requirements"]
        },
        target_word_count=900,
    )

    assert accepted is False
    assert diagnostics["covers_primary_subject"] is False


def test_a_context_only_place_cannot_organize_a_section():
    drifted = _outline_payload()
    drifted["sections"][2]["heading"] = "How Medellín compares"

    accepted, diagnostics = _validate(drifted)

    assert accepted is False
    assert diagnostics["no_context_only_sections"] is False
    assert diagnostics["context_only_headings"] == ["How Medellín compares"]


def test_a_plan_cannot_cite_a_claim_the_evidence_does_not_contain():
    invented = _outline_payload()
    invented["sections"][0]["claim_ids"] = ["c99"]

    accepted, diagnostics = _validate(invented)

    assert accepted is False
    assert diagnostics["unknown_claim_ids"] == ["c99"]


def test_a_plan_must_still_be_about_the_primary_subject():
    drifted = json.loads(json.dumps(_outline_payload()).replace("Lima", "Quito"))

    accepted, diagnostics = _validate(drifted)

    assert accepted is False
    assert diagnostics["covers_primary_subject"] is False


def test_sections_may_carry_the_subject_implicitly_when_the_framing_names_it():
    """A strong plan names the subject once, then uses subject-specific detail.

    Rejecting this shape discarded an otherwise valid Medellin plan whose seven
    sections named districts and museums but never repeated the city.
    """
    implicit = _outline_payload()
    for section in implicit["sections"]:
        section["heading"] = section["heading"].replace("Lima", "the city")
        section["purpose"] = section["purpose"].replace("Lima", "the city")

    accepted, diagnostics = _validate(implicit)

    assert accepted is True
    assert diagnostics["covers_primary_subject"] is True


def test_a_commission_aligned_plan_is_accepted_and_rendered_for_compose():
    accepted, diagnostics = _validate(_outline_payload())

    assert accepted is True
    assert diagnostics["unknown_requirement_ids"] == []

    rendered = format_v3_outline_for_prompt(sanitize_v3_outline(_outline_payload()))
    assert "Evidence claims: c1" in rendered
    assert "Requirements served: r1" in rendered


def test_the_outline_stage_keeps_a_drifted_plan_out_of_compose():
    drifted = _outline_payload()
    drifted["sections"][2]["heading"] = "How Medellín compares"
    llm = FakeLLM(json_response=drifted)
    dependencies, recorder = _dependencies(llm)

    updates = run_v3_outline_stage(_state(), dependencies)

    assert updates["outline_accepted"] is False
    assert updates["outline"]["sections"] == []
    assert recorder.recorded[0][0] == "stage_v3_outline"
    assert recorder.recorded[0][1]["checks"]["no_context_only_sections"] is False

    compose_llm = FakeLLM(
        json_response={
            "improved_title": "What Lima costs now",
            "improved_content": "## Lima now\n\nBody.",
        }
    )
    compose_dependencies, _compose_recorder = _dependencies(compose_llm)
    run_v3_compose_stage(
        _state(
            outline_text=updates["outline_text"],
            outline_accepted=updates["outline_accepted"],
        ),
        compose_dependencies,
    )

    compose_prompt = compose_llm.prompts[0]
    assert "No outline was produced." in compose_prompt
    assert "How Medellín compares" not in compose_prompt


def test_the_outline_prompt_gets_planning_context_not_the_whole_stack():
    llm = FakeLLM(json_response=_outline_payload())
    dependencies, _recorder = _dependencies(llm)

    run_v3_outline_stage(_state(), dependencies)

    prompt = llm.prompts[0]
    assert "OUTLINE AUTHORITY" in prompt
    assert "CLAIM INDEX" in prompt
    assert "APPROVED COMMISSION" in prompt
    assert "## Allowed structures" in prompt
    assert "Instituto Nacional de Estadística e Informática" not in prompt
    assert "HOUSE STYLE" not in prompt
    assert "Prompt2Blog headline standard" not in prompt
    assert "Plan the structure only" in prompt
    assert len(prompt) < 15_000


def test_compose_writes_from_evidence_records_and_never_from_source_prose():
    llm = FakeLLM(
        json_response={
            "improved_title": "What Lima costs now",
            "improved_content": "## What Lima costs now\n\nBody.",
            "commission_alignment_summary": "Answers the cost question.",
            "improvements_applied": [],
            "remaining_gaps": [],
        }
    )
    dependencies, recorder = _dependencies(llm)
    state = _state(
        outline_text=format_v3_outline_for_prompt(
            sanitize_v3_outline(_outline_payload())
        ),
        outline_accepted=True,
    )

    updates = run_v3_compose_stage(state, dependencies)

    prompt = llm.prompts[0]
    normalized_prompt = " ".join(prompt.split())
    assert "CLEANED SOURCE MATERIAL" not in prompt
    assert "SUPPLEMENTAL MATERIAL" not in prompt
    assert "Never invent a bridge fact" in prompt
    assert "Omit unsupported points from reader-facing prose" in normalized_prompt
    assert "`remaining_gaps` as internal metadata only" in normalized_prompt
    assert "unsupported point stays a visible gap" not in prompt
    assert "STYLE DIRECTIVE (REQUIRED)" in prompt
    assert "Instituto Nacional de Estadística e Informática" in prompt
    assert "HOUSE STYLE" in prompt
    section_plan = prompt.split("SECTION PLAN:", 1)[1].split("COMPOSE AUTHORITY", 1)[0]
    assert "Evidence claims: c1" in section_plan
    assert "Requirements served: r1" in section_plan
    assert section_plan.index("What Lima costs now") < section_plan.index(
        "The tradeoffs behind the price"
    )
    assert len(prompt) < 35_000
    assert updates["rewrite"]["improved_title"] == "What Lima costs now"
    assert recorder.recorded[0][0] == "stage_v3_compose"


def test_compose_does_not_fall_back_to_pasting_the_evidence():
    llm = FakeLLM(json_response={"improved_title": "", "improved_content": ""})
    dependencies, _recorder = _dependencies(llm)

    updates = run_v3_compose_stage(_state(), dependencies)

    rewrite = updates["rewrite"]
    assert rewrite["improved_content"] == ""
    assert rewrite["improved_title"] == _fixture()["commission"]["original_title"]
