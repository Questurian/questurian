"""The v3 research gate: insufficient evidence stops before any writing."""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path

import app.features.prompt2blog.llm as prompt2blog_llm
from app.features.prompt2blog.graph.state import Prompt2BlogV3GraphState
from app.features.prompt2blog.contracts_v3 import Prompt2BlogV3Request
from app.features.prompt2blog.evidence_v3 import normalize_evidence
from app.features.prompt2blog.intake_v3 import v3_intake_result
from app.features.prompt2blog.research_readiness_v3 import (
    assess_research_readiness,
    build_follow_up_research_prompt,
    PREMISE_CHECK_RULES,
    REQUIREMENT_STATUS_RULES,
)

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


def test_the_follow_up_prompt_separates_requirement_status_from_claim_confidence():
    """An unreachable primary source is a confidence reservation, not a gap.

    Conflating the two is what held a real run's requirement at ``partial``
    across three research rounds while several independent sources agreed on
    the answer, so the prompt has to draw the line explicitly.
    """
    request = _request()
    evidence, readiness = _assess(request)

    prompt = build_follow_up_research_prompt(request.commission, evidence, readiness)

    assert REQUIREMENT_STATUS_RULES in prompt
    assert "status describes the QUESTION" in prompt
    assert "confidence describes the ANSWER" in prompt
    assert "the publisher blocks automated retrieval" in prompt
    assert "Never downgrade the requirement to partial for it." in prompt
    assert "Use partial or missing honestly" not in prompt


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

    payload = v3_intake_result(_request())

    assert payload["status"] == "needs_research"
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
    payload = v3_intake_result(_request(evidence=_supported_evidence()))

    assert payload["status"] == "ready"
    assert payload["run_input"]["form_id"] == "analysis"
    assert "follow_up_research_prompt" not in payload


def test_v3_has_no_supplemental_fact_surface():
    # v2 closes coverage gaps by generating supplemental content. v3 reports
    # the gap instead, so the state has nowhere to put invented facts.
    assert "supplemental_content" not in Prompt2BlogV3GraphState.__annotations__
    assert "coverage" not in Prompt2BlogV3GraphState.__annotations__
    assert "readiness" in Prompt2BlogV3GraphState.__annotations__


def _unpublished_evidence() -> dict:
    """One question nobody has ever published an answer to.

    The real case: OSITRAN publishes Lima immigration and baggage minutes and
    measures no other step, so the customs figure exists nowhere for either
    terminal. Before `unpublished` this could only be reported as `partial`,
    which blocked the run and sent the operator back to ask again.
    """
    evidence = _supported_evidence()
    # c3 answered r3; this question is the one nobody publishes, so the only
    # claim left on it records what the sources say they do not measure.
    evidence["claims"] = [
        claim for claim in evidence["claims"] if claim["claim_id"] != "c3"
    ]
    evidence["claims"].append(
        {
            "claim_id": "c4",
            "text": (
                "The regulator's December 2025 measurement covers immigration and "
                "baggage delivery and no other passenger step."
            ),
            "source_ids": ["s1"],
            "requirement_ids": ["r3"],
            "as_of": "2025-12-01",
            "confidence": "high",
        }
    )
    evidence["requirements"][2] = {
        "requirement_id": "r3",
        "status": "unpublished",
        "claim_ids": ["c4"],
        "gap": (
            "Checked the regulator's December 2025 report, the operator's 2025 "
            "service statistics, and the customs authority's published releases. "
            "None of them measures this step, for either terminal."
        ),
    }
    return evidence


def test_an_unpublished_question_does_not_block_the_run():
    evidence, readiness = _assess(_request(evidence=_unpublished_evidence()))

    assert readiness.status == "ready"
    assert readiness.findings == []
    assert readiness.unresolved_requirement_ids == []
    assert readiness.unpublished_requirement_ids == ["r3"]
    assert evidence.receipt()["unpublished_requirement_ids"] == ["r3"]


