"""Research readiness for Prompt2Blog v3.

The gate that makes thin research stop a run instead of starting one. It is
entirely deterministic: it can diagnose what is missing, and it can never write
the missing fact. `needs_research` is a real product state, not a failure, and
reaching it must not spend a single writer-model token.
"""

from __future__ import annotations

import json
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

from .contracts_v4 import ArticleBrief, Prompt2BlogWorkOrder
from .editorial_catalog import (
    ArticleFormRule,
    EditorialCatalog,
    SourceRequirement,
    load_editorial_catalog,
)
from .evidence_v3 import NormalizedEvidence, NormalizedSource

# Requirement status and claim confidence answer different questions, and a
# research desk that conflates them stalls on a question it has in fact
# answered: an issuing authority whose own site blocks automated retrieval held
# a real run's requirement at `partial` for three rounds while several
# independent sources agreed on the figure. Kept verbatim in step with the
# frontend's `REQUIREMENT_STATUS_RULES`; all three prompts must say the same
# thing.
REQUIREMENT_STATUS_RULES = """REQUIREMENT STATUS VERSUS CLAIM CONFIDENCE
These record two different things. Never conflate them.
- status describes the QUESTION. supported means linked claims answer the requirement's question; partial means part of that question is still unanswered; missing means none of it is answered; unpublished means you searched and no one has published an answer for anyone to find.
- confidence describes the ANSWER. high, medium, or low records how well corroborated that answer is.
- An answer you found and corroborated stays supported even when you could not reach the ideal primary source, the publisher blocks automated retrieval, or you would have preferred more evidence. Record that reservation as claim confidence medium or low and as a source note. Never downgrade the requirement to partial for it.
- Reserve partial and missing for a question more research could still close. Do not pad weak evidence, infer missing facts, or mark a requirement supported without linked claims.
- Use unpublished only after real searching, and only when the fact itself is unpublished rather than merely hard for you to reach. Name in gap exactly which authorities, documents, and dates you checked. Where a source states the limit of what it measures, record that as a claim and link it. unpublished does not block the run and will not be sent back to you, so a careless unpublished silently costs the article a fact.
- unpublished is about a fact nobody has published. It is not for a question that cannot be answered because the thing it asks about does not exist yet. That is a refuted premise, and the question stays missing."""

# Kept verbatim in step with the frontend's `PREMISE_CHECK_RULES`; the
# initial prompt, the follow-up prompt and the backend must all say this the
# same way.
PREMISE_CHECK_RULES = """PREMISE CHECK — SETTLE THIS BEFORE ANSWERING ANYTHING
The work order carries a premise: what the direction step assumed while unable to check it. Settle every entry before you answer a single question, and return one verdict for each.
- confirmed — you found it is so. Link the claim that shows it.
- refuted — you found it is not so. Say what is true instead, with the date where one applies. This is not a failed research round. It is the most useful thing you can return, because it stops an article that cannot be written.
- unverified — you searched properly and could settle it neither way. Name what you checked.
- basis is required on every verdict and names the authorities, documents and dates you checked.
- When a premise is refuted, stop. Do not answer the questions that rest on it, do not mark them unpublished, and do not substitute a nearby year, edition or subject that does exist. Leave those questions missing, and say in the gap which premise took them down."""

ReadinessStatus = Literal["ready", "needs_research"]
FindingCode = Literal[
    "requirement_gap",
    "unresolved_conflict",
    "source_gate",
    "nothing_answered",
    "premise_refuted",
    "premise_unverified",
]

_ATTRIBUTABLE_VOICE = {"transcript", "interview-responses"}


class ReadinessModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ReadinessFinding(ReadinessModel):
    code: FindingCode
    requirement_ids: list[str]
    message: str


