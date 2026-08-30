"""Strict version-three editorial contracts for Prompt2Blog.

The active v2 request remains in ``models.py``. These models establish the new
domain without adapting it into the legacy pipeline or changing runtime flow.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator


ArticleFormId = Literal[
    "news-report",
    "analysis",
    "explainer",
    "feature-profile",
    "interview-qa",
    "opinion-column",
    "personal-essay-travelogue",
    "destination-guide",
    "service-guide",
    "itinerary",
    "curated-list-best-of",
    "comparison",
    "review",
    "how-to-checklist",
    "cost-budget-breakdown",
]
TopicModuleId = Literal[
    "cost-affordability",
    "accommodation-neighborhoods",
    "food-drink",
    "transportation",
    "safety",
    "visa-entry",
    "seasonality-weather",
    "adventure-outdoors",
    "long-stay-remote-work",
    "culture-etiquette",
]
AudienceTagId = Literal[
    "first-time-visitor",
    "solo-traveler",
    "family",
    "remote-worker-relocator",
    "accessibility-needs",
    "budget-focused",
    "premium-focused",
]
ScopeMode = Literal["single_subject", "head_to_head", "ranked_set"]
ReferenceRole = Literal["primary_subject", "context_only", "comparator"]
EvidenceSourceType = Literal[
    "official", "reporting", "specialist", "firsthand", "other"
]
EvidenceMaterialType = Literal[
    "web",
    "report",
    "transcript",
    "interview-responses",
    "first-person-notes",
    "evaluation-notes",
    "other",
]
EvidenceConfidence = Literal["high", "medium", "low"]
# `unpublished` is the exit a research desk previously did not have. A question
# nobody has ever published an answer to — Lima's customs processing minutes, for
# either terminal — could only be reported as `partial`, which blocked the run and
# sent the operator back to ask again for a fact that does not exist. It is a
# finding, not a failure: the article omits the number without narrating the gap.
EvidenceRequirementStatus = Literal["supported", "partial", "missing", "unpublished"]
# What research found when it went to check what the direction step assumed.
#
# `refuted` is the verdict that had nowhere to live. A question about a ranking
# that has not been published yet is not unpublished — the ranking's prices and
# dishes are published in abundance — it is a question about something that does
# not exist. Conflating the two sent an operator looking for a fact instead of
# a different direction.
PremiseVerdict = Literal["confirmed", "refuted", "unverified"]
CreativityLevel = Literal["low", "medium", "high"]


def _require_unique(values: list[str], label: str) -> None:
    if len(set(values)) != len(values):
        raise ValueError(f"{label} values must be unique")


class V3ContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class CommissionAudience(V3ContractModel):
    primary_reader: str = Field(min_length=1)
    tags: list[AudienceTagId] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_unique_tags(self) -> "CommissionAudience":
        _require_unique(self.tags, "audience tag")
        return self


class CommissionReference(V3ContractModel):
    name: str = Field(min_length=1)
    role: ReferenceRole


class CommissionScope(V3ContractModel):
    mode: ScopeMode
    references: list[CommissionReference] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_roles_for_mode(self) -> "CommissionScope":
        _require_unique(
            [reference.name.casefold() for reference in self.references],
            "reference name",
        )
        primary_count = sum(
            reference.role == "primary_subject" for reference in self.references
        )
        if primary_count != 1:
            raise ValueError("scope must contain exactly one primary_subject")

        comparator_count = sum(
            reference.role == "comparator" for reference in self.references
        )
        if self.mode == "single_subject" and comparator_count:
            raise ValueError("single_subject scope cannot contain comparators")
        if self.mode == "head_to_head" and comparator_count < 1:
            raise ValueError("head_to_head scope requires a comparator")
        if self.mode == "ranked_set" and comparator_count < 2:
            raise ValueError("ranked_set scope requires at least two comparators")
        return self


class CommissionAssumption(V3ContractModel):
    """One thing the direction step took as true without being able to check it.

    The direction model is forbidden to browse, so every fact it builds on is
    unverified by construction. Declaring them is what lets a later step refute
    one instead of discovering the refutation five unanswerable questions in.
    """

    assumption_id: str = Field(min_length=1)
    statement: str = Field(min_length=1)


class CommissionRequirement(V3ContractModel):
    requirement_id: str = Field(min_length=1)
    question: str = Field(min_length=1)
    # Empty when the question stands on its own. Every id here must name a
    # premise the same commission declares.
    assumption_ids: list[str] = Field(default_factory=list)


class Prompt2BlogCommission(V3ContractModel):
    schema_version: Literal[3] = 3
    commission_fingerprint: str = Field(min_length=1)
    original_title: str = Field(min_length=1)
    location: str = Field(min_length=1)
    approved_direction: str = Field(min_length=1)
    form_id: ArticleFormId
    topic_module_ids: list[TopicModuleId] = Field(default_factory=list, max_length=4)
    audience: CommissionAudience
    core_reader_question: str = Field(min_length=1)
    reader_outcome: str = Field(min_length=1)
    primary_subject: str = Field(min_length=1)
    scope: CommissionScope
    premise: list[CommissionAssumption] = Field(default_factory=list)
    requirements: list[CommissionRequirement] = Field(min_length=1)
    exclusions: list[str] = Field(default_factory=list)
    call_to_action: str | None = None

    @model_validator(mode="after")
    def validate_commission_identity(self) -> "Prompt2BlogCommission":
        _require_unique(self.topic_module_ids, "topic module")
        primary_reference = next(
            reference
            for reference in self.scope.references
            if reference.role == "primary_subject"
        )
        if primary_reference.name.casefold() != self.primary_subject.casefold():
            raise ValueError("primary_subject must match the primary reference")
        _require_unique(
            [item.requirement_id for item in self.requirements],
            "requirement_id",
        )
        _require_unique(
            [item.assumption_id for item in self.premise],
            "assumption_id",
        )
        declared = {item.assumption_id for item in self.premise}
        for requirement in self.requirements:
            unknown = sorted(set(requirement.assumption_ids) - declared)
            if unknown:
                raise ValueError(
                    f"requirement {requirement.requirement_id} depends on "
                    f"undeclared assumptions: {', '.join(unknown)}"
                )
        return self


class EvidenceSource(V3ContractModel):
    source_id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    publisher: str | None = None
    url: HttpUrl | None = None
    published_at: date | None = None
    retrieved_at: date
    source_type: EvidenceSourceType
    material_type: EvidenceMaterialType
    notes: list[str] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_external_metadata(self) -> "EvidenceSource":
        if self.material_type in {"web", "report"} and (
            not self.publisher or not self.url
        ):
            raise ValueError("web and report sources require publisher and url")
        return self


class EvidenceClaim(V3ContractModel):
    claim_id: str = Field(min_length=1)
    text: str = Field(min_length=1)
    source_ids: list[str] = Field(min_length=1)
    requirement_ids: list[str] = Field(min_length=1)
    as_of: date | None = None
    confidence: EvidenceConfidence

    @model_validator(mode="after")
    def validate_unique_links(self) -> "EvidenceClaim":
        _require_unique(self.source_ids, "claim source reference")
        _require_unique(self.requirement_ids, "claim requirement reference")
        return self


class EvidenceRequirement(V3ContractModel):
    requirement_id: str = Field(min_length=1)
    status: EvidenceRequirementStatus
    claim_ids: list[str] = Field(default_factory=list)
    gap: str = ""

    @model_validator(mode="after")
    def validate_status_details(self) -> "EvidenceRequirement":
        _require_unique(self.claim_ids, "requirement claim reference")
        if self.status == "supported" and not self.claim_ids:
            raise ValueError("supported requirements must reference at least one claim")
        if self.status == "supported" and self.gap:
            raise ValueError("supported requirements cannot describe a gap")
        if self.status in {"partial", "missing", "unpublished"} and not self.gap:
            raise ValueError(
                "partial, missing, and unpublished requirements must describe the gap"
            )
        if self.status == "missing" and self.claim_ids:
            raise ValueError("missing requirements cannot reference claims")
        # `unpublished` keeps claims on purpose: "OSITRAN's December 2025 report
        # measures immigration and baggage and no other step" is a real claim with
        # a real source, and it is what makes the absence reportable rather than
        # merely asserted.
        return self


class EvidencePremiseFinding(V3ContractModel):
    """One verdict on one thing the direction step assumed without checking."""

    assumption_id: str = Field(min_length=1)
    verdict: PremiseVerdict
    basis: str = Field(min_length=1)
    # Claims are wanted on every verdict, and they are what separates an
    # established refutation from a desk that simply failed to find the thing:
    # "the organizers' own news page schedules the reveal for 1 December 2026"
    # is a source, not an opinion.
    claim_ids: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_claim_links(self) -> "EvidencePremiseFinding":
        _require_unique(self.claim_ids, "premise finding claim reference")
        return self


class EvidenceConflict(V3ContractModel):
    conflict_id: str = Field(min_length=1)
    claim_ids: list[str] = Field(min_length=2)
    summary: str = Field(min_length=1)
    resolution: str | None = None


class EvidenceGap(V3ContractModel):
    gap_id: str = Field(min_length=1)
    requirement_ids: list[str] = Field(min_length=1)
    summary: str = Field(min_length=1)


class EvidencePackage(V3ContractModel):
    schema_version: Literal[3] = 3
    commission_fingerprint: str = Field(min_length=1)
    sources: list[EvidenceSource] = Field(default_factory=list)
    claims: list[EvidenceClaim] = Field(default_factory=list)
    requirements: list[EvidenceRequirement] = Field(min_length=1)
    premise_findings: list[EvidencePremiseFinding] = Field(default_factory=list)
    conflicts: list[EvidenceConflict] = Field(default_factory=list)
    gaps: list[EvidenceGap] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_evidence_links(self) -> "EvidencePackage":
        source_ids = [source.source_id for source in self.sources]
        claim_ids = [claim.claim_id for claim in self.claims]
        requirement_ids = [item.requirement_id for item in self.requirements]
        conflict_ids = [item.conflict_id for item in self.conflicts]
        gap_ids = [item.gap_id for item in self.gaps]
        premise_ids = [item.assumption_id for item in self.premise_findings]
        for values, label in (
            (source_ids, "source_id"),
            (claim_ids, "claim_id"),
            (requirement_ids, "requirement_id"),
            (conflict_ids, "conflict_id"),
            (gap_ids, "gap_id"),
            (premise_ids, "premise finding assumption_id"),
        ):
            _require_unique(values, label)

        known_sources = set(source_ids)
        known_claims = set(claim_ids)
        known_requirements = set(requirement_ids)
        for claim in self.claims:
            if not set(claim.source_ids) <= known_sources:
                raise ValueError(f"claim {claim.claim_id} references an unknown source")
            if not set(claim.requirement_ids) <= known_requirements:
                raise ValueError(
                    f"claim {claim.claim_id} references an unknown requirement"
                )
        for requirement in self.requirements:
            if not set(requirement.claim_ids) <= known_claims:
                raise ValueError(
                    f"requirement {requirement.requirement_id} references an unknown claim"
                )
        for finding in self.premise_findings:
            if not set(finding.claim_ids) <= known_claims:
                raise ValueError(
                    f"premise finding {finding.assumption_id} references an unknown claim"
                )
        requirement_claims = {
            requirement.requirement_id: set(requirement.claim_ids)
            for requirement in self.requirements
        }
        claim_requirements = {
            claim.claim_id: set(claim.requirement_ids) for claim in self.claims
        }
        mapped_from_claims = {
            requirement_id: {
                claim_id
                for claim_id, linked_requirements in claim_requirements.items()
                if requirement_id in linked_requirements
            }
            for requirement_id in known_requirements
        }
        if requirement_claims != mapped_from_claims:
            raise ValueError(
                "claim and requirement mappings must agree in both directions"
            )
        for conflict in self.conflicts:
            _require_unique(conflict.claim_ids, "conflict claim reference")
            if not set(conflict.claim_ids) <= known_claims:
                raise ValueError("conflict references an unknown claim")
        for gap in self.gaps:
            _require_unique(gap.requirement_ids, "gap requirement reference")
            if not set(gap.requirement_ids) <= known_requirements:
                raise ValueError("gap references an unknown requirement")
        return self


class Prompt2BlogWritingProfiles(V3ContractModel):
    tone_id: str = Field(min_length=1)
    length_id: str = Field(min_length=1)
    brand_voice_id: str | None = None
    creativity_level: CreativityLevel = "medium"


class Prompt2BlogModelRouting(V3ContractModel):
    """Which model answers for each role a v3 run actually calls.

    Outline, groundedness and title used to be pinned in ``config.py`` and
    unreachable from a request, so a route could only move the writer and the
    judge -- two of the six calls a run makes. They are declared per route now,
    and they are still separate fields rather than "same as the writer": the
    reason they were pinned was to stop a premium prose model silently
    promoting every small call to the same tier, and a route that has to name
    them cannot do that by accident.

    All optional. A request that omits one gets the ``P2B_V3_*_MODEL`` default,
    so an older client keeps the routing it has always had.
    """

    model_name: str | None = None
    writing_model: str | None = None
    repair_model: str | None = None
    audit_model: str | None = None
    outline_model: str | None = None
    groundedness_model: str | None = None
    title_model: str | None = None
    model_stack_id: str | None = None


class Prompt2BlogV3Request(V3ContractModel):
    schema_version: Literal[3] = 3
    commission: Prompt2BlogCommission
    evidence_package: EvidencePackage
    profiles: Prompt2BlogWritingProfiles
    model_routing: Prompt2BlogModelRouting = Field(
        default_factory=Prompt2BlogModelRouting
    )
    include_debug: bool = True
    enable_editorial_augmentation: bool = False

    @model_validator(mode="after")
    def validate_commission_evidence_identity(self) -> "Prompt2BlogV3Request":
        if (
            self.commission.commission_fingerprint
            != self.evidence_package.commission_fingerprint
        ):
            raise ValueError("evidence_package fingerprint must match commission")

        commission_requirements = {
            item.requirement_id for item in self.commission.requirements
        }
        evidence_requirements = {
            item.requirement_id for item in self.evidence_package.requirements
        }
        if commission_requirements != evidence_requirements:
            raise ValueError(
                "evidence requirements must exactly match commission requirements"
            )

        # A declared premise nobody checked is worse than no premise at all: it
        # reads on screen like it was verified. Research must return a verdict
        # for each one, and may not invent assumptions the commission never
        # made.
        commission_assumptions = {
            item.assumption_id for item in self.commission.premise
        }
        evidence_assumptions = {
            item.assumption_id for item in self.evidence_package.premise_findings
        }
        if commission_assumptions and commission_assumptions != evidence_assumptions:
            raise ValueError(
                "premise findings must exactly match the commission's premise"
            )
        if not commission_assumptions and evidence_assumptions:
            raise ValueError(
                "premise findings reference a premise the commission never declared"
            )
        return self
