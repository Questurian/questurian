"""Research Profile data contracts and evidence policy."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from .angle_assignment import ListicleAngle

SelectedAngleStatus = Literal["supported", "weak", "unsupported", "not-requested"]
ResearchBucketName = Literal[
    "reputation-summary",
    "specific-offerings",
    "experience-texture",
    "history-or-ownership",
    "practical-usefulness",
    "best-for",
    "standout-hook",
    "social-proof",
    "visual-assets",
    "caveats-or-fit-warnings",
    "timing-tips",
    "neighborhood-context",
    "crowd-and-vibe",
]

STANDARD_RESEARCH_BUCKETS: tuple[ResearchBucketName, ...] = (
    "reputation-summary",
    "specific-offerings",
    "experience-texture",
    "history-or-ownership",
    "practical-usefulness",
    "best-for",
    "standout-hook",
    "social-proof",
    "visual-assets",
    "caveats-or-fit-warnings",
    "timing-tips",
    "neighborhood-context",
    "crowd-and-vibe",
)

CATEGORY_BUCKET_PRIORITIES: dict[str, tuple[ResearchBucketName, ...]] = {
    "dining": (
        "specific-offerings",  # signature-dish
        "experience-texture",  # atmosphere
        "history-or-ownership",  # founders-backstory
        "standout-hook",  # insider-tip + whats-different
        "best-for",  # best-for
        "social-proof",  # cross-angle reputation evidence
        "caveats-or-fit-warnings",  # cross-angle restraint
    ),
    "nightlife": (
        "experience-texture",
        "timing-tips",
        "best-for",
        "social-proof",
    ),
    "attractions": (
        "timing-tips",
        "standout-hook",
        "visual-assets",
        "caveats-or-fit-warnings",
    ),
    "accommodations": (
        "neighborhood-context",
        "specific-offerings",
        "experience-texture",
        "crowd-and-vibe",
        "best-for",
        "visual-assets",
        "caveats-or-fit-warnings",
    ),
}


@dataclass(frozen=True)
class ResearchFinding:
    summary: str
    citations: list[str]


@dataclass(frozen=True)
class SelectedAngleEvidence:
    angle: ListicleAngle | None
    status: SelectedAngleStatus
    summary: str = ""
    citations: list[str] = field(default_factory=list)
    reason: str = ""


@dataclass(frozen=True)
class ResearchProfile:
    selected_angle: SelectedAngleEvidence
    standard_buckets: dict[ResearchBucketName, list[ResearchFinding]]
    usable_for_blurb: bool
    warnings: list[str] = field(default_factory=list)

    @property
    def effective_angle(self) -> ListicleAngle | None:
        if self.selected_angle.status == "supported":
            return self.selected_angle.angle
        return None

    @property
    def bucket_findings_count(self) -> int:
        return sum(len(findings) for findings in self.standard_buckets.values())

    @property
    def source_urls(self) -> list[str]:
        merged: list[str] = []
        seen: set[str] = set()
        groups = [self.selected_angle.citations]
        groups.extend(
            finding.citations
            for findings in self.standard_buckets.values()
            for finding in findings
        )
        for group in groups:
            for url in group:
                if url in seen:
                    continue
                seen.add(url)
                merged.append(url)
        return merged


@dataclass(frozen=True)
class ResearchProfileTrace:
    prompt: str
    raw_response: str = ""
    model: str = ""
    error: str | None = None
    parser_dropped_reason: str | None = None


@dataclass(frozen=True)
class ResearchProfileRequest:
    target_id: str
    venue_name: str
    location_label: str
    category: str
    requested_angle: ListicleAngle | None


def empty_buckets() -> dict[ResearchBucketName, list[ResearchFinding]]:
    return {bucket: [] for bucket in STANDARD_RESEARCH_BUCKETS}


def fallback_profile(
    requested_angle: ListicleAngle | None,
    *,
    warning: str | None = None,
) -> ResearchProfile:
    warnings = [warning] if warning else []
    return ResearchProfile(
        selected_angle=SelectedAngleEvidence(
            angle=requested_angle,
            status="unsupported" if requested_angle else "not-requested",
        ),
        standard_buckets=empty_buckets(),
        usable_for_blurb=False,
        warnings=warnings,
    )


def has_usable_bucket_evidence(
    buckets: dict[ResearchBucketName, list[ResearchFinding]]
) -> bool:
    total = sum(len(findings) for findings in buckets.values())
    if total >= 2:
        return True
    return len(buckets.get("standout-hook", [])) >= 1


__all__ = [
    "CATEGORY_BUCKET_PRIORITIES",
    "STANDARD_RESEARCH_BUCKETS",
    "ResearchBucketName",
    "ResearchFinding",
    "ResearchProfile",
    "ResearchProfileRequest",
    "ResearchProfileTrace",
    "SelectedAngleEvidence",
    "SelectedAngleStatus",
    "empty_buckets",
    "fallback_profile",
    "has_usable_bucket_evidence",
]