class ResearchReadiness(ReadinessModel):
    status: ReadinessStatus
    findings: list[ReadinessFinding]
    unresolved_requirement_ids: list[str]
    unpublished_requirement_ids: list[str]
    unresolved_conflict_ids: list[str]
    missing_source_requirements: list[str]
    refuted_assumption_ids: list[str] = []
    unverified_assumption_ids: list[str] = []

    @property
    def ready(self) -> bool:
        return self.status == "ready"

    @property
    def requires_new_direction(self) -> bool:
        """Whether more research is the wrong thing to send the operator back to.

        A refuted premise is the one blocker research cannot clear. Offering a
        follow-up research prompt here is what made the original dead end feel
        like a loop: the operator researches, gets the same refutation, and
        researches again.
        """
        return bool(self.refuted_assumption_ids)


def evidence_satisfies_source_requirement(
    requirement: SourceRequirement,
    sources: list[NormalizedSource],
) -> bool:
    """Mirrors the composer's gate so a package cannot pass one side only."""
    if requirement == "reported-people-scenes-quotations":
        has_attributable_voice = any(
            source.material_type in _ATTRIBUTABLE_VOICE for source in sources
        )
        has_documented_scene = any(
            source.source_type in {"reporting", "firsthand"} for source in sources
        )
        return has_attributable_voice and has_documented_scene
    if requirement == "attributable-responses":
        return any(source.material_type in _ATTRIBUTABLE_VOICE for source in sources)
    if requirement == "first-person-material":
        return any(source.material_type == "first-person-notes" for source in sources)
    return any(
        source.material_type == "evaluation-notes" or source.source_type == "firsthand"
        for source in sources
    )


def _form_rule(
    brief: ArticleBrief,
    catalog: EditorialCatalog,
) -> ArticleFormRule:
    form = next((item for item in catalog.forms if item.id == brief.form_id), None)
    if form is None:
        raise ValueError(f"Unknown article form: {brief.form_id}")
    return form


