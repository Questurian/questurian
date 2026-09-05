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
from dataclasses import asdict, dataclass
from typing import Any, get_args

from .contracts_v4 import (
    ReferenceRole,
    RequirementPrecision,
    ArticleBrief,
    Prompt2BlogWorkOrder,
    WorkOrderAssumption,
    WorkOrderReference,
    WorkOrderRequirement,
    WorkOrderScope,
)
from pydantic import ValidationError

from .config import P2B_REPAIR_ESTIMATED_TOKENS, P2B_RUN_TOKEN_BUDGET
from .grill_v4 import GrillDependencies
from .schema_guards import require_non_empty
from .support import _safe_dict, _safe_str, _safe_str_list

logger = logging.getLogger(__name__)

WORK_ORDER_STAGE = "stage_v4_work_order"


class WorkOrderUnusable(RuntimeError):
    """The research plan came back in a shape that cannot be used.

    Mirrors `BriefUnusable`: the operator gets a sentence and the run keeps
    what came back, instead of a Pydantic error about list lengths arriving
    mid-flow after the grill and the brief have both been paid for.
    """

    def __init__(self, reason: str, raw: str) -> None:
        super().__init__(reason)
        self.reason = reason
        self.raw = raw


WORK_ORDER_SCHEMA = require_non_empty({
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
                    # Enum, because it is one of the few constraints that
                    # survives Gemini's schema translator.
                    "role": {"type": "string", "enum": list(get_args(ReferenceRole))},
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
                    "search_group": {"type": "string"},
                    "kind": {"type": "string"},
                    "precision": {
                        "type": "string",
                        "enum": list(get_args(RequirementPrecision)),
                    },
                    "assumption_ids": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["requirement_id", "question", "kind"],
            },
        },
    },
    "required": ["primary_subject", "scope_mode", "references", "requirements"],
})


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

THE HEADLINE THIS ARTICLE WILL BE PUBLISHED UNDER
{brief.seed}

Anything that line asserts as fact is a claim the article has to stand behind,
and it is load bearing whether or not the brief mentions it again. If it names
an age, a number, a superlative, a "first", an "oldest", or a comparison, one
of your questions establishes it. A reader who clicked that headline is owed
the answer to it.

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
- Assign the same short `search_group` to related questions that can be
  researched from the same sources: one bus route's stations, fare and duration;
  one museum's hours and admission; one restaurant shortlist's prices and hours.
  These share retrieval, but remain separate questions and coverage decisions.
  Do not group unrelated places or subjects. Leave it empty for a standalone question.
- Research only facts the brief needs. Do not expand a two-day guide into an
  exhaustive directory of alternatives. Prefer a focused shortlist.
- Each question must be separately checkable by someone with a search engine.
  "Is Lima good value?" is not a question; "What does a one-bedroom in
  Miraflores rent for, and as of when?" is.
- One question, one fact. If a question has two separate answers, it gets two
  ids. "What is the travel time in minutes and the current fare in PEN?" is two
  questions, and asking it as one holds the answered half hostage to the
  unanswered half -- the fare is published and the journey time is not, and
  that question can only come back half right. A question that asks a value and
  the date it was true is still one question; a question that asks for two
  different values is not.
- Set `precision` to what the ARTICLE needs, not to what sounds rigorous.
  `exact` when a reader acts on the number: a fare they hand over in coins, an
  opening time they turn up for, an address. `approximate` when a reader only
  needs the size of the thing: how long a bus takes, how many places are in a
  district, how far something is. Asking for "the exact travel time in minutes"
  on a route nobody times produces a question that cannot be answered however
  good the research is, and blocks a run over a number no reader wanted.
  `exact` is the default, so mark the ones that do not need it.
