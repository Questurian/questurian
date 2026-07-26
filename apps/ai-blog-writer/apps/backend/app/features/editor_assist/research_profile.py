"""Compatibility facade for grounded Research Profile generation.

Contracts, prompt construction, parsing, grounded execution, fallbacks, and
batch concurrency live in cohesive adjacent modules. The facade preserves the
existing import surface and ``_invoke_grounded`` patch seam.
"""

from __future__ import annotations

import logging
from typing import Any

from .angle_assignment import ListicleAngle
from .research_profile_batch import execute_research_profiles_concurrently
from .research_profile_contracts import (  # noqa: F401
    CATEGORY_BUCKET_PRIORITIES,
    STANDARD_RESEARCH_BUCKETS,
    ResearchBucketName,
    ResearchFinding,
    ResearchProfile,
    ResearchProfileRequest,
    ResearchProfileTrace,
    SelectedAngleEvidence,
    SelectedAngleStatus,
    empty_buckets as _empty_buckets,
    fallback_profile as _fallback_profile,
    has_usable_bucket_evidence as _has_usable_bucket_evidence,
)
from .research_profile_execution import execute_research_profile
from .research_profile_parsing import (  # noqa: F401
    clean_citations as _clean_citations,
    clean_summary as _clean_summary,
    extract_json as _extract_json,
    parse_research_profile_response as _parse_research_profile_response,
)
from .research_profile_prompt import build_research_profile_prompt

logger = logging.getLogger(__name__)


def _invoke_grounded(*args: Any, **kwargs: Any) -> Any:
    from utils import invoke_google_grounded_text as _invoke

    return _invoke(*args, **kwargs)


def run_research_profile(
    *,
    venue_name: str,
    location_label: str,
    category: str,
    requested_angle: ListicleAngle | None,
    grounded_model: str = "gemini-2.5-flash",
) -> tuple[ResearchProfile, ResearchProfileTrace]:
    return execute_research_profile(
        venue_name=venue_name,
        location_label=location_label,
        category=category,
        requested_angle=requested_angle,
        grounded_model=grounded_model,
        invoke_grounded=_invoke_grounded,
        exception_logger=logger,
    )


def run_research_profiles_concurrently(
    requests: list[ResearchProfileRequest],
    *,
    grounded_model: str = "gemini-2.5-flash",
    max_workers: int | None = None,
) -> dict[str, tuple[ResearchProfile, ResearchProfileTrace]]:
    return execute_research_profiles_concurrently(
        requests,
        grounded_model=grounded_model,
        max_workers=max_workers,
        run_research_profile=run_research_profile,
    )


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
    "build_research_profile_prompt",
    "run_research_profile",
    "run_research_profiles_concurrently",
]