def assess_research_readiness(
    brief: ArticleBrief,
    work_order: Prompt2BlogWorkOrder,
    evidence: NormalizedEvidence,
    *,
    catalog: EditorialCatalog | None = None,
) -> ResearchReadiness:
    """Reports every reason this evidence cannot support this work order."""
    catalog = catalog or load_editorial_catalog()
    form = _form_rule(brief, catalog)

    findings: list[ReadinessFinding] = []

    statements = {item.assumption_id: item.statement for item in work_order.premise}
    refuted_ids = evidence.refuted_assumption_ids()
    unverified_ids = evidence.unverified_assumption_ids()
    basis_by_id = {
        finding.assumption_id: finding.basis for finding in evidence.premise_findings
    }
    # Reported first, because it is the cause and everything below it is the
    # symptom. Five questions about an unpublished ranking produced five
    # identical complaints and never once said the ranking was the problem.
    for assumption_id in refuted_ids:
        findings.append(
            ReadinessFinding(
                code="premise_refuted",
                requirement_ids=evidence.requirement_ids_resting_on({assumption_id}),
                message=(
                    f"{statements.get(assumption_id, assumption_id)} — that is not "
                    f"so. {basis_by_id.get(assumption_id, '')}".strip()
                ),
            )
        )
    for assumption_id in unverified_ids:
        findings.append(
            ReadinessFinding(
                code="premise_unverified",
                requirement_ids=evidence.requirement_ids_resting_on({assumption_id}),
                message=(
                    f"{statements.get(assumption_id, assumption_id)} — research "
                    f"could not settle this either way. "
                    f"{basis_by_id.get(assumption_id, '')}".strip()
                ),
            )
        )

    # A question left open by a premise that turned out to be false is not its
    # own problem to solve, and listing it as one is how the operator ends up
    # researching five dead questions instead of changing direction once.
    doomed_requirement_ids = set(
        evidence.requirement_ids_resting_on(set(refuted_ids))
    )
    for requirement in evidence.requirements:
        # `unpublished` is a reported result, not a gap to chase. It is still
        # visible to the operator through `unpublished_requirement_ids`.
        if requirement.status in {"supported", "unpublished"}:
            continue
        if requirement.requirement_id in doomed_requirement_ids:
            continue
        findings.append(
            ReadinessFinding(
                code="requirement_gap",
                requirement_ids=[requirement.requirement_id],
                message=requirement.gap
                or f"Requirement {requirement.requirement_id} is incomplete.",
            )
        )

    claims_by_id = {claim.claim_id: claim for claim in evidence.claims}
    for conflict in evidence.conflicts:
        if (conflict.get("resolution") or "").strip():
            continue
        requirement_ids = sorted(
            {
                requirement_id
                for claim_id in conflict["claim_ids"]
                for requirement_id in (
                    claims_by_id[claim_id].requirement_ids
                    if claim_id in claims_by_id
                    else []
                )
            }
        )
        findings.append(
            ReadinessFinding(
                code="unresolved_conflict",
                requirement_ids=requirement_ids,
                message=conflict["summary"],
            )
        )

    # Backstop against a research desk that escapes the gate by declaring every
    # question unpublished: an article where nothing at all was findable has
    # nothing to write. A refuted premise already said why, in words that name
    # the cause, so this does not pile a second sentence on top of it.
    if (
        evidence.requirements
        and not refuted_ids
        and not any(
            requirement.status == "supported" for requirement in evidence.requirements
        )
    ):
        findings.append(
            ReadinessFinding(
                code="nothing_answered",
                requirement_ids=[
                    requirement.requirement_id for requirement in evidence.requirements
                ],
                message=(
                    "No question was answered, so there is nothing to write from."
                ),
            )
        )

    missing_gates = [
        requirement
        for requirement in form.source_requirements
        if not evidence_satisfies_source_requirement(requirement, evidence.sources)
    ]
    findings.extend(
        ReadinessFinding(
            code="source_gate",
            requirement_ids=[],
            message=f"The {form.id} form still needs {requirement}.",
        )
        for requirement in missing_gates
    )

    return ResearchReadiness(
        status="needs_research" if findings else "ready",
        findings=findings,
        # "Unresolved" has always meant work research could still close, which
        # is why `unpublished` is not in it. A question whose premise turned out
        # to be false is not closable either, and listing it here sent the
        # operator back out after five questions that no longer exist.
        unresolved_requirement_ids=[
            requirement_id
            for requirement_id in evidence.unresolved_requirement_ids()
            if requirement_id not in doomed_requirement_ids
        ],
        unpublished_requirement_ids=evidence.unpublished_requirement_ids(),
        unresolved_conflict_ids=evidence.unresolved_conflict_ids(),
        missing_source_requirements=list(missing_gates),
        refuted_assumption_ids=list(refuted_ids),
        unverified_assumption_ids=list(unverified_ids),
    )


