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
EvidenceRequirementStatus = Literal["supported", "partial", "missing"]
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


class CommissionRequirement(V3ContractModel):
    requirement_id: str = Field(min_length=1)
    question: str = Field(min_length=1)


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
        if self.status in {"partial", "missing"} and not self.gap:
            raise ValueError("partial and missing requirements must describe the gap")
        if self.status == "missing" and self.claim_ids:
            raise ValueError("missing requirements cannot reference claims")
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
    conflicts: list[EvidenceConflict] = Field(default_factory=list)
    gaps: list[EvidenceGap] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_evidence_links(self) -> "EvidencePackage":
        source_ids = [source.source_id for source in self.sources]
        claim_ids = [claim.claim_id for claim in self.claims]
        requirement_ids = [item.requirement_id for item in self.requirements]
        conflict_ids = [item.conflict_id for item in self.conflicts]
        gap_ids = [item.gap_id for item in self.gaps]
        for values, label in (
            (source_ids, "source_id"),
            (claim_ids, "claim_id"),
            (requirement_ids, "requirement_id"),
            (conflict_ids, "conflict_id"),
            (gap_ids, "gap_id"),
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
    model_name: str | None = None
    writing_model: str | None = None
    audit_model: str | None = None
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
        return self