- Every question names its place unambiguously. Whoever answers it sees the
  question and little else, so a neighbourhood or district that shares its name
  with somewhere else carries the city and country: "the Buenos Aires
  neighbourhood of Medellin, Colombia", never "Buenos Aires". A question that
  reads correctly only to someone who already knows the subject is a question
  that gets answered about the wrong place.
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
- A question that takes something for granted is assuming it. "What are the
  names and rates of three 4-star hotels within five blocks of the Plaza
  Mayor?" assumes 4-star hotels are there; "how many listings does Booking.com
  show for Miraflores?" assumes Booking.com publishes that. When the assumption
  turns out to be false the question cannot be satisfied however good the
  research is, and a good answer gets recorded as a failure.
  So write the question so it survives being wrong, and declare what it assumed:
  "the best-rated hotels within five blocks of the Plaza Mayor, with their
  ratings and rates", assuming "hotels rated 4-star or better exist within five
  blocks of the Plaza Mayor". A false premise then comes back as a refuted
  premise, which is a finding, instead of as a failed question, which is a dead
  end.
- **One claim per assumption.** An assumption is a thing that is true or false;
  a sentence carrying three claims has no single answer, and one wrong part
  refutes all of it. Run b88081a0 died on "the claims regarding a motorway at
  the bottom of cliffs, a six-mile park on top, and the walk being the best
  free thing to do are factually accurate" -- the park was confirmed, the
  motorway was confirmed, and the whole assumption was refuted over a length
  nobody had claimed. Split them: one statement, one fact, one verdict.
- **Only write down what evidence could settle.** "The best free thing to do in
  the city" is an opinion, and an opinion in `premise` can never come back
  confirmed, so it blocks the article permanently. Taste, ranking and
  significance belong in the brief, not here. If you cannot describe the search
  that would prove an assumption wrong, it is not an assumption.
- `references` must list every place the plan touches, and must include the
  subject itself. Roles are exactly `primary_subject`, `context_only` and
  `comparator`. Exactly one entry is the `primary_subject` -- that is the thing
  the article is about. Somewhere mentioned only for calibration is
  `context_only` and can never become a co-subject. Somewhere being weighed
  against the subject is a `comparator`.