def test_an_unpublished_question_reaches_the_writer_as_a_gap_to_write_around():
    evidence, _readiness = _assess(_request(evidence=_unpublished_evidence()))

    records = evidence.records_text
    assert "write around it and never mention the absence" in records
    assert "None of them measures this step" in records


def test_a_follow_up_never_re_asks_an_unpublished_question():
    evidence_package = _unpublished_evidence()
    # A still-open question keeps the run blocked, and a reported gap names the
    # unpublished one as well — the exact shape that used to drag it back into
    # the prompt round after round.
    evidence_package["requirements"][1] = {
        "requirement_id": "r2",
        "status": "partial",
        "claim_ids": ["c2"],
        "gap": "The second half of this question is still unanswered.",
    }
    evidence_package["gaps"] = [
        {
            "gap_id": "g1",
            "requirement_ids": ["r2", "r3"],
            "summary": "Outstanding research.",
        }
    ]
    request = _request(evidence=evidence_package)
    evidence, readiness = _assess(request)

    assert readiness.status == "needs_research"
    assert readiness.unresolved_requirement_ids == ["r2"]

    prompt = build_follow_up_research_prompt(request.commission, evidence, readiness)
    unresolved_block = prompt.split("UNRESOLVED REQUIREMENTS ONLY")[1].split(
        "ALREADY ESTABLISHED AS UNPUBLISHED"
    )[0]
    assert "r2" in unresolved_block
    assert "r3" not in unresolved_block
    assert "Do not search them again" in prompt
    assert "None of them measures this step" in prompt


def test_a_package_with_nothing_answered_still_blocks():
    # The escape hatch a lazy research desk would otherwise have: declare every
    # question unpublished and the gate opens on an article with no facts.
    evidence_package = _supported_evidence()
    evidence_package["requirements"] = [
        {
            "requirement_id": requirement["requirement_id"],
            "status": "unpublished",
            "claim_ids": [],
            "gap": "Checked every authority that could publish this.",
        }
        for requirement in evidence_package["requirements"]
    ]
    evidence_package["claims"] = []
    evidence_package["conflicts"] = []

    _evidence, readiness = _assess(_request(evidence=evidence_package))

    assert readiness.status == "needs_research"
    assert [finding.code for finding in readiness.findings] == ["nothing_answered"]


def test_the_status_rules_define_the_unpublished_verdict():
    assert "unpublished means you searched" in REQUIREMENT_STATUS_RULES
    assert "only after real searching" in REQUIREMENT_STATUS_RULES


def _lima_ranking_commission() -> dict:
    """The commission shape that produced the dead end, in miniature.

    Every question rests on one premise, and the premise is a ranking whose
    reveal is still months away.
    """
    commission = deepcopy(_fixture()["commission"])
    commission["premise"] = [
        {
            "assumption_id": "a1",
            "statement": "The 2026 Latin America's 50 Best Restaurants list has been published.",
        }
    ]
    for requirement in commission["requirements"]:
        requirement["assumption_ids"] = ["a1"]
    return commission


def _refuted_evidence(verdict: str = "refuted") -> dict:
    evidence = deepcopy(_fixture()["evidence_package"])
    evidence["requirements"] = [
        {
            "requirement_id": requirement["requirement_id"],
            "status": "missing",
            "claim_ids": [],
            "gap": "The premise this question rests on turned out to be false.",
        }
        for requirement in _fixture()["commission"]["requirements"]
    ]
    evidence["claims"] = []
    evidence["gaps"] = []
    evidence["premise_findings"] = [
        {
            "assumption_id": "a1",
            "verdict": verdict,
            "basis": "The organizers schedule the reveal for 1 December 2026.",
            "claim_ids": [],
        }
    ]
    return evidence


