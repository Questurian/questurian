"""The brief translated into separately checkable research questions.

The direction step keeps its real job and loses the one it should never have
had. It stops inventing the article -- the grill did that, with a person -- and
becomes a research planner.

Turning "the market food beats the famous restaurants" into three separately
checkable questions is a real skill, and no operator should be doing it. That
work stays with the machine. What the operator gets instead is a real decision:
the questions in plain English, with the ability to strike two and add one.
That changes cost, focus and length, which a choice between three lookalike
direction cards never did.

Cutting a load-bearing question is allowed. It is answered once, plainly, with
what the article can no longer claim, and then obeyed. A decision that cannot
be wrong is not a decision.
"""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass
from typing import Any

from .contracts_v4 import (
    ArticleBrief,
    Prompt2BlogWorkOrder,
    WorkOrderAssumption,
    WorkOrderReference,
    WorkOrderRequirement,
    WorkOrderScope,
)
from .grill_v4 import GrillDependencies
from .support import _safe_dict, _safe_str

logger = logging.getLogger(__name__)

WORK_ORDER_STAGE = "stage_v4_work_order"

WORK_ORDER_SCHEMA = {
    "type": "object",
    "properties": {
        "primary_subject": {"type": "string"},
        "scope_mode": {"type": "string"},
        "references": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "role": {"type": "string"},
                },
                "required": ["name", "role"],
            },
        },
        "premise": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "assumption_id": {"type": "string"},
                    "statement": {"type": "string"},
                },
                "required": ["assumption_id", "statement"],
            },
        },
        "requirements": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "requirement_id": {"type": "string"},
                    "question": {"type": "string"},
                    "kind": {"type": "string"},
                    "assumption_ids": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["requirement_id", "question", "kind"],
            },
        },
    },
    "required": ["primary_subject", "scope_mode", "references", "requirements"],
}


@dataclass(frozen=True)
class CutOutcome:
    """What the operator's cut produced, and what it cost.

    `warnings` is what the system says once, before obeying. It is not a
    refusal and it does not need acknowledging.
    """

    work_order: Prompt2BlogWorkOrder
    warnings: list[str]


def build_work_order_prompt(brief: ArticleBrief) -> str:
    must_name = "\n".join(f"- {item}" for item in brief.must_name) or "- Nothing named."
    material = (
        "\n".join(f"- [{item.kind}] {item.statement}" for item in brief.material)
        or "- Nothing; this is research-led."
    )
    return f"""Plan the research for a commissioned article. You cannot browse; you are
writing the questions someone else will answer.

THE BRIEF
Location: {brief.location}
Form: {brief.form_id}
Reader: {brief.reader.primary_reader}
Their question: {brief.reader_question}
What it should make them do: {brief.outcome}
Spine (what the piece is built on): {brief.spine}
Must name:
{must_name}
What the writer already has:
{material}
It fails if: {brief.fails_if}

Write the questions that have to be answered before this can be written.

Rules:
- Each question must be separately checkable by someone with a search engine.
  "Is Lima good value?" is not a question; "What does a one-bedroom in
  Miraflores rent for, and as of when?" is.
- Mark each `kind`. `load_bearing` means the piece cannot be written without
  the answer. `texture` means the piece is duller without it -- a scene, a
  detail, something that puts the reader somewhere. Ask for texture: a dossier
  with nothing a reader would enjoy is a real gap, not a success.
- At least one question must be load_bearing.
- Do not write a question whose answer the writer already has above.
- Anything you are assuming without being able to check it goes in `premise`,
  with the questions that rest on it listing its id. An assumption nobody wrote
  down cannot be refuted later, and that is how a run dies five unanswerable
  questions in.
- References: exactly one `primary_subject`. Somewhere mentioned for
  calibration is `context_only` and can never become a co-subject.
"""


def _requirements_from(payload: dict[str, Any]) -> list[WorkOrderRequirement]:
    requirements: list[WorkOrderRequirement] = []
    for raw in payload.get("requirements") or []:
        record = _safe_dict(raw)
        question = _safe_str(record.get("question"))
        kind = _safe_str(record.get("kind"))
        if not question or kind not in {"load_bearing", "texture"}:
            continue
        requirements.append(
            WorkOrderRequirement(
                requirement_id=_safe_str(record.get("requirement_id"))
                or f"r{len(requirements) + 1}",
                question=question,
                kind=kind,
                assumption_ids=[
                    _safe_str(item) for item in (record.get("assumption_ids") or [])
                ],
            )
        )
    return requirements


def work_order_fingerprint(payload: dict[str, Any]) -> str:
    canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return "wo-" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:32]


def _assemble(
    brief: ArticleBrief,
    *,
    primary_subject: str,
    scope: WorkOrderScope,
    premise: list[WorkOrderAssumption],
    requirements: list[WorkOrderRequirement],
) -> Prompt2BlogWorkOrder:
    body = {
        "brief_fingerprint": brief.brief_fingerprint,
        "primary_subject": primary_subject,
        "scope": scope.model_dump(mode="json"),
        "premise": [item.model_dump(mode="json") for item in premise],
        "requirements": [item.model_dump(mode="json") for item in requirements],
    }
    return Prompt2BlogWorkOrder(
        work_order_fingerprint=work_order_fingerprint(body),
        brief_fingerprint=brief.brief_fingerprint,
        primary_subject=primary_subject,
        scope=scope,
        premise=premise,
        requirements=requirements,
    )


