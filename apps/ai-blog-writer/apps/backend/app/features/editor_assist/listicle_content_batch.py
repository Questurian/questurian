"""Batch preparation for Listicle Content Generation."""

from __future__ import annotations

from dataclasses import dataclass

from .angle_assignment import (
    ANTI_AI_PROMPT_CATEGORIES,
    ListicleAngle as AssignmentAngle,
)
from .critical_fields import CriticalFieldsResult, evaluate_critical_fields
from .listicle_content_contracts import GenerateListicleTargetRequest
from .research_profile import (
    ResearchProfile,
    ResearchProfileRequest,
    ResearchProfileTrace,
    run_research_profiles_concurrently,
)


@dataclass(frozen=True)
class PreparedListicleBatch:
    critical_fields_by_target_id: dict[str, CriticalFieldsResult]
    research_by_target_id: dict[str, ResearchProfile]
    research_trace_by_target_id: dict[str, ResearchProfileTrace]
    effective_angle_by_target_id: dict[str, AssignmentAngle | None]


def evaluate_target_critical_fields(
    request_target: GenerateListicleTargetRequest,
) -> CriticalFieldsResult:
    if request_target.field_type == "intro":
        return CriticalFieldsResult(passed=True, missing=[])
    return evaluate_critical_fields(
        name=request_target.display_name or request_target.research_subject,
        category=request_target.category,
        location_label=request_target.location_label,
        payload_doc_id=request_target.payload_doc_id,
    )


def is_skipped_existing_target(
    target: GenerateListicleTargetRequest,
    *,
    skip_existing: bool,
) -> bool:
    return skip_existing and bool((target.current_content or "").strip())


def build_research_profile_requests(
    targets: list[GenerateListicleTargetRequest],
    cf_by_target_id: dict[str, CriticalFieldsResult],
    *,
    article_location: str,
    skip_existing: bool,
) -> list[ResearchProfileRequest]:
    requests: list[ResearchProfileRequest] = []
    for target in targets:
        if target.field_type != "blurb":
            continue
        if is_skipped_existing_target(target, skip_existing=skip_existing):
            continue
        critical_fields = cf_by_target_id.get(target.target_id)
        if critical_fields is None or not critical_fields.passed:
            continue
        if target.category not in ANTI_AI_PROMPT_CATEGORIES:
            continue
        requests.append(
            ResearchProfileRequest(
                target_id=target.target_id,
                venue_name=(
                    target.display_name or target.research_subject or ""
                ).strip(),
                location_label=(target.location_label or article_location).strip(),
                category=target.category,
                requested_angle=target.angle,
            )
        )
    return requests


def prepare_listicle_batch(
    targets: list[GenerateListicleTargetRequest],
    *,
    article_location: str,
    skip_existing: bool,
) -> PreparedListicleBatch:
    critical_fields_by_target_id = {
        target.target_id: evaluate_target_critical_fields(target) for target in targets
    }
    requests = build_research_profile_requests(
        targets,
        critical_fields_by_target_id,
        article_location=article_location,
        skip_existing=skip_existing,
    )
    research_results = run_research_profiles_concurrently(requests) if requests else {}
    research_by_target_id = {
        target_id: pair[0] for target_id, pair in research_results.items()
    }
    research_trace_by_target_id = {
        target_id: pair[1] for target_id, pair in research_results.items()
    }
    effective_angle_by_target_id = {
        target.target_id: research_by_target_id[target.target_id].effective_angle
        for target in targets
        if target.target_id in research_by_target_id
    }
    return PreparedListicleBatch(
        critical_fields_by_target_id=critical_fields_by_target_id,
        research_by_target_id=research_by_target_id,
        research_trace_by_target_id=research_trace_by_target_id,
        effective_angle_by_target_id=effective_angle_by_target_id,
    )


__all__ = [
    "PreparedListicleBatch",
    "build_research_profile_requests",
    "evaluate_target_critical_fields",
    "is_skipped_existing_target",
    "prepare_listicle_batch",
]
