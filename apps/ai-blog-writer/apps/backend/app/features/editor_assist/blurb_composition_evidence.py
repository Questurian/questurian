"""Research Profile and Writer Brief preparation for listicle composition."""

from __future__ import annotations

from dataclasses import dataclass, field
import time
from typing import Any

from .blurb_composition_contracts import (
    ListicleCompositionDeps,
    ListicleCompositionSettings,
    ListicleCompositionStep,
    ListicleCompositionTarget,
)
from .research_profile import (
    ResearchFinding,
    ResearchProfile,
    ResearchProfileTrace,
)
from .writer_brief import MIN_SOURCE_FACTS, WriterBrief


@dataclass(frozen=True)
class ResearchPreparation:
    source_urls: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    steps: list[ListicleCompositionStep] = field(default_factory=list)


@dataclass(frozen=True)
class WriterBriefPreparation:
    writer_brief: WriterBrief | None = None
    step: ListicleCompositionStep | None = None
    low_confidence_reason: str | None = None


def _elapsed_ms(start: float) -> int:
    return int((time.perf_counter() - start) * 1000)


def format_research_profile_block(
    research_profile: ResearchProfile | None,
) -> str:
    """Render supported angle evidence and bucket evidence for the legacy writer."""
    if research_profile is None:
        return ""
    lines: list[str] = ["RESEARCH PROFILE"]
    selected = research_profile.selected_angle
    if selected.status == "supported" and selected.angle and selected.summary:
        lines.append("SELECTED ANGLE EVIDENCE")
        lines.append(f"- {selected.angle} (effective angle): {selected.summary}")
    bucket_lines: list[str] = []
    for bucket, findings in research_profile.standard_buckets.items():
        for finding in findings:
            bucket_lines.append(f"- {bucket}: {finding.summary}")
    if bucket_lines:
        lines.append("STANDARD EVIDENCE BUCKETS")
        lines.extend(bucket_lines)
    return "\n".join(lines)


def _research_buckets_details(
    buckets: dict[str, list[ResearchFinding]],
) -> dict[str, list[dict[str, Any]]]:
    return {
        bucket: [
            {
                "summary": finding.summary,
                "citations": list(finding.citations),
            }
            for finding in findings
        ]
        for bucket, findings in buckets.items()
    }


def prepare_research(
    *,
    is_blurb: bool,
    settings: ListicleCompositionSettings,
    research_profile: ResearchProfile | None,
    research_profile_trace: ResearchProfileTrace | None,
) -> ResearchPreparation:
    if not is_blurb or research_profile is None:
        return ResearchPreparation()

    start = time.perf_counter()
    source_urls = list(research_profile.source_urls)
    warnings = list(research_profile.warnings)
    trace = research_profile_trace or ResearchProfileTrace(prompt="")
    step = ListicleCompositionStep(
        name="research_profile_completed",
        status="ok" if research_profile.usable_for_blurb else "failed",
        prompt=trace.prompt or None,
        output=trace.raw_response or None,
        model=trace.model or None,
        details={
            "requested_angle": settings.requested_angle,
            "effective_angle": research_profile.effective_angle,
            "selected_angle": {
                "angle": research_profile.selected_angle.angle,
                "status": research_profile.selected_angle.status,
                "summary": research_profile.selected_angle.summary,
                "citations": list(research_profile.selected_angle.citations),
                "reason": research_profile.selected_angle.reason,
            },
            "standard_buckets": _research_buckets_details(
                research_profile.standard_buckets
            ),
            "usable_for_blurb": research_profile.usable_for_blurb,
            "source_urls": list(source_urls),
            "warnings": list(warnings),
            "parser_dropped_reason": trace.parser_dropped_reason,
            "error": trace.error,
        },
        duration_ms=_elapsed_ms(start),
    )
    return ResearchPreparation(
        source_urls=source_urls,
        warnings=warnings,
        steps=[step],
    )


def prepare_writer_brief(
    *,
    use_lean_prompt: bool,
    target: ListicleCompositionTarget,
    settings: ListicleCompositionSettings,
    research_profile: ResearchProfile | None,
    deps: ListicleCompositionDeps,
) -> WriterBriefPreparation:
    if not use_lean_prompt or research_profile is None:
        return WriterBriefPreparation()

    start = time.perf_counter()
    venue_name = (target.research_subject or target.display_name or "").strip()
    location_label = (target.location_label or settings.article_location).strip()
    writer_brief, trace = deps.run_writer_brief(
        venue_name=venue_name,
        location_label=location_label,
        category=target.category or "nightlife",
        angle=settings.effective_angle,
        research_profile=research_profile,
    )
    step = ListicleCompositionStep(
        name="writer_brief_completed",
        status="ok" if writer_brief.is_usable else "failed",
        prompt=trace.prompt or None,
        output=trace.raw_response or None,
        model=trace.model or None,
        details={
            "angle": writer_brief.angle,
            "angle_directive": writer_brief.angle_directive,
            "source_facts": [
                {"fact": entry.fact, "citations": list(entry.citations)}
                for entry in writer_brief.source_facts
            ],
            "source_facts_count": len(writer_brief.source_facts),
            "min_source_facts": MIN_SOURCE_FACTS,
            "is_usable": writer_brief.is_usable,
            "parser_dropped_reason": trace.parser_dropped_reason,
            "error": trace.error,
        },
        duration_ms=_elapsed_ms(start),
    )
    return WriterBriefPreparation(
        writer_brief=writer_brief,
        step=step,
        low_confidence_reason=(
            None if writer_brief.is_usable else "writer brief unusable"
        ),
    )
