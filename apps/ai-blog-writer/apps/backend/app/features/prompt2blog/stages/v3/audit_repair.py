from __future__ import annotations

from typing import Any

from ...dependencies import PipelineDependencies
from ...graph.state import Prompt2BlogV3GraphState
from ...instructions_v3 import stage_context_text
from ...observability import _append_stage_trace
from ...policies import decide_repair, is_better_quality
from ...pricing import run_billed_cost_usd, run_tokens_spent
from ...prompts.editorial_v3 import (
    P2B_V3_QUALITY_AUDIT_PROMPT,
    P2B_V3_REPAIR_PROMPT,
)
from ...quality import (
    CONSTRAINT_MEASUREMENT_KEYS,
    evaluate_fails_if,
    _build_constraint_checks,
    _sanitize_quality,
    _sanitize_rewrite,
    drop_length_revisions,
    enforce_measured_check_ceiling,
    unchecked_groundedness,
    word_count_revision_instruction,
)
from ...quality_v3 import v3_constraint_brief
from ...content.markdown import sections_changed
from ...content.style_cleanup import clean_up_style
from ...content.sections import (
    apply_section_replacements,
    locate_claims,
    section_manifest,
    segment_article,
)
from ...schemas import REPAIR_SECTIONS_SCHEMA
from ...support import _format_style_directive, _json, _safe_dict, _safe_str


# The measurements are deterministic and cheap, so they run before the audit
# call rather than after it. The Lima food article scored 9/10 on every axis
# while `target_word_count_met` was false at 388 words against a 1400 target:
# the auditor could not have known, because the checks it was being scored
# beside were merged into its answer after it had given one.
#
# The later Lima restaurant run failed the same check from the other side --
# 1903 words against a 1260-1540 band -- and the auditor, reading a bare
# boolean, wrote "expand the draft". Both repair passes obeyed and both were
# discarded by keep-best. Hence the direction travels with the check.
def _measured_checks_block(checks: dict[str, Any]) -> str:
    reported = {key: value for key, value in checks.items() if isinstance(value, bool)}
    if not reported:
        return "None measured."
    lines = [
        f"- {key}: {'pass' if value else 'FAIL'}"
        for key, value in sorted(reported.items())
    ]
    word_count = checks.get("word_count_estimate")
    if word_count is not None:
        lines.append(f"- word_count_estimate: {word_count}")
    # A failed length check without its direction is a coin flip for the
    # auditor, and it called the Lima run wrong: it read "too short" off a
    # draft 363 words over the ceiling and told repair to expand.
    if checks.get("target_word_count_met") is False:
        direction = checks.get("word_count_direction")
        delta = checks.get("word_count_delta")
        lower = checks.get("word_count_target_min")
        upper = checks.get("word_count_target_max")
        if direction in {"over", "under"} and delta:
            lines.append(
                f"- word_count_verdict: {direction.upper()} the required "
                f"{lower}-{upper} word band by {abs(int(delta))} words"
            )
    return "\n".join(lines)


