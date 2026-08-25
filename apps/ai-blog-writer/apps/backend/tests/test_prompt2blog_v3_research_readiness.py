"""The v3 research gate: insufficient evidence stops before any writing."""

from __future__ import annotations

import asyncio
import json
from copy import deepcopy
from pathlib import Path

import app.features.prompt2blog.llm as prompt2blog_llm
from app.features.prompt2blog.graph.state import Prompt2BlogV3GraphState
import app.features.prompt2blog.routes as prompt2blog_routes
from app.features.prompt2blog.contracts_v3 import Prompt2BlogV3Request
from app.features.prompt2blog.evidence_v3 import normalize_evidence
from app.features.prompt2blog.research_readiness_v3 import (
    assess_research_readiness,
    build_follow_up_research_prompt,
)
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


def _payload(commission: dict | None = None, evidence: dict | None = None) -> dict:
    fixture = _fixture()
    return {
        "schema_version": 3,
        "commission": commission or fixture["commission"],
        "evidence_package": evidence or fixture["evidence_package"],
        "profiles": {
            "tone_id": "editorial",
            "length_id": "medium",
            "creativity_level": "medium",
        },
    }


def _request(**kwargs) -> Prompt2BlogV3Request:
    return Prompt2BlogV3Request.model_validate(_payload(**kwargs))


def _assess(request: Prompt2BlogV3Request):
    evidence = normalize_evidence(request.commission, request.evidence_package)
    return evidence, assess_research_readiness(request.commission, evidence)


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


def test_incomplete_research_is_not_ready_and_names_every_gap():
    evidence, readiness = _assess(_request())

    assert readiness.status == "needs_research"
    assert readiness.unresolved_requirement_ids == ["r2", "r3"]
    assert [finding.requirement_ids for finding in readiness.findings] == [
        ["r2"],
        ["r3"],
    ]
    assert all(finding.code == "requirement_gap" for finding in readiness.findings)
    assert evidence.requirements[0].status == "supported"


def test_fully_supported_research_is_ready():
    _evidence, readiness = _assess(_request(evidence=_supported_evidence()))

    assert readiness.status == "ready"
    assert readiness.findings == []
    assert readiness.missing_source_requirements == []


def test_an_unresolved_conflict_blocks_a_fully_supported_package():
    evidence = _supported_evidence()
    evidence["conflicts"] = [
        {
            "conflict_id": "x1",
            "claim_ids": ["c1", "c2"],
            "summary": "Two cost baselines disagree.",
            "resolution": None,
        }
    ]

    _normalized, readiness = _assess(_request(evidence=evidence))

    assert readiness.status == "needs_research"
    conflict = next(
        finding
        for finding in readiness.findings
        if finding.code == "unresolved_conflict"
    )
    assert conflict.requirement_ids == ["r1", "r2"]
    assert readiness.unresolved_conflict_ids == ["x1"]


def test_a_source_gated_form_blocks_evidence_without_matching_material():
    commission = deepcopy(_fixture()["commission"])
    commission["form_id"] = "interview-qa"

    _normalized, readiness = _assess(
        _request(commission=commission, evidence=_supported_evidence())
    )

    assert readiness.missing_source_requirements == ["attributable-responses"]
    gate = next(
        finding for finding in readiness.findings if finding.code == "source_gate"
    )
    assert "attributable-responses" in gate.message


def test_the_follow_up_prompt_targets_only_unresolved_work():
    request = _request()
    evidence, readiness = _assess(request)

    prompt = build_follow_up_research_prompt(request.commission, evidence, readiness)

    assert "Do not redo or weaken already supported work" in prompt
    assert "Do not add a comparator" in prompt
    assert request.commission.commission_fingerprint in prompt
    assert "- r2 — " in prompt
    assert "- r3 — " in prompt
    assert "- r1 — " not in prompt


def test_intake_terminates_as_needs_research_without_calling_a_model(monkeypatch):
    def fail_on_model_call(*_args, **_kwargs):
        raise AssertionError("needs_research must not spend a writer-model call")

    for attribute in dir(prompt2blog_llm):
        if attribute.startswith("_"):
            continue
        if callable(getattr(prompt2blog_llm, attribute)):
            monkeypatch.setattr(
                prompt2blog_llm, attribute, fail_on_model_call, raising=False
            )

    payload = response_payload(
        asyncio.run(prompt2blog_routes.prepare_pipeline_v3(_request()))
    )

    assert payload["status"] == "needs_research"
    assert payload["message"] == "Prompt2Blog v3 commission needs more research"
    assert "run_input" not in payload
    assert [item["requirement_id"] for item in payload["unresolved_requirements"]] == [
        "r2",
        "r3",
    ]
    assert payload["unresolved_requirements"][0]["question"]
    assert payload["unresolved_requirements"][0]["gap"]
    assert "Return a complete replacement evidence package" in (
        payload["follow_up_research_prompt"]
    )


def test_ready_research_reaches_run_input_instead_of_the_gate():
    payload = response_payload(
        asyncio.run(
            prompt2blog_routes.prepare_pipeline_v3(
                _request(evidence=_supported_evidence())
            )
        )
    )

    assert payload["status"] == "ready"
    assert payload["run_input"]["form_id"] == "analysis"
    assert "follow_up_research_prompt" not in payload


def test_v3_has_no_supplemental_fact_surface():
    # v2 closes coverage gaps by generating supplemental content. v3 reports
    # the gap instead, so the state has nowhere to put invented facts.
    assert "supplemental_content" not in Prompt2BlogV3GraphState.__annotations__
    assert "coverage" not in Prompt2BlogV3GraphState.__annotations__
    assert "readiness" in Prompt2BlogV3GraphState.__annotations__