"""


def _scope_from(payload: dict[str, Any]) -> WorkOrderScope:
    """The scope, built from whatever the model managed to say.

    `references` must hold at least one entry and exactly one
    `primary_subject`, and none of that is stated in the prompt the model
    reads. Run 90b3f9bc (2026-08-30) came back with the primary subject named
    in its own top-level field and the references list empty, and the operator
    got "List should have at least 1 item after validation, not 0" mid-flow.

    The subject was never in doubt -- it was sitting in `primary_subject`. So
    the scope is repaired from what is known rather than refused:

    - references with an invented role are dropped, not fatal
    - names are deduplicated, because the contract compares them casefolded
    - if nothing is marked primary, the named primary subject becomes it
    - if several are, the first stays and the rest are dropped
    - the mode is derived from the references that survived, because the
      references are the substance and the mode is a label describing them.
      A stated mode that contradicts them is a label that is simply wrong.
    """
    roles = set(get_args(ReferenceRole))
    primary_subject = _safe_str(payload.get("primary_subject"))

    seen: set[str] = set()
    references: list[WorkOrderReference] = []
    for raw in payload.get("references") or []:
        item = _safe_dict(raw)
        name = _safe_str(item.get("name"))
        role = _safe_str(item.get("role"))
        if not name or role not in roles or name.casefold() in seen:
            continue
        seen.add(name.casefold())
        references.append(WorkOrderReference(name=name, role=role))

    primaries = [r for r in references if r.role == "primary_subject"]
    if not primaries:
        if not primary_subject:
            # Nothing names the subject anywhere. That is not repairable, and
            # the contract says so with a sentence the route turns into one.
            raise WorkOrderUnusable(
                "the plan named no subject to research",
                json.dumps(payload, ensure_ascii=False)[:4000],
            )
        if primary_subject.casefold() in seen:
            references = [
                WorkOrderReference(name=r.name, role="primary_subject")
                if r.name.casefold() == primary_subject.casefold()
                else r
                for r in references
            ]
        else:
            references.insert(
                0, WorkOrderReference(name=primary_subject, role="primary_subject")
            )
    elif len(primaries) > 1:
        keep = primaries[0]
        references = [
            r for r in references if r.role != "primary_subject" or r is keep
        ]

    comparators = sum(r.role == "comparator" for r in references)
    mode = (
        "single_subject"
        if comparators == 0
        else "head_to_head"
        if comparators == 1
        else "ranked_set"
    )
    return WorkOrderScope(mode=mode, references=references)


def _first(record: dict[str, Any], *names: str) -> Any:
    """The first of `names` the record actually carries."""
    for name in names:
        if name in record and record[name] not in (None, "", []):
            return record[name]
    return None


def _listed(payload: dict[str, Any], *names: str) -> list[Any]:
    value = _first(payload, *names)
    return value if isinstance(value, list) else []


def _premise_from(payload: dict[str, Any]) -> list[WorkOrderAssumption]:
    """The assumptions, under whichever names the model used for them.

    Run 90b3f9bc (2026-08-30 20:52Z) returned `premises` with `id` and
    `description`, against a schema asking for `premise` with `assumption_id`
    and `statement`. Same five assumptions, all of them sound.
    """
    premise: list[WorkOrderAssumption] = []
    for raw in _listed(payload, "premise", "premises", "assumptions"):
        record = _safe_dict(raw)
        assumption_id = _safe_str(_first(record, "assumption_id", "id", "premise_id"))
        statement = _safe_str(_first(record, "statement", "description", "text"))
        if not assumption_id or not statement:
            continue
        premise.append(
            WorkOrderAssumption(assumption_id=assumption_id, statement=statement)
        )
    return premise


def _requirements_from(
    payload: dict[str, Any],
    declared: set[str] | None = None,
) -> list[WorkOrderRequirement]:
    """The research questions, under whichever names the model used for them.

    The same run returned `questions`, each carrying `question`, `kind` and
    `premise_ids`, with no id at all -- against a schema asking for
    `requirements` with `requirement_id` and `assumption_ids`. Eight specific,
    checkable questions, and every one of them was thrown away because the
    list had the wrong name.

    Run b78a9fe8 (2026-09-01) then returned the same list under `questions`
    with the text under `query`. Six specific, checkable questions, every one
    dropped, and the operator got "requirements: List should have at least 1
    item after validation, not 0" -- a plan refused over a synonym.

    A schema exists so the model knows what to send, not so the parser can
    reject what arrived. If the content is right, take it.
    """
    requirements: list[WorkOrderRequirement] = []
    dropped = 0
    for raw in _listed(payload, "requirements", "questions"):
        record = _safe_dict(raw)
        question = _safe_str(_first(record, "question", "query", "text", "ask"))
        kind = _safe_str(record.get("kind"))
        if not question or kind not in {"load_bearing", "texture"}:
            dropped += 1
            continue
        assumption_ids = _safe_str_list(
            _first(record, "assumption_ids", "premise_ids", "premises")
        )
        # A precision we cannot read is `exact`, which is how every question
        # behaved before this field existed. Loosening has to be deliberate.
        precision = _safe_str(_first(record, "precision", "exactness"))
        if precision not in set(get_args(RequirementPrecision)):
            precision = "exact"
        requirements.append(
            WorkOrderRequirement(
                requirement_id=_safe_str(
                    _first(record, "requirement_id", "id", "question_id")
                )
                or f"r{len(requirements) + 1}",
                question=question,
                kind=kind,
                precision=precision,
                search_group=_safe_str(record.get("search_group")),
                # A reference to an assumption nobody declared is dropped
                # rather than fatal: the question is still worth asking, and
                # the contract refuses a dangling id.
                assumption_ids=[
                    item
                    for item in assumption_ids
                    if item and (declared is None or item in declared)
                ],
            )
        )
    if dropped:
        # Named here rather than left to the empty-list contract error, which
        # says a plan came back with no questions and not that it came back
        # with questions this parser did not recognise.
        logger.warning(
            "Dropped %s research question(s) the parser could not read; kept %s",
            dropped,
            len(requirements),
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
            job_id="p2b.work_order",
        prompt=build_work_order_prompt(brief),
        model_name=dependencies.model_name,
        schema=WORK_ORDER_SCHEMA,
        max_tokens=2_048,
        temperature=0.2,
    )
    payload = _safe_dict(parsed)

    scope = _scope_from(payload)
    premise = _premise_from(payload)
    requirements = _requirements_from(
        payload, declared={item.assumption_id for item in premise}
    )
    # Premises nothing rests on are not assumptions this run makes, and the
    # contract refuses to carry them.
    rests_on = {aid for item in requirements for aid in item.assumption_ids}
    premise = [item for item in premise if item.assumption_id in rests_on]
    try:
        return _assemble(
            brief,
            # The primary reference is the authority on the name. The contract
            # requires the two to match, so deriving it removes a whole class
            # of failure where the model writes "Lima, Peru" in one field and
            # "Lima" in the other.
            primary_subject=next(
                reference.name
                for reference in scope.references
                if reference.role == "primary_subject"
            ),
            scope=scope,
            premise=premise,
            requirements=requirements,
        )
    except ValidationError as error:
        raise WorkOrderUnusable(
            "; ".join(
                f"{'.'.join(str(part) for part in item['loc']) or 'plan'}: {item['msg']}"
                for item in error.errors()
            )
            or "the research plan did not fit its contract",
            json.dumps(payload, ensure_ascii=False)[:4000],
        ) from error


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


# Words that name a thing with its own answer. Two of them on opposite sides of
# an "and" is the shape of a question that will come back half right.
#
# Deliberately does not include a date or an "as of when", because "What does a
# one-bedroom in Miraflores rent for, and as of when?" is one question -- a
# value and the date it was true always travel together, and that phrasing is
# the model answer in the prompt above.
_MEASURED_THINGS = (
    "fare",
    "price",
    "cost",
    "rate",
    "rent",
    "time",
    "minutes",
    "hours",
    "duration",
    "distance",
    "kilometres",
    "kilometers",
    "miles",
    "temperature",
    "population",
    "altitude",
    "elevation",
    "capacity",
    "count",
    "number of",
    "how many",
    "how long",
    "how far",
    "how much",
)


def bundled_question_note(question: str) -> str:
    """Say when a question looks like two, without refusing it.

    Run a2066506 asked for "the exact travel time in minutes AND the current
    fare in PEN". The fare is published; the journey time is not. One question,
    two facts, one status -- so the answered half was held hostage by the
    unanswered half, and the operator had to settle a question that was already
    half correct.

    Advisory, and it stays advisory. Whether two clauses have two answers is a
    judgement, and a check that refused a plan on a heuristic would reject good
    questions in a stage the operator is already reading line by line. They can
    strike this one and add two, which is the move the screen already offers.
    """
    lowered = question.casefold()
    halves = lowered.split(" and ")
    if len(halves) < 2:
        return ""
    measured = [
        half
        for half in halves
        if any(thing in half for thing in _MEASURED_THINGS)
    ]
    if len(measured) < 2:
        return ""
    return (
        "This asks for two things at once. One of them may be published and the "
        "other not, and a single question can only come back one way -- strike "
        "it and add the two halves separately."
    )


# What one research question costs, measured rather than guessed. Only two
# stored runs have complete intake accounting -- everything before PR #455
# recorded zero for the intake leg -- and those two agree to within one per
# cent across five questions of difference:
#
#   a2066506:  9 questions -> 133,882 tokens -> 14,876 each
#   b29d66b4: 14 questions -> 206,507 tokens -> 14,750 each
#
# Two points is a thin line to draw, and it is drawn here rather than in the
# operator's head.
RESEARCH_TOKENS_PER_QUESTION = 14_800

# Below this a work order is not an article, whatever the budget says.
MIN_WORKABLE_QUESTIONS = 5

# What the writing graph costs once research is done, median of the six stored
# runs that reached it: 89,707 / 125,299 / 143,166 / 161,897 / 166,027 /
# 173,801. Writing was counted correctly even on the runs whose intake was not.
WRITING_TOKENS_TYPICAL = 134_000


@dataclass(frozen=True)
class BudgetProjection:
    """What this many questions is likely to cost, and what it leaves.

    Run b29d66b4 planned fourteen questions, reached the settle node at
    370,114 tokens against a 320,000 ceiling, and had its one repair attempt
    refused on a 5/10 draft with four actionable revisions sitting there. The
    refusal was correct. What was missing is that nothing said so while the
    plan could still be changed -- and the cut step, where the operator strikes
    and adds questions, is where that belongs.
    """

    question_count: int
    spent: int
    projected_research: int
    projected_writing: int
    projected_total: int
    repair_reserve: int
    budget: int
    repair_affordable: bool
    questions_that_fit: int
    note: str


def budget_projection(
    question_count: int, tokens_spent: int | None
) -> BudgetProjection | None:
    """Say what this plan will cost before it is paid for.

    Returns nothing when the run has no token accounting, the same way
    `decide_repair` skips its budget check rather than treating an absent
    count as zero.
    """
    if tokens_spent is None or question_count <= 0:
        return None

    research = question_count * RESEARCH_TOKENS_PER_QUESTION
    total = tokens_spent + research + WRITING_TOKENS_TYPICAL
    affordable = total + P2B_REPAIR_ESTIMATED_TOKENS <= P2B_RUN_TOKEN_BUDGET
    room = (
        P2B_RUN_TOKEN_BUDGET
        - P2B_REPAIR_ESTIMATED_TOKENS
        - WRITING_TOKENS_TYPICAL
        - tokens_spent
    )
    fits = max(0, room // RESEARCH_TOKENS_PER_QUESTION)

    if affordable:
        note = (
            f"{question_count} questions projects to about {total:,} tokens "
            f"against a {P2B_RUN_TOKEN_BUDGET:,} ceiling, leaving room for "
            f"the one repair attempt."
        )
    elif fits >= MIN_WORKABLE_QUESTIONS:
        note = (
            f"{question_count} questions projects to about {total:,} tokens. "
            f"With the {P2B_REPAIR_ESTIMATED_TOKENS:,} a repair costs, that "
            f"passes the {P2B_RUN_TOKEN_BUDGET:,} ceiling, so this article "
            f"will not be able to repair itself. About {fits} questions would "
            f"leave room."
        )
    else:
        # Both fully accounted runs were refused their repair, at 260,586 and
        # 370,114. No plan worth writing fits, which makes this a question
        # about the ceiling rather than about the plan.
        note = (
            f"{question_count} questions projects to about {total:,} tokens, "
            f"past the {P2B_RUN_TOKEN_BUDGET:,} ceiling once the "
            f"{P2B_REPAIR_ESTIMATED_TOKENS:,} a repair costs is counted. Only "
            f"about {fits} questions would fit, which is not an article. This "
            f"is the ceiling being too low for the pipeline as it now bills, "
            f"not the plan being too large."
        )
    return BudgetProjection(
        question_count=question_count,
        spent=tokens_spent,
        projected_research=research,
        projected_writing=WRITING_TOKENS_TYPICAL,
        projected_total=total,
        repair_reserve=P2B_REPAIR_ESTIMATED_TOKENS,
        budget=P2B_RUN_TOKEN_BUDGET,
        repair_affordable=affordable,
        questions_that_fit=fits,
        note=note,
    )


def work_order_stage_record(
    work_order: Prompt2BlogWorkOrder,
    warnings: list[str] | None = None,
    tokens_spent: int | None = None,
) -> dict[str, Any]:
    """What the run keeps about the plan the operator approved."""
    projection = budget_projection(len(work_order.requirements), tokens_spent)
    return {
        # What this plan is about to cost, next to the decision that changes
        # it. The cut step had no price on it, so the difference between a run
        # that can fix its own article and one that cannot was being decided
        # invisibly.
        "budget_projection": asdict(projection) if projection else None,
        "work_order_fingerprint": work_order.work_order_fingerprint,
        "brief_fingerprint": work_order.brief_fingerprint,
        "primary_subject": work_order.primary_subject,
        "requirements": [
            {
                "requirement_id": item.requirement_id,
                "question": item.question,
                "kind": item.kind,
                "precision": item.precision,
                # Empty for a question that reads as one. Shown beside the
                # question rather than counted, because the operator is the one
                # who can tell.
                "bundled_note": bundled_question_note(item.question),
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