def _audit_v3_rewrite(
    state: Prompt2BlogV3GraphState,
    dependencies: PipelineDependencies,
    rewrite: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], str, str, dict[str, Any]]:
    computed_checks = _build_constraint_checks(
        rewrite["improved_title"],
        rewrite["improved_content"],
        v3_constraint_brief(state["brief"], state["option_context"]),
    )
    groundedness = state.get("groundedness") or unchecked_groundedness()
    prompt = P2B_V3_QUALITY_AUDIT_PROMPT.format(
        instructions=stage_context_text(state["stage_contexts"], "audit"),
        style_directive=_format_style_directive(state["option_context"]),
        grounding_verdict=_json(groundedness),
        measured_checks=_measured_checks_block(computed_checks),
        rewritten_title=rewrite["improved_title"],
        rewritten_content=rewrite["improved_content"],
    )
    parsed, raw_response = dependencies.llm.invoke_json(
        job_id="p2b.audit",
        prompt=prompt,
        max_tokens=1536,
        temperature=0.05,
        model_name=state["audit_model"],
    )
    quality = _sanitize_quality(parsed)
    # The auditor answered with a quote; this is where that becomes a verdict.
    fails_if = evaluate_fails_if(quality, rewrite["improved_content"])
    quality["fails_if_check"] = fails_if
    quality["fails_if_avoided"] = fails_if["verdict"] != "walks_into_it"
    if fails_if["verdict"] == "walks_into_it":
        # Repair reads required_revisions, so the sentence has to be in there
        # whether or not the auditor remembered to put it there.
        revision = (
            f"The draft walks into the line the brief says it fails on. "
            f"Rewrite this sentence: \"{fails_if['matched']}\". "
            f"{fails_if['why']}".strip()
        )
        if not any(
            fails_if["matched"][:40] in item for item in quality["required_revisions"]
        ):
            quality["required_revisions"] = [
                revision,
                *quality["required_revisions"],
            ]
    quality_checks = {
        **quality.get("constraint_checks", {}),
        **{
            key: value
            for key, value in computed_checks.items()
            if key not in CONSTRAINT_MEASUREMENT_KEYS
        },
        "claims_grounded": groundedness["grounded"],
    }
    quality["constraint_checks"] = quality_checks
    # The prompt asks the auditor to cap itself at 6 while a measured check is
    # failing. The Medellin run returned 10 anyway. Enforce it here, where the
    # measurements are facts rather than a request.
    enforce_measured_check_ceiling(quality, computed_checks)
    quality["word_count_estimate"] = computed_checks["word_count_estimate"]
    # Repair reads this to state the length revision in words. It travels on
    # `quality` rather than in `constraint_checks`, which holds only verdicts.
    quality["word_count_check"] = {
        key: computed_checks[key]
        for key in (
            "target_word_count_met",
            "word_count_estimate",
            "word_count_delta",
            "word_count_direction",
            "word_count_target_min",
            "word_count_target_max",
        )
    }
    quality["secondary_keyword_coverage"] = computed_checks[
        "secondary_keyword_coverage"
    ]
    quality["groundedness"] = groundedness
    return quality, quality_checks, prompt, raw_response, parsed


def run_v3_quality_audit_stage(
    state: Prompt2BlogV3GraphState,
    dependencies: PipelineDependencies,
) -> dict[str, Any]:
    stage = "stage_v3_quality_audit"
    run_id = state["run_id"]
    attempt = state.get("repair_attempts", 0)
    dependencies.recorder.start_stage(run_id, stage)

    rewrite = state["rewrite"]
    quality, checks, prompt, raw_response, parsed = _audit_v3_rewrite(
        state,
        dependencies,
        rewrite,
    )

    updates: dict[str, Any] = {
        "current_stage": stage,
        "quality": quality,
        "quality_checks": checks,
        # Read after the audit call, so the gate below judges the spend the run
        # has actually reached rather than the one it had before this stage.
        "tokens_spent": run_tokens_spent(dependencies.llm),
        # What the run has actually billed. The repair decision reads this;
        # tokens stay for the runaway ceiling and the receipt.
        "billed_cost_usd": run_billed_cost_usd(dependencies.llm),
    }
    if is_better_quality(quality, state.get("best_quality")):
        updates["best_rewrite"] = rewrite
        updates["best_quality"] = quality
        updates["best_quality_checks"] = checks

    # The same call the graph's conditional edge makes, on the same state, run
    # here only to record it. The audit is where the operator's "what is wrong
    # and what has this cost" answer belongs; the edge itself keeps no history.
    decision = decide_repair({**state, **updates})
    updates["repair_decision"] = decision.as_dict()

    dependencies.recorder.record_stage(
        run_id,
        stage,
        {
            "quality": quality,
            "raw_response": raw_response,
            "attempt": attempt,
            "repair_decision": decision.as_dict(),
        },
    )
    _append_stage_trace(
        state["trace"],
        state["include_debug"],
        stage=stage,
        model_name=state["audit_model"],
        input_payload={"attempt": attempt},
        prompt=prompt,
        raw_response=raw_response,
        parsed=parsed,
        output={"quality": quality, "repair_decision": decision.as_dict()},
    )
    return updates


def _packet_claim_ids(state: Prompt2BlogV3GraphState) -> set[str]:
    packet = state.get("packet") or {}
    return {
        _safe_str(fact.get("claim_id"))
        for fact in (packet.get("facts") or [])
        if isinstance(fact, dict) and _safe_str(fact.get("claim_id"))
    }