def build_follow_up_research_prompt(
    brief: ArticleBrief,
    work_order: Prompt2BlogWorkOrder,
    evidence: NormalizedEvidence,
    readiness: ResearchReadiness,
    *,
    catalog: EditorialCatalog | None = None,
) -> str:
    """Builds the prompt that closes exactly the gaps the gate reported."""
    catalog = catalog or load_editorial_catalog()
    form = _form_rule(brief, catalog)
    modules_by_id = {module.id: module for module in catalog.topic_modules}

    unresolved_ids = set(readiness.unresolved_requirement_ids)
    for finding in readiness.findings:
        unresolved_ids.update(finding.requirement_ids)
    for gap in evidence.gaps:
        unresolved_ids.update(gap["requirement_ids"])
    # Findings and reported gaps can both name a question the desk already
    # established as unpublished. Re-asking it returns the same sentence and
    # costs another full-package round, so it never reaches the prompt.
    unpublished_ids = set(readiness.unpublished_requirement_ids)
    unresolved_ids -= unpublished_ids
    # A question resting on a refuted premise is not unresolved research, it is
    # a question about something that does not exist. Asking again returns the
    # same refutation at full package cost, which is the loop this exists to end.
    refuted_ids = set(readiness.refuted_assumption_ids)
    unresolved_ids -= set(evidence.requirement_ids_resting_on(refuted_ids))

    statements = {item.assumption_id: item.statement for item in work_order.premise}
    basis_by_id = {
        finding.assumption_id: finding.basis for finding in evidence.premise_findings
    }
    refuted_lines = (
        "\n".join(
            f"- {assumption_id} — {statements.get(assumption_id, assumption_id)} "
            f"[what research found: {basis_by_id.get(assumption_id, 'no basis recorded')}]"
            for assumption_id in readiness.refuted_assumption_ids
        )
        or "- None."
    )
    unverified_lines = (
        "\n".join(
            f"- {assumption_id} — {statements.get(assumption_id, assumption_id)} "
            f"[what was checked: {basis_by_id.get(assumption_id, 'no basis recorded')}]"
            for assumption_id in readiness.unverified_assumption_ids
        )
        or "- None."
    )

    unpublished_gaps = {
        requirement.requirement_id: requirement.gap
        for requirement in evidence.requirements
        if requirement.status == "unpublished"
    }
    unpublished_lines = (
        "\n".join(
            f"- {requirement.requirement_id} — {requirement.question}"
            + (
                f" [what was checked: {unpublished_gaps[requirement.requirement_id]}]"
                if unpublished_gaps.get(requirement.requirement_id)
                else ""
            )
            for requirement in work_order.requirements
            if requirement.requirement_id in unpublished_ids
        )
        or "- None."
    )

    requirement_lines = (
        "\n".join(
            f"- {requirement.requirement_id} — {requirement.question}"
            for requirement in work_order.requirements
            if requirement.requirement_id in unresolved_ids
        )
        or "- None beyond the source-gate or conflict work below."
    )
    conflict_lines = (
        "\n".join(
            f"- {conflict['conflict_id']} — {conflict['summary']}"
            for conflict in evidence.conflicts
            if not (conflict.get("resolution") or "").strip()
        )
        or "- None."
    )
    finding_lines = (
        "\n".join(
            f"- {finding.code} — {finding.message}"
            + (
                f" [requirements: {', '.join(finding.requirement_ids)}]"
                if finding.requirement_ids
                else ""
            )
            for finding in readiness.findings
        )
        or "- None."
    )
    gate_lines = (
        "\n".join(
            f"- {requirement}"
            + (
                " — unresolved"
                if requirement in readiness.missing_source_requirements
                else " — already satisfied; preserve the supporting evidence"
            )
            for requirement in form.source_requirements
        )
        or "- None."
    )
    module_lines = (
        "\n".join(
            f"- {modules_by_id[module_id].id} ({modules_by_id[module_id].label}) — "
            f"{modules_by_id[module_id].description}"
            for module_id in brief.topic_module_ids
            if module_id in modules_by_id
        )
        or "- None."
    )
    locked_work_order = json.dumps(
        work_order.model_dump(mode="json"), indent=2, ensure_ascii=False
    )

    return f"""You are completing unresolved research for an approved travel work order. Return a complete replacement evidence package, not a patch.

AUTHORITY LOCK
The locked work order remains read-only authority.
- Keep work_order_fingerprint exactly as supplied.
- Do not change the form, primary subject, scope, reference roles, requirements, exclusions, audience, title, location, or approved direction.
- Do not add a comparator, promote a context-only reference, or broaden scope.
- Research only the unresolved work listed below. Do not write the article.

LOCKED COMMISSION
{locked_work_order}

CURRENT EVIDENCE RECORDS
{evidence.records_text}

UNRESOLVED REQUIREMENTS ONLY
{requirement_lines}

SETTLED AS FALSE — DO NOT RESEARCH, DO NOT WORK AROUND
{refuted_lines}
Keep these refuted with their existing basis. The questions resting on them stay missing. Do not answer them from a different year, edition, or subject that does exist, and do not mark them unpublished.

STILL UNSETTLED PREMISE
{unverified_lines}
These are worth one more attempt. Settle each as confirmed or refuted if you can, and leave it unverified only if you genuinely cannot.

ALREADY ESTABLISHED AS UNPUBLISHED
{unpublished_lines}
Keep these exactly as unpublished with their existing gap text. Do not search them again and do not downgrade them to partial or missing.

UNRESOLVED CONFLICTS ONLY
{conflict_lines}

READINESS FINDINGS
{finding_lines}

ACTIVE FORM SOURCE GATES
{gate_lines}
Meet unresolved gates with genuine matching material. Never simulate interviews, first-person experience, documented evaluation, scenes, or quotations.

ACTIVE TOPIC MODULES
{module_lines}

REPLACEMENT RULES
- Do not redo or weaken already supported work. Preserve valid existing sources, claims, requirement links, dates, metadata, and resolved conflicts.
- Add or revise only what is needed to close the listed requirements, conflicts, findings, and source gates.
- Set requirement status and claim confidence by the rules below, including for work this follow-up still cannot close.
- Keep every locked requirement exactly once in requirements, including already supported requirements.
- Keep one premise finding for every entry in the locked premise, including the ones already settled.
- Keep source and claim mappings resolvable in both directions. Web and report sources require publisher and URL.
- Preserve exact material_type so source-gate readiness stays deterministic.

{PREMISE_CHECK_RULES}

{REQUIREMENT_STATUS_RULES}"""


