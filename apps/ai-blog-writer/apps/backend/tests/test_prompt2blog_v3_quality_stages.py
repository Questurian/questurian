"""V3 grounding, audit, repair, and title: evidence-bound and commission-bound."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.features.prompt2blog.contracts_v3 import Prompt2BlogV3Request
from app.features.prompt2blog.dependencies import PipelineDependencies
from app.features.prompt2blog.intake_v3 import prepare_v3_runtime_request
from app.features.prompt2blog.quality_v3 import (
    v3_commission_summary,
    v3_constraint_brief,
)
from app.features.prompt2blog.stages.v3.audit_repair import (
    run_v3_quality_audit_stage,
    run_v3_quality_settle_stage,
    run_v3_repair_stage,
)
from app.features.prompt2blog.stages.v3.groundedness import run_v3_groundedness_stage
from app.features.prompt2blog.stages.v3.title import run_v3_title_stage

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
    return prepare_v3_runtime_request(
        Prompt2BlogV3Request.model_validate(
            {
                "schema_version": 3,
                "commission": _fixture()["commission"],
                "evidence_package": _supported_evidence(),
                "profiles": {
                    "tone_id": "questurian-voice",
                    "length_id": "medium",
                    "creativity_level": "medium",
                },
            }
        )
    )


def _rewrite(title: str = "What Lima costs now") -> dict[str, Any]:
    return {
        "improved_title": title,
        "improved_content": "## What Lima costs now\n\nBody about Lima.",
        "improvements_applied": [],
        "remaining_gaps": [],
    }


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
        "audit_model": "test-auditor",
        "model_name": "test-model",
        "compose_temperature": 0.4,
        "include_debug": True,
        "trace": [],
        "rewrite": _rewrite(),
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
    text_response: str = ""
    prompts: list[str] = field(default_factory=list)

    def invoke_json(self, *, prompt: str, **_kwargs) -> tuple[dict[str, Any], str]:
        self.prompts.append(prompt)
        return self.json_response, json.dumps(self.json_response)

    def invoke_text(self, *, prompt: str, **_kwargs) -> str:
        self.prompts.append(prompt)
        return self.text_response

    def enforce_anti_ai(self, text: str, **_kwargs) -> str:
        return text


def _dependencies(llm: FakeLLM) -> tuple[PipelineDependencies, FakeRecorder]:
    recorder = FakeRecorder()
    return PipelineDependencies(llm=llm, recorder=recorder), recorder


def test_grounding_compares_the_draft_with_the_exact_evidence_records():
    llm = FakeLLM(
        json_response={
            "grounded": False,
            "assessment": "One figure is not in the records.",
            "unsupported_claims": [
                {
                    "claim": "Rent averages 900 dollars.",
                    "reason": "No record states a rent figure.",
                    "severity": "high",
                }
            ],
        }
    )
    dependencies, recorder = _dependencies(llm)

    updates = run_v3_groundedness_stage(_state(), dependencies)

    prompt = llm.prompts[0]
    assert "EVIDENCE RECORDS" in prompt
    assert "Instituto Nacional de Estadística e Informática" in prompt
    assert "retrieved 2026-08-25" in prompt
    assert "Unsupported assertion: delete it" in prompt
    assert "draft already marks as unconfirmed" not in prompt
    assert "CLEANED SOURCE MATERIAL" not in prompt
    assert updates["groundedness"]["grounded"] is False
    assert recorder.recorded[0][0] == "stage_v3_groundedness"


def test_grounding_failure_degrades_to_unchecked_instead_of_failing_the_run():
    class ExplodingLLM(FakeLLM):
        def invoke_json(self, *, prompt: str, **_kwargs):
            self.prompts.append(prompt)
            raise RuntimeError("provider down")

    dependencies, _recorder = _dependencies(ExplodingLLM())

    updates = run_v3_groundedness_stage(_state(), dependencies)

    assert updates["groundedness"]["checked"] is False


def test_the_audit_judges_commission_fidelity_and_keeps_measured_checks():
    llm = FakeLLM(
        json_response={
            "overall_score": 8,
            "constraint_checks": {"audience_match": True, "tone_match": True},
            "required_revisions": ["Answer the core reader question directly."],
            "quality_summary": "Close, needs one fix.",
        }
    )
    dependencies, _recorder = _dependencies(llm)
    state = _state(
        groundedness={
            "checked": True,
            "grounded": True,
            "unsupported_claims": [],
            "high_severity_count": 0,
        }
    )

    updates = run_v3_quality_audit_stage(state, dependencies)

    prompt = llm.prompts[0]
    assert "APPROVED COMMISSION" in prompt
    assert "a context-only reference organizes a section" in prompt
    assert "GROUNDING VERDICT" in prompt
    assert '"grounded": true' in prompt
    assert "Instituto Nacional de Estadística e Informática" not in prompt
    assert "VERIFIED EVIDENCE" not in prompt
    assert "ARTICLE TYPE:" not in prompt
    assert len(prompt) < 25_000
    assert updates["quality_checks"]["claims_grounded"] is True
    assert updates["quality_checks"]["audience_match"] is True
    assert updates["best_rewrite"] == state["rewrite"]


def test_the_audit_receives_unsupported_claim_details_without_the_evidence():
    llm = FakeLLM(
        json_response={
            "overall_score": 5,
            "constraint_checks": {"audience_match": True, "tone_match": True},
            "required_revisions": ["Remove the unsupported rent figure."],
            "quality_summary": "One unsupported decision-critical figure.",
        }
    )
    dependencies, _recorder = _dependencies(llm)

    run_v3_quality_audit_stage(
        _state(
            groundedness={
                "checked": True,
                "grounded": False,
                "unsupported_claims": [
                    {
                        "claim": "Rent averages 900 dollars.",
                        "reason": "No record states a rent figure.",
                        "severity": "high",
                    }
                ],
                "high_severity_count": 1,
            }
        ),
        dependencies,
    )

    prompt = llm.prompts[0]
    assert "Rent averages 900 dollars." in prompt
    assert "No record states a rent figure." in prompt
    assert "Instituto Nacional de Estadística e Informática" not in prompt


def test_repair_is_told_it_may_not_create_facts_or_change_the_commission():
    llm = FakeLLM(
        json_response={
            "improved_title": "What Lima costs now",
            "improved_content": "## What Lima costs now\n\nRepaired body.",
        }
    )
    dependencies, recorder = _dependencies(llm)
    state = _state(
        quality={"required_revisions": ["Tighten the opening."]},
        groundedness={
            "checked": True,
            "grounded": False,
            "high_severity_count": 1,
            "unsupported_claims": [
                {
                    "claim": "Rent averages 900 dollars.",
                    "reason": "No record states a rent figure.",
                    "severity": "high",
                }
            ],
        },
    )

    updates = run_v3_repair_stage(state, dependencies)

    prompt = llm.prompts[0]
    normalized_prompt = " ".join(prompt.split())
    assert "Repair prose and structure only" in prompt
    assert "you may not change the commission" in normalized_prompt
    assert "Never promote a context-only reference" in prompt
    assert "UNSUPPORTED CLAIMS" in prompt
    assert "Rent averages 900 dollars." in prompt
    assert "Unsupported assertion: delete it" in prompt
    assert "Never hedge it, qualify it, or label it unconfirmed" in normalized_prompt
    assert "`remaining_gaps` as internal metadata only" in prompt
    assert "Supported uncertainty: preserve its exact scope" in prompt
    assert "Unpublished fact: omit it silently" in prompt
    assert "explicitly mark as unconfirmed" not in prompt
    assert "state the uncertainty plainly" not in prompt
    assert "VERIFIED EVIDENCE" not in prompt
    assert "Prompt2Blog house rules" not in prompt
    assert recorder.recorded[0][1]["required_revisions"] == ["Tighten the opening."]
    assert recorder.recorded[0][1]["unsupported_claims"][0]["severity"] == "high"
    assert len(prompt) < 20_000
    assert updates["repair_attempts"] == 1


def test_settling_restores_the_best_draft_and_its_own_grounding_verdict():
    best_rewrite = _rewrite("Best Lima title")
    best_quality = {
        "overall_score": 9,
        "groundedness": {"checked": True, "grounded": True},
    }
    dependencies, _recorder = _dependencies(FakeLLM())
    state = _state(
        rewrite=_rewrite("Worse Lima title"),
        quality={"overall_score": 5},
        quality_checks={},
        groundedness={"checked": True, "grounded": False},
        best_rewrite=best_rewrite,
        best_quality=best_quality,
        best_quality_checks={"claims_grounded": True},
    )

    updates = run_v3_quality_settle_stage(state, dependencies)

    assert updates["rewrite"] == best_rewrite
    assert updates["groundedness"]["grounded"] is True


def test_the_title_stage_sees_the_original_title_and_the_headline_standard():
    llm = FakeLLM(text_response="Is Lima still worth the move?")
    dependencies, _recorder = _dependencies(llm)

    updates = run_v3_title_stage(
        _state(
            outline={
                "direct_answer_focus": "Whether Lima still offers value.",
                "takeaway_focus": "Who benefits from the tradeoffs.",
            },
            rewrite={
                **_rewrite(),
                "improved_content": (
                    "## What Lima costs now\n\nBody-only sentence.\n\n"
                    "```markdown\n## Not an article heading\n```\n\n"
                    "## The tradeoffs\n\nMore body-only prose."
                ),
            },
        ),
        dependencies,
    )

    prompt = llm.prompts[0]
    assert _fixture()["commission"]["original_title"] in prompt
    assert "HEADLINE CONTEXT" in prompt
    assert "Prompt2Blog headline standard" in prompt
    assert "Primary subject: Lima" in prompt
    assert "Never headline a context-only reference" in prompt
    assert "Whether Lima still offers value." in prompt
    assert "Who benefits from the tradeoffs." in prompt
    assert "What Lima costs now" in prompt
    assert "The tradeoffs" in prompt
    assert "Not an article heading" not in prompt
    assert "Body-only sentence." not in prompt
    assert "More body-only prose." not in prompt
    assert "FINAL ARTICLE CONTENT" not in prompt
    assert len(prompt) < 12_000
    assert updates["final_title"] == "Is Lima still worth the move?"


def test_the_title_falls_back_to_the_commission_rather_than_to_nothing():
    dependencies, _recorder = _dependencies(FakeLLM(text_response="  "))

    updates = run_v3_title_stage(
        _state(rewrite={**_rewrite(), "improved_title": ""}), dependencies
    )

    assert updates["final_title"] == _fixture()["commission"]["original_title"]


def test_the_v3_constraint_brief_invents_no_seo_requirement():
    runtime = _runtime()

    brief = v3_constraint_brief(runtime.commission, runtime.option_context)

    assert brief["seo"] == {"primary_keyword": "", "secondary_keywords": []}
    assert brief["must_include"] == []
    assert brief["formatting"]["target_word_count"] >= 0
    assert "Primary subject: Lima" in v3_commission_summary(runtime.commission)


def test_the_audit_is_handed_the_measurements_before_it_scores():
    """The Lima food article scored 9/10 while it was a third of its length.

    The deterministic checks were merged into the auditor's answer after it had
    already given one, so it graded a short draft as publishable without ever
    being told it was short. They go in with the prompt now.
    """
    llm = FakeLLM(
        json_response={
            "overall_score": 9,
            "constraint_checks": {"audience_match": True, "tone_match": True},
            "required_revisions": [],
            "quality_summary": "Executes the form cleanly.",
        }
    )
    dependencies, _recorder = _dependencies(llm)

    run_v3_quality_audit_stage(_state(), dependencies)

    prompt = llm.prompts[0]
    assert "MEASURED CHECKS (counted, not judged):" in prompt
    assert "target_word_count_met: FAIL" in prompt
    assert "word_count_estimate:" in prompt
    assert "overall_score may not exceed 6" in prompt


def test_a_failing_measured_check_caps_the_score_the_auditor_returned():
    """The Medellin run returned 10 while a measured check was failing.

    The prompt already said "overall_score may not exceed 6" in the same call.
    Asking a model to cap its own score is a request, and this one was ignored,
    so the cap is enforced where the measurements are facts.
    """
    llm = FakeLLM(
        json_response={
            "overall_score": 10,
            "constraint_checks": {"audience_match": True, "tone_match": True},
            "required_revisions": [],
            "quality_summary": "An exceptional draft.",
        }
    )
    dependencies, recorder = _dependencies(llm)

    result = run_v3_quality_audit_stage(_state(), dependencies)

    quality = result["quality"]
    assert quality["constraint_checks"]["target_word_count_met"] is False
    assert quality["overall_score"] == 6


def test_the_ceiling_leaves_a_clean_draft_alone():
    # The cap must not quietly become a general downgrade: with every measured
    # check passing, the auditor's own score stands.
    from app.features.prompt2blog.quality import enforce_measured_check_ceiling

    quality = {"overall_score": 10}
    failed = enforce_measured_check_ceiling(
        quality, {"target_word_count_met": True, "must_include_covered": True}
    )

    assert failed == []
    assert quality["overall_score"] == 10


def test_the_ceiling_ignores_the_auditors_own_editorial_judgements():
    # audience_match and tone_match are opinions the auditor returns, not
    # measurements. They must never silently cap a score.
    from app.features.prompt2blog.quality import enforce_measured_check_ceiling

    quality = {"overall_score": 9}
    failed = enforce_measured_check_ceiling(
        quality, {"word_count_estimate": 1200, "must_include_coverage": 0.5}
    )

    assert failed == []
    assert quality["overall_score"] == 9


def test_the_audit_scores_editing_burden_not_rule_compliance():
    """A 10 used to mean grounded and constraint-compliant.

    The Medellin run earned "exceptional draft" while its food section was a
    menu-price catalog and its takeaways were leftovers. The rubric now defines
    the top of the scale by what a human editor still has to do.
    """
    llm = FakeLLM(
        json_response={
            "overall_score": 8,
            "constraint_checks": {"audience_match": True, "tone_match": True},
            "required_revisions": [],
            "quality_summary": "Solid.",
        }
    )
    dependencies, _recorder = _dependencies(llm)

    run_v3_quality_audit_stage(_state(), dependencies)

    prompt = llm.prompts[0]
    assert "how much work a human editor still" in prompt
    assert "What remains is personalisation" in prompt
    assert "A fact catalog is not coverage" in prompt
    assert "cap overall_score at 7" in prompt
    assert "Reader decision support is a scored dimension" in prompt
    assert "is the floor this scale starts" in prompt


def test_the_audit_is_told_the_working_title_is_a_reader_promise():
    """A commission can drift from the title it came from.

    "Where to eat in Lima right now" produced a faithful news report about an
    awards ceremony. The auditor scored it 9/10 for executing its form, which
    was true and beside the point.
    """
    llm = FakeLLM(
        json_response={
            "overall_score": 7,
            "constraint_checks": {"audience_match": True, "tone_match": True},
            "required_revisions": [],
            "quality_summary": "Fine.",
        }
    )
    dependencies, _recorder = _dependencies(llm)

    run_v3_quality_audit_stage(_state(), dependencies)

    prompt = llm.prompts[0]
    assert "is a promise made to a reader" in prompt
    assert "a draft that follows a drifted commission faithfully is still the" in prompt
    assert "cap overall_score at 5" in prompt
    # The title it must be judged against has to actually be in the prompt.
    assert "Original title:" in prompt


def test_the_audit_still_measures_the_checks_it_reports():
    # Moving the computation earlier must not drop it from the result.
    llm = FakeLLM(
        json_response={
            "overall_score": 8,
            "constraint_checks": {"audience_match": True, "tone_match": False},
            "required_revisions": [],
            "quality_summary": "Fine.",
        }
    )
    dependencies, _recorder = _dependencies(llm)

    updates = run_v3_quality_audit_stage(_state(), dependencies)

    assert "word_count_estimate" in updates["quality"]
    assert updates["quality_checks"]["target_word_count_met"] is False
    # Judged checks stay the auditor's; measured checks stay the code's.
    assert updates["quality_checks"]["tone_match"] is False


def test_repair_is_told_to_cut_when_the_draft_overruns_its_length_band():
    """The Lima restaurant run's dead end, as a test.

    The auditor read `target_word_count_met: false` off a 1903-word draft
    against a 1260-1540 band, guessed "too short", and told repair to expand.
    Both repair passes obeyed and both were discarded. The direction now
    travels with the check, so repair cannot be sent the wrong way.
    """
    llm = FakeLLM(
        json_response={
            "improved_title": "What Lima costs now",
            "improved_content": "## What Lima costs now\n\nRepaired body.",
        }
    )
    dependencies, recorder = _dependencies(llm)
    state = _state(
        quality={
            "required_revisions": [],
            "word_count_check": {
                "target_word_count_met": False,
                "word_count_estimate": 1903,
                "word_count_delta": 363,
                "word_count_direction": "over",
                "word_count_target_min": 1260,
                "word_count_target_max": 1540,
            },
        },
        groundedness={
            "checked": True,
            "grounded": True,
            "high_severity_count": 0,
            "unsupported_claims": [],
        },
    )

    run_v3_repair_stage(state, dependencies)

    length_revision = recorder.recorded[0][1]["required_revisions"][0]
    assert "Cut about 360 words" in length_revision
    assert "1260-1540 words" in length_revision
    assert length_revision in llm.prompts[0]
    assert "Never lengthen a draft asked to be cut" in llm.prompts[0]


def test_repair_gets_no_length_revision_when_the_draft_is_within_its_band():
    llm = FakeLLM(
        json_response={
            "improved_title": "What Lima costs now",
            "improved_content": "## What Lima costs now\n\nRepaired body.",
        }
    )
    dependencies, recorder = _dependencies(llm)
    state = _state(
        quality={
            "required_revisions": ["Tighten the opening."],
            "word_count_check": {
                "target_word_count_met": True,
                "word_count_estimate": 1400,
                "word_count_delta": 0,
                "word_count_direction": "within",
                "word_count_target_min": 1260,
                "word_count_target_max": 1540,
            },
        },
        groundedness={
            "checked": True,
            "grounded": True,
            "high_severity_count": 0,
            "unsupported_claims": [],
        },
    )

    run_v3_repair_stage(state, dependencies)

    assert recorder.recorded[0][1]["required_revisions"] == ["Tighten the opening."]


def test_audit_is_shown_the_direction_of_a_length_miss_not_just_the_failure():
    from app.features.prompt2blog.stages.v3.audit_repair import _measured_checks_block

    block = _measured_checks_block(
        {
            "target_word_count_met": False,
            "cta_present": True,
            "word_count_estimate": 1903,
            "word_count_delta": 363,
            "word_count_direction": "over",
            "word_count_target_min": 1260,
            "word_count_target_max": 1540,
        }
    )

    assert "target_word_count_met: FAIL" in block
    assert "word_count_verdict: OVER the required 1260-1540 word band by 363 words" in (
        block
    )


def test_the_auditors_own_length_sentence_is_replaced_not_kept_beside():
    """Two length instructions pointing opposite ways is the original bug.

    The auditor is shown the direction now, but shown is not obeyed. If it
    still writes "expand the draft" against a draft that must be cut, repair
    must not be handed both and left to choose.
    """
    llm = FakeLLM(
        json_response={
            "improved_title": "What Lima costs now",
            "improved_content": "## What Lima costs now\n\nRepaired body.",
        }
    )
    dependencies, recorder = _dependencies(llm)
    state = _state(
        quality={
            "required_revisions": [
                "Expand the draft to fulfill the required Long length profile.",
                "Name a price for each restaurant.",
            ],
            "word_count_check": {
                "target_word_count_met": False,
                "word_count_estimate": 1903,
                "word_count_delta": 363,
                "word_count_direction": "over",
                "word_count_target_min": 1260,
                "word_count_target_max": 1540,
            },
        },
        groundedness={
            "checked": True,
            "grounded": True,
            "high_severity_count": 0,
            "unsupported_claims": [],
        },
    )

    run_v3_repair_stage(state, dependencies)

    revisions = recorder.recorded[0][1]["required_revisions"]
    assert "Cut about 360 words" in revisions[0]
    # The unrelated revision survives; only the contradicting one is dropped.
    assert "Name a price for each restaurant." in revisions
    assert not any("Expand the draft" in revision for revision in revisions)


def test_an_auditor_revision_about_length_survives_when_the_length_is_fine():
    """Nothing is dropped unless a computed instruction is replacing it."""
    llm = FakeLLM(
        json_response={
            "improved_title": "What Lima costs now",
            "improved_content": "## What Lima costs now\n\nRepaired body.",
        }
    )
    dependencies, recorder = _dependencies(llm)
    state = _state(
        quality={"required_revisions": ["Shorten the opening paragraph."]},
        groundedness={
            "checked": True,
            "grounded": True,
            "high_severity_count": 0,
            "unsupported_claims": [],
        },
    )

    run_v3_repair_stage(state, dependencies)

    assert recorder.recorded[0][1]["required_revisions"] == [
        "Shorten the opening paragraph."
    ]