def _screen_section_edits(
    raw_sections: Any,
    *,
    allowed_claim_ids: set[str],
) -> tuple[Any, list[dict[str, str]]]:
    """Drop edits that cite a fact this article was not written from.

    Finding 03 gives repair the packet and permission to use it. The boundary
    that makes that safe is that the packet is the whole permission: an id
    from the wider dossier names a fact a person deliberately cut, and an id
    that names nothing at all is a fact the model supplied itself.

    An id is not proof the sentence means what the claim means -- grounding
    runs again on the assembled article for that. This only refuses the ones
    that cannot be checked at all.
    """
    if not isinstance(raw_sections, list):
        # Handed straight on rather than flattened to an empty list, so the
        # edit report says the response was the wrong shape instead of
        # reporting a repair that proposed nothing.
        return raw_sections, []
    kept: list[Any] = []
    rejected: list[dict[str, str]] = []
    for raw in raw_sections:
        record = _safe_dict(raw)
        cited = [
            _safe_str(item)
            for item in (record.get("claim_ids") or [])
            if _safe_str(item)
        ]
        unknown = sorted(set(cited) - allowed_claim_ids)
        if unknown:
            rejected.append(
                {
                    "section_id": _safe_str(record.get("section_id")) or "(missing)",
                    "reason": f"cites facts outside the packet: {', '.join(unknown)}",
                }
            )
            continue
        kept.append(raw)
    return kept, rejected


def run_v3_repair_stage(
    state: Prompt2BlogV3GraphState,
    dependencies: PipelineDependencies,
) -> dict[str, Any]:
    """Repair the sections the auditor named, and only those.

    Two findings meet here. Repair no longer returns a whole article (06): it
    returns replacements for named sections, and the code applies them to the
    original document, so prose nobody complained about is the original bytes
    rather than a promise. And it can now reach the facts a person chose for
    this article (03), including the ones the first draft left out, which is
    what makes a revision like "support the comparison" answerable at all.

    The draft it produces is re-grounded and re-audited exactly as before.
    """
    stage = "stage_v3_repair"
    run_id = state["run_id"]
    rewrite = state["rewrite"]
    quality = state["quality"]
    attempt = state.get("repair_attempts", 0) + 1
    dependencies.recorder.start_stage(run_id, stage)

    groundedness = state.get("groundedness") or unchecked_groundedness()
    required_revisions = list(quality.get("required_revisions", []))
    # First, and computed rather than written by the auditor: a length miss is
    # the one revision the auditor cannot get wrong twice, because the counts
    # that failed the check are the counts that phrase the instruction.
    #
    # The auditor's own length sentence is dropped rather than kept alongside
    # it. The auditor is shown the direction now, but a list carrying both
    # "cut about 360 words" and "expand the draft" would leave repair to pick
    # between them, which is the original bug wearing a smaller hat.
    length_revision = word_count_revision_instruction(
        quality.get("word_count_check") or {}
    )
    if length_revision:
        required_revisions = [
            length_revision,
            *drop_length_revisions(required_revisions),
        ]
    unsupported_claims = list(groundedness["unsupported_claims"])

    previous_content = rewrite["improved_content"]
    sections = segment_article(previous_content)
    flagged = locate_claims(sections, unsupported_claims)

    prompt = P2B_V3_REPAIR_PROMPT.format(
        required_revisions=_json(required_revisions),
        unsupported_claims=_json(unsupported_claims),
        flagged_sections=_json(flagged) if flagged else "None located by quote.",
        section_map=section_manifest(sections),
        previous_title=rewrite["improved_title"],
        previous_content=previous_content,
        facts=stage_context_text(state["stage_contexts"], "repair_facts")
        or "THE FACTS AVAILABLE TO THIS REPAIR\n- None recorded for this run.",
        instructions=stage_context_text(state["stage_contexts"], "repair_lock"),
        style_directive=_format_style_directive(state["option_context"]),
    )
    # Repair rewrites prose, so it runs on a prose model -- the writer's,
    # unless the route named a different one.
    #
    # Worth being separable from the draft: the two are not the same job. The
    # draft writes into an open space; repair is handed a list of required
    # revisions and has to satisfy them without breaking the rest, which is the
    # kind of work more reasoning effort actually pays for. It is also the
    # cheaper place to spend it, because it only runs on a draft that failed.
    repair_model = state.get("repair_model") or state["writing_model"]
    parsed, raw_response = dependencies.llm.invoke_json(
        job_id="p2b.repair",
        prompt=prompt,
        max_tokens=6144,
        temperature=0.1,
        model_name=repair_model,
        schema=REPAIR_SECTIONS_SCHEMA,
    )
    parsed_dict = _safe_dict(parsed)
    screened, cited_rejections = _screen_section_edits(
        parsed_dict.get("sections"),
        allowed_claim_ids=_packet_claim_ids(state),
    )
    edit = apply_section_replacements(previous_content, screened)
    edit_report = {
        **edit.as_dict(),
        "rejected": [*edit.as_dict()["rejected"], *cited_rejections],
        "section_count": len(sections),
    }

    repaired = _sanitize_rewrite(
        {
            **parsed_dict,
            "improved_content": edit.content,
        },
        fallback_title=rewrite["improved_title"],
        fallback_content=previous_content,
    )
    # Which sections moved, from the applied edits rather than from a diff.
    # A pass that changed nothing is now a visible outcome instead of a draft
    # that looks repaired.
    touched = sections_changed(previous_content, repaired["improved_content"])
    # And the style cleanup edits sections too (finding 05), on the same model
    # that just wrote the text: this is another pass over it, not a separate
    # judgement. It is given the repair lock, so the caveats a repaired
    # sentence is carrying are visible to the pass tidying it.
    repaired["improved_content"], style_report = clean_up_style(
        repaired["improved_content"],
        dependencies=dependencies,
        job_id="p2b.repair",
        model_name=repair_model,
        max_tokens=4096,
        context="prompt2blog v3 repair",
        guard=stage_context_text(state["stage_contexts"], "repair_lock"),
    )
    _append_stage_trace(
        state["trace"],
        state["include_debug"],
        stage=stage,
        model_name=repair_model,
        input_payload={
            "attempt": attempt,
            "sections_touched": touched,
            "section_edits": edit_report,
            "style_cleanup": style_report,
        },
        prompt=prompt,
        raw_response=raw_response,
        parsed=parsed,
        output={"rewrite": repaired},
    )
    dependencies.recorder.record_stage(
        run_id,
        stage,
        {
            "repair_applied": edit.changed,
            "attempt": attempt,
            "rewrite": repaired,
            "required_revisions": required_revisions,
            "unsupported_claims": unsupported_claims,
            "section_edits": edit_report,
            "style_cleanup": style_report,
            "raw_response": raw_response,
        },
    )
    return {
        "current_stage": stage,
        # False when every proposed edit was refused. The run still continues
        # -- the existing draft is intact and saveable -- but the receipt does
        # not claim a repair that did not happen.
        "repair_applied": edit.changed,
        "repair_attempts": attempt,
        "rewrite": repaired,
    }