def test_a_refuted_premise_blocks_the_run_and_names_itself_as_the_cause():
    _evidence, readiness = _assess(
        _request(commission=_lima_ranking_commission(), evidence=_refuted_evidence())
    )

    assert readiness.status == "needs_research"
    assert readiness.refuted_assumption_ids == ["a1"]
    premise_findings = [
        finding for finding in readiness.findings if finding.code == "premise_refuted"
    ]
    assert len(premise_findings) == 1
    assert "that is not so" in premise_findings[0].message
    assert "1 December 2026" in premise_findings[0].message


def test_questions_killed_by_a_refuted_premise_are_not_reported_separately():
    """The original run showed five identical complaints and never the cause."""
    _evidence, readiness = _assess(
        _request(commission=_lima_ranking_commission(), evidence=_refuted_evidence())
    )

    codes = [finding.code for finding in readiness.findings]

    assert codes == ["premise_refuted"]
    assert "requirement_gap" not in codes
    assert "nothing_answered" not in codes


def test_a_refuted_premise_sends_the_operator_to_a_new_direction():
    _evidence, readiness = _assess(
        _request(commission=_lima_ranking_commission(), evidence=_refuted_evidence())
    )

    assert readiness.requires_new_direction is True


def test_an_unverified_premise_blocks_but_stays_worth_asking_again():
    request = _request(
        commission=_lima_ranking_commission(),
        evidence=_refuted_evidence(verdict="unverified"),
    )
    evidence, readiness = _assess(request)

    assert readiness.status == "needs_research"
    assert readiness.unverified_assumption_ids == ["a1"]
    assert readiness.requires_new_direction is False

    prompt = build_follow_up_research_prompt(request.commission, evidence, readiness)

    assert "STILL UNSETTLED PREMISE" in prompt
    assert "a1 — The 2026 Latin America's 50 Best Restaurants list" in prompt


def test_the_follow_up_prompt_never_re_asks_a_question_a_refutation_killed():
    request = _request(
        commission=_lima_ranking_commission(), evidence=_refuted_evidence()
    )
    evidence, readiness = _assess(request)

    prompt = build_follow_up_research_prompt(request.commission, evidence, readiness)

    assert "SETTLED AS FALSE — DO NOT RESEARCH" in prompt
    assert "1 December 2026" in prompt
    for requirement in request.commission.requirements:
        assert f"- {requirement.requirement_id} — {requirement.question}" not in prompt


def test_a_confirmed_premise_leaves_readiness_exactly_as_it_was():
    commission = _lima_ranking_commission()
    evidence = _supported_evidence()
    evidence["premise_findings"] = [
        {
            "assumption_id": "a1",
            "verdict": "confirmed",
            "basis": "The organizers published the list on 2 December 2025.",
            "claim_ids": ["c1"],
        }
    ]

    _evidence, readiness = _assess(_request(commission=commission, evidence=evidence))

    assert readiness.status == "ready"
    assert readiness.findings == []
    assert readiness.requires_new_direction is False


def test_the_premise_verdict_reaches_the_writer_records_and_the_receipt():
    request = _request(
        commission=_lima_ranking_commission(),
        evidence=_refuted_evidence(verdict="confirmed"),
    )
    evidence = normalize_evidence(request.commission, request.evidence_package)

    assert "WHAT THE COMMISSION ASSUMED, AND WHAT RESEARCH FOUND" in evidence.records_text
    assert "verdict: confirmed" in evidence.records_text
    assert evidence.receipt()["premise_verdicts"] == {"a1": "confirmed"}


def test_the_shared_premise_rules_travel_with_both_research_prompts():
    request = _request(
        commission=_lima_ranking_commission(),
        evidence=_refuted_evidence(verdict="unverified"),
    )
    evidence, readiness = _assess(request)

    prompt = build_follow_up_research_prompt(request.commission, evidence, readiness)

    assert PREMISE_CHECK_RULES in prompt
    assert "does not exist yet" in REQUIREMENT_STATUS_RULES