def needs_research_payload(
    brief: ArticleBrief,
    work_order: Prompt2BlogWorkOrder,
    evidence: NormalizedEvidence,
    readiness: ResearchReadiness,
    *,
    catalog: EditorialCatalog | None = None,
) -> dict[str, Any]:
    """The terminal result a stopped run reports. No writing stage has run."""
    catalog = catalog or load_editorial_catalog()
    questions = {
        requirement.requirement_id: requirement.question
        for requirement in work_order.requirements
    }
    gaps_by_requirement = {
        requirement.requirement_id: requirement.gap
        for requirement in evidence.requirements
    }
    return {
        "status": "needs_research",
        "work_order_fingerprint": work_order.work_order_fingerprint,
        "findings": [finding.model_dump() for finding in readiness.findings],
        "unresolved_requirements": [
            {
                "requirement_id": requirement_id,
                "question": questions[requirement_id],
                "gap": gaps_by_requirement.get(requirement_id, ""),
            }
            for requirement_id in readiness.unresolved_requirement_ids
        ],
        "unpublished_requirements": [
            {
                "requirement_id": requirement_id,
                "question": questions[requirement_id],
                "gap": gaps_by_requirement.get(requirement_id, ""),
            }
            for requirement_id in readiness.unpublished_requirement_ids
        ],
        "unresolved_conflict_ids": list(readiness.unresolved_conflict_ids),
        "missing_source_requirements": list(readiness.missing_source_requirements),
        # The operator's route out. More research closes everything else on this
        # payload; only a different direction closes a refuted premise, and the
        # page has to be able to tell the two apart.
        "requires_new_direction": readiness.requires_new_direction,
        "refuted_premise": [
            {
                "assumption_id": finding.assumption_id,
                "statement": finding.statement,
                "basis": finding.basis,
                "requirement_ids": evidence.requirement_ids_resting_on(
                    {finding.assumption_id}
                ),
            }
            for finding in evidence.premise_findings
            if finding.verdict == "refuted"
        ],
        "unverified_premise": [
            {
                "assumption_id": finding.assumption_id,
                "statement": finding.statement,
                "basis": finding.basis,
                "requirement_ids": evidence.requirement_ids_resting_on(
                    {finding.assumption_id}
                ),
            }
            for finding in evidence.premise_findings
            if finding.verdict == "unverified"
        ],
        "follow_up_research_prompt": build_follow_up_research_prompt(
            brief, work_order, evidence, readiness, catalog=catalog
        ),
    }