def build_work_order(
    brief: ArticleBrief,
    dependencies: GrillDependencies,
) -> Prompt2BlogWorkOrder:
    """Turn the brief into checkable questions. One structured call, no browsing."""
    parsed, _raw = dependencies.llm.invoke_json(
        prompt=build_work_order_prompt(brief),
        model_name=dependencies.model_name,
        schema=WORK_ORDER_SCHEMA,
        max_tokens=2_048,
        temperature=0.2,
    )
    payload = _safe_dict(parsed)

    references = [
        WorkOrderReference(name=_safe_str(item.get("name")), role=_safe_str(item.get("role")))
        for item in (payload.get("references") or [])
        if _safe_str(_safe_dict(item).get("name"))
    ]
    scope = WorkOrderScope(
        mode=_safe_str(payload.get("scope_mode")) or "single_subject",
        references=references,
    )
    premise = [
        WorkOrderAssumption(
            assumption_id=_safe_str(_safe_dict(item).get("assumption_id")),
            statement=_safe_str(_safe_dict(item).get("statement")),
        )
        for item in (payload.get("premise") or [])
        if _safe_str(_safe_dict(item).get("assumption_id"))
    ]
    return _assemble(
        brief,
        primary_subject=_safe_str(payload.get("primary_subject")),
        scope=scope,
        premise=premise,
        requirements=_requirements_from(payload),
    )


def _cost_of_cutting(
    requirement: WorkOrderRequirement,
    brief: ArticleBrief,
) -> str:
    """What the article can no longer claim, said once and plainly.

    Said rather than asked. The operator should not have to already know which
    questions are load-bearing to cut safely, and the system does know.
    """
    if requirement.kind == "texture":
        return (
            f'Cut "{requirement.question}" — the piece loses a detail, not an '
            "argument."
        )
    return (
        f'Cut "{requirement.question}" — without it the piece cannot claim '
        f"anything resting on it, and the spine is: {brief.spine}."
    )


def cut_work_order(
    work_order: Prompt2BlogWorkOrder,
    brief: ArticleBrief,
    *,
    struck_ids: list[str],
    added_questions: list[str] | None = None,
) -> CutOutcome:
    """Apply the operator's cut, and say what it cost.

    Obeys. The one thing it will not do is leave nothing for the piece to stand
    on -- an all-texture work order is not an article, it is a mood, and the
    contract refuses it.
    """
    struck = set(struck_ids)
    unknown = sorted(
        struck - {item.requirement_id for item in work_order.requirements}
    )
    if unknown:
        raise ValueError(f"No such requirement to strike: {', '.join(unknown)}")

    warnings = [
        _cost_of_cutting(item, brief)
        for item in work_order.requirements
        if item.requirement_id in struck
    ]
    kept = [
        item for item in work_order.requirements if item.requirement_id not in struck
    ]

    existing = {item.requirement_id for item in work_order.requirements}
    for index, question in enumerate(added_questions or [], start=1):
        cleaned = _safe_str(question)
        if not cleaned:
            continue
        new_id = f"r-added-{index}"
        while new_id in existing:
            index += 1
            new_id = f"r-added-{index}"
        existing.add(new_id)
        kept.append(
            # An operator's own question is load-bearing: they would not have
            # added it to be decorative.
            WorkOrderRequirement(
                requirement_id=new_id, question=cleaned, kind="load_bearing"
            )
        )

    # Premises whose every question is gone are no longer assumptions this run
    # rests on, and leaving them would fail the contract's dependency check.
    surviving = {
        assumption_id for item in kept for assumption_id in item.assumption_ids
    }
    premise = [item for item in work_order.premise if item.assumption_id in surviving]

    return CutOutcome(
        work_order=_assemble(
            brief,
            primary_subject=work_order.primary_subject,
            scope=work_order.scope,
            premise=premise,
            requirements=kept,
        ),
        warnings=warnings,
    )


def work_order_stage_record(
    work_order: Prompt2BlogWorkOrder,
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    """What the run keeps about the plan the operator approved."""
    return {
        "work_order_fingerprint": work_order.work_order_fingerprint,
        "brief_fingerprint": work_order.brief_fingerprint,
        "primary_subject": work_order.primary_subject,
        "requirements": [
            {
                "requirement_id": item.requirement_id,
                "question": item.question,
                "kind": item.kind,
            }
            for item in work_order.requirements
        ],
        "load_bearing_count": sum(
            item.kind == "load_bearing" for item in work_order.requirements
        ),
        "texture_count": sum(item.kind == "texture" for item in work_order.requirements),
        # Kept on the run because a thin article later is often explained by a
        # cut made here, and the explanation should not need reconstructing.
        "cut_warnings": list(warnings or []),
    }
