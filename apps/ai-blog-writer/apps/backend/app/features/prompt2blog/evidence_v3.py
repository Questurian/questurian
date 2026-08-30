"""Deterministic normalization of a v3 evidence package.

Normalization only reshapes what research already returned. It never adds,
summarizes away, or repairs a fact: publisher, URL, dates, and the exact notes
have to survive into grounding, so every downstream stage compares a draft with
the same records the researcher supplied.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict

from .contracts_v4 import (
    EvidenceClaim,
    EvidencePackage,
    EvidenceSource,
    Prompt2BlogWorkOrder,
)


class NormalizedModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class NormalizedSource(NormalizedModel):
    source_id: str
    title: str
    publisher: str | None
    url: str | None
    published_at: str | None
    retrieved_at: str
    source_type: str
    material_type: str
    notes: list[str]
    citation: str


class NormalizedClaim(NormalizedModel):
    claim_id: str
    text: str
    source_ids: list[str]
    requirement_ids: list[str]
    as_of: str | None
    confidence: str


class NormalizedRequirement(NormalizedModel):
    requirement_id: str
    question: str
    status: str
    claim_ids: list[str]
    gap: str
    assumption_ids: list[str]


class NormalizedPremiseFinding(NormalizedModel):
    assumption_id: str
    statement: str
    verdict: str
    basis: str
    claim_ids: list[str]


class NormalizedEvidence(NormalizedModel):
    sources: list[NormalizedSource]
    claims: list[NormalizedClaim]
    requirements: list[NormalizedRequirement]
    premise_findings: list[NormalizedPremiseFinding]
    conflicts: list[dict[str, Any]]
    gaps: list[dict[str, Any]]
    records_text: str

    def refuted_assumption_ids(self) -> list[str]:
        """Premises research established are false.

        No amount of further research closes one of these. The question is not
        hard, it is about something that does not exist, and the only move left
        is a different editorial direction.
        """
        return [
            finding.assumption_id
            for finding in self.premise_findings
            if finding.verdict == "refuted"
        ]

    def unverified_assumption_ids(self) -> list[str]:
        """Premises research could neither confirm nor refute.

        Unlike a refutation these are worth asking again: a second desk, or a
        source the first could not reach, can still settle them.
        """
        return [
            finding.assumption_id
            for finding in self.premise_findings
            if finding.verdict == "unverified"
        ]

    def requirement_ids_resting_on(self, assumption_ids: set[str]) -> list[str]:
        """Questions that cannot survive those premises being wrong."""
        return [
            requirement.requirement_id
            for requirement in self.requirements
            if set(requirement.assumption_ids) & assumption_ids
        ]

    def unresolved_requirement_ids(self) -> list[str]:
        """Questions more research could still close.

        `unpublished` is deliberately not one of them. The desk already checked
        and reported that nobody publishes the answer; asking again returns the
        same sentence and costs another long prompt.
        """
        return [
            requirement.requirement_id
            for requirement in self.requirements
            if requirement.status not in {"supported", "unpublished"}
        ]

    def unpublished_requirement_ids(self) -> list[str]:
        return [
            requirement.requirement_id
            for requirement in self.requirements
            if requirement.status == "unpublished"
        ]

    def unresolved_conflict_ids(self) -> list[str]:
        return [
            conflict["conflict_id"]
            for conflict in self.conflicts
            if not (conflict.get("resolution") or "").strip()
        ]

    def receipt(self) -> dict[str, Any]:
        """The evidence facts a finished run has to be able to show later."""
        return {
            "source_ids": [source.source_id for source in self.sources],
            "claim_ids": [claim.claim_id for claim in self.claims],
            "requirement_status": {
                requirement.requirement_id: requirement.status
                for requirement in self.requirements
            },
            "unresolved_requirement_ids": self.unresolved_requirement_ids(),
            "unpublished_requirement_ids": self.unpublished_requirement_ids(),
            "unresolved_conflict_ids": self.unresolved_conflict_ids(),
            "premise_verdicts": {
                finding.assumption_id: finding.verdict
                for finding in self.premise_findings
            },
        }


def _citation(source: EvidenceSource) -> str:
    parts = [source.title]
    if source.publisher:
        parts.append(source.publisher)
    if source.published_at:
        parts.append(f"published {source.published_at.isoformat()}")
    parts.append(f"retrieved {source.retrieved_at.isoformat()}")
    if source.url:
        parts.append(str(source.url))
    return " — ".join(parts)


def _normalize_source(source: EvidenceSource) -> NormalizedSource:
    return NormalizedSource(
        source_id=source.source_id,
        title=source.title,
        publisher=source.publisher,
        url=str(source.url) if source.url else None,
        published_at=source.published_at.isoformat() if source.published_at else None,
        retrieved_at=source.retrieved_at.isoformat(),
        source_type=source.source_type,
        material_type=source.material_type,
        # Notes are the researcher's exact words and are copied, never rewritten.
        notes=list(source.notes),
        citation=_citation(source),
    )


def _normalize_claim(claim: EvidenceClaim) -> NormalizedClaim:
    return NormalizedClaim(
        claim_id=claim.claim_id,
        text=claim.text,
        source_ids=list(claim.source_ids),
        requirement_ids=list(claim.requirement_ids),
        as_of=claim.as_of.isoformat() if claim.as_of else None,
        confidence=claim.confidence,
    )


def _records_text(
    sources: list[NormalizedSource],
    claims: list[NormalizedClaim],
    requirements: list[NormalizedRequirement],
    premise_findings: list[NormalizedPremiseFinding],
    conflicts: list[dict[str, Any]],
    gaps: list[dict[str, Any]],
) -> str:
    lines: list[str] = ["SOURCES"]
    if sources:
        for source in sources:
            lines.append(
                f"- {source.source_id} | {source.citation} "
                f"| type: {source.source_type} | material: {source.material_type}"
            )
            lines.extend(f"    note: {note}" for note in source.notes)
    else:
        lines.append("- None supplied.")

    lines.append("")
    lines.append("CLAIMS")
    if claims:
        for claim in claims:
            as_of = f" | as of {claim.as_of}" if claim.as_of else ""
            lines.append(
                f"- {claim.claim_id} | {claim.text} "
                f"| sources: {', '.join(claim.source_ids)} "
                f"| requirements: {', '.join(claim.requirement_ids)}"
                f"{as_of} | confidence: {claim.confidence}"
            )
    else:
        lines.append("- None supplied.")

    lines.append("")
    lines.append("REQUIREMENT COVERAGE")
    for requirement in requirements:
        claim_ids = ", ".join(requirement.claim_ids) or "none"
        gap = f" | gap: {requirement.gap}" if requirement.gap else ""
        # The status word alone left the writer to guess what `unpublished`
        # means for the draft. Spelled out here, because the one thing it must
        # never produce is prose explaining what could not be found.
        status = (
            "unpublished (searched for and no one publishes an answer; "
            "write around it and never mention the absence)"
            if requirement.status == "unpublished"
            else requirement.status
        )
        lines.append(
            f"- {requirement.requirement_id} | {requirement.question} "
            f"| status: {status} | claims: {claim_ids}{gap}"
        )

    if premise_findings:
        lines.append("")
        lines.append("WHAT THE COMMISSION ASSUMED, AND WHAT RESEARCH FOUND")
        for finding in premise_findings:
            claim_ids = ", ".join(finding.claim_ids) or "none"
            lines.append(
                f"- {finding.assumption_id} | {finding.statement} "
                f"| verdict: {finding.verdict} | basis: {finding.basis} "
                f"| claims: {claim_ids}"
            )

    lines.append("")
    lines.append("CONFLICTS")
    if conflicts:
        for conflict in conflicts:
            resolution = (conflict.get("resolution") or "").strip() or "unresolved"
            lines.append(
                f"- {conflict['conflict_id']} | {conflict['summary']} "
                f"| claims: {', '.join(conflict['claim_ids'])} "
                f"| resolution: {resolution}"
            )
    else:
        lines.append("- None reported.")

    lines.append("")
    lines.append("REPORTED GAPS")
    if gaps:
        for gap in gaps:
            lines.append(
                f"- {gap['gap_id']} | {gap['summary']} "
                f"| requirements: {', '.join(gap['requirement_ids'])}"
            )
    else:
        lines.append("- None reported.")

    return "\n".join(lines)


def normalize_evidence(
    work_order: Prompt2BlogWorkOrder,
    evidence_package: EvidencePackage,
) -> NormalizedEvidence:
    """Reshapes an already-validated package into the records every stage reads."""
    questions = {
        requirement.requirement_id: requirement.question
        for requirement in work_order.requirements
    }
    missing_questions = [
        requirement.requirement_id
        for requirement in evidence_package.requirements
        if requirement.requirement_id not in questions
    ]
    if missing_questions:
        raise ValueError(
            "evidence requirements are not part of the work order: "
            f"{sorted(missing_questions)}"
        )

    sources = [_normalize_source(source) for source in evidence_package.sources]
    claims = [_normalize_claim(claim) for claim in evidence_package.claims]
    # Work order order is the authority; a researcher's ordering never
    # reorders the locked requirements.
    status_by_id = {
        requirement.requirement_id: requirement
        for requirement in evidence_package.requirements
    }
    requirements = [
        NormalizedRequirement(
            requirement_id=requirement.requirement_id,
            question=requirement.question,
            status=status_by_id[requirement.requirement_id].status,
            claim_ids=list(status_by_id[requirement.requirement_id].claim_ids),
            gap=status_by_id[requirement.requirement_id].gap,
            assumption_ids=list(requirement.assumption_ids),
        )
        for requirement in work_order.requirements
    ]
    conflicts = [conflict.model_dump() for conflict in evidence_package.conflicts]
    gaps = [gap.model_dump() for gap in evidence_package.gaps]

    # Work order order again: the premise reads in the order the editor
    # approved it, whatever order research answered in.
    verdict_by_id = {
        finding.assumption_id: finding
        for finding in evidence_package.premise_findings
    }
    premise_findings = [
        NormalizedPremiseFinding(
            assumption_id=assumption.assumption_id,
            statement=assumption.statement,
            verdict=verdict_by_id[assumption.assumption_id].verdict,
            basis=verdict_by_id[assumption.assumption_id].basis,
            claim_ids=list(verdict_by_id[assumption.assumption_id].claim_ids),
        )
        for assumption in work_order.premise
        if assumption.assumption_id in verdict_by_id
    ]

    return NormalizedEvidence(
        sources=sources,
        claims=claims,
        requirements=requirements,
        premise_findings=premise_findings,
        conflicts=conflicts,
        gaps=gaps,
        records_text=_records_text(
            sources, claims, requirements, premise_findings, conflicts, gaps
        ),
    )
