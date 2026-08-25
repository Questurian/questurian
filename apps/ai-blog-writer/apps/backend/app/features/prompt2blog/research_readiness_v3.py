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

from .contracts_v3 import Prompt2BlogCommission
from .editorial_catalog import (
    ArticleFormRule,
    EditorialCatalog,
    SourceRequirement,
    load_editorial_catalog,
)
from .evidence_v3 import NormalizedEvidence, NormalizedSource

ReadinessStatus = Literal["ready", "needs_research"]
FindingCode = Literal["requirement_gap", "unresolved_conflict", "source_gate"]

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
    unresolved_conflict_ids: list[str]
    missing_source_requirements: list[str]

    @property
    def ready(self) -> bool:
        return self.status == "ready"


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
    commission: Prompt2BlogCommission,
    catalog: EditorialCatalog,
) -> ArticleFormRule:
    form = next((item for item in catalog.forms if item.id == commission.form_id), None)
    if form is None:
        raise ValueError(f"Unknown article form: {commission.form_id}")
    return form


def assess_research_readiness(
    commission: Prompt2BlogCommission,
    evidence: NormalizedEvidence,
    *,
    catalog: EditorialCatalog | None = None,
) -> ResearchReadiness:
    """Reports every reason this evidence cannot support this commission."""
    catalog = catalog or load_editorial_catalog()
    form = _form_rule(commission, catalog)

    findings: list[ReadinessFinding] = []
    for requirement in evidence.requirements:
        if requirement.status == "supported":
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
        unresolved_requirement_ids=evidence.unresolved_requirement_ids(),
        unresolved_conflict_ids=evidence.unresolved_conflict_ids(),
        missing_source_requirements=list(missing_gates),
    )


def build_follow_up_research_prompt(
    commission: Prompt2BlogCommission,
    evidence: NormalizedEvidence,
    readiness: ResearchReadiness,
    *,
    catalog: EditorialCatalog | None = None,
) -> str:
    """Builds the prompt that closes exactly the gaps the gate reported."""
    catalog = catalog or load_editorial_catalog()
    form = _form_rule(commission, catalog)
    modules_by_id = {module.id: module for module in catalog.topic_modules}

    unresolved_ids = set(readiness.unresolved_requirement_ids)
    for finding in readiness.findings:
        unresolved_ids.update(finding.requirement_ids)
    for gap in evidence.gaps:
        unresolved_ids.update(gap["requirement_ids"])

    requirement_lines = (
        "\n".join(
            f"- {requirement.requirement_id} — {requirement.question}"
            for requirement in commission.requirements
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
            for module_id in commission.topic_module_ids
            if module_id in modules_by_id
        )
        or "- None."
    )
    locked_commission = json.dumps(
        commission.model_dump(mode="json"), indent=2, ensure_ascii=False
    )

    return f"""You are completing unresolved research for an approved travel commission. Return a complete replacement evidence package, not a patch.

AUTHORITY LOCK
The locked commission remains read-only authority.
- Keep commission_fingerprint exactly as supplied.
- Do not change the form, primary subject, scope, reference roles, requirements, exclusions, audience, title, location, or approved direction.
- Do not add a comparator, promote a context-only reference, or broaden scope.
- Research only the unresolved work listed below. Do not write the article.

LOCKED COMMISSION
{locked_commission}

CURRENT EVIDENCE RECORDS
{evidence.records_text}

UNRESOLVED REQUIREMENTS ONLY
{requirement_lines}

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
- Use partial or missing honestly when the follow-up still cannot close a gap.
- Keep every locked requirement exactly once in requirements, including already supported requirements.
- Keep source and claim mappings resolvable in both directions. Web and report sources require publisher and URL.
- Preserve exact material_type so source-gate readiness stays deterministic."""


def needs_research_payload(
    commission: Prompt2BlogCommission,
    evidence: NormalizedEvidence,
    readiness: ResearchReadiness,
    *,
    catalog: EditorialCatalog | None = None,
) -> dict[str, Any]:
    """The terminal result a stopped run reports. No writing stage has run."""
    catalog = catalog or load_editorial_catalog()
    questions = {
        requirement.requirement_id: requirement.question
        for requirement in commission.requirements
    }
    gaps_by_requirement = {
        requirement.requirement_id: requirement.gap
        for requirement in evidence.requirements
    }
    return {
        "status": "needs_research",
        "commission_fingerprint": commission.commission_fingerprint,
        "findings": [finding.model_dump() for finding in readiness.findings],
        "unresolved_requirements": [
            {
                "requirement_id": requirement_id,
                "question": questions[requirement_id],
                "gap": gaps_by_requirement.get(requirement_id, ""),
            }
            for requirement_id in readiness.unresolved_requirement_ids
        ],
        "unresolved_conflict_ids": list(readiness.unresolved_conflict_ids),
        "missing_source_requirements": list(readiness.missing_source_requirements),
        "follow_up_research_prompt": build_follow_up_research_prompt(
            commission, evidence, readiness, catalog=catalog
        ),
    }