def run_v3_quality_settle_stage(
    state: Prompt2BlogV3GraphState,
    dependencies: PipelineDependencies,
) -> dict[str, Any]:
    """Settle on the best-scoring draft the repair loop produced."""
    stage = "stage_v3_quality_settle"
    run_id = state["run_id"]
    dependencies.recorder.start_stage(run_id, stage)

    best_rewrite = state.get("best_rewrite") or state["rewrite"]
    best_quality = state.get("best_quality") or state["quality"]
    best_checks = state.get("best_quality_checks") or state["quality_checks"]
    rolled_back = best_rewrite is not state["rewrite"]

    settlement = {
        "repair_attempts": state.get("repair_attempts", 0),
        "repair_applied": state.get("repair_applied", False),
        "reverted_to_earlier_draft": rolled_back,
        "final_overall_score": best_quality.get("overall_score"),
        "last_overall_score": state["quality"].get("overall_score"),
        # Why the loop stopped here rather than repairing again. A settle that
        # came of an exhausted budget and one that came of a passing draft are
        # the same row without it.
        "repair_decision": state.get("repair_decision"),
    }
    dependencies.recorder.record_stage(run_id, stage, settlement)
    _append_stage_trace(
        state["trace"],
        state["include_debug"],
        stage=stage,
        output=settlement,
    )
    return {
        "current_stage": stage,
        "rewrite": best_rewrite,
        "quality": best_quality,
        "quality_checks": best_checks,
        # The grounding verdict travels with the draft it describes.
        "groundedness": best_quality.get("groundedness") or state["groundedness"],
    }
