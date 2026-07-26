"""Concurrent batch orchestration for Research Profiles."""

from __future__ import annotations

from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor

from .research_profile_contracts import (
    ResearchProfile,
    ResearchProfileRequest,
    ResearchProfileTrace,
)

RunResearchProfile = Callable[
    ...,
    tuple[ResearchProfile, ResearchProfileTrace],
]


def execute_research_profiles_concurrently(
    requests: list[ResearchProfileRequest],
    *,
    grounded_model: str,
    max_workers: int | None,
    run_research_profile: RunResearchProfile,
) -> dict[str, tuple[ResearchProfile, ResearchProfileTrace]]:
    if not requests:
        return {}

    workers = max_workers or min(8, len(requests))
    results: dict[str, tuple[ResearchProfile, ResearchProfileTrace]] = {}

    def _run_one(
        req: ResearchProfileRequest,
    ) -> tuple[str, ResearchProfile, ResearchProfileTrace]:
        profile, trace = run_research_profile(
            venue_name=req.venue_name,
            location_label=req.location_label,
            category=req.category,
            requested_angle=req.requested_angle,
            grounded_model=grounded_model,
        )
        return req.target_id, profile, trace

    with ThreadPoolExecutor(max_workers=workers) as pool:
        for target_id, profile, trace in pool.map(_run_one, requests):
            results[target_id] = (profile, trace)

    return results


__all__ = ["RunResearchProfile", "execute_research_profiles_concurrently"]
