"""Compatibility facade for Writer Brief curation.

Contracts, editorial directive policy, prompt construction, parsing, execution,
fallbacks, and writer-facing rendering live in cohesive adjacent modules. The
facade preserves the existing import surface and ``_invoke_curator_model``
patch seam.
"""

from __future__ import annotations

import logging

from .angle_assignment import ListicleAngle
from .research_profile import ResearchProfile
from .writer_brief_contracts import (  # noqa: F401
    MAX_SOURCE_FACTS,
    MIN_SOURCE_FACTS,
    SourceFact,
    WriterBrief,
    WriterBriefTrace,
)
from .writer_brief_execution import execute_writer_brief
from .writer_brief_parsing import (  # noqa: F401
    extract_json as _extract_json,
    parse_writer_brief_response,
)
from .writer_brief_policy import (  # noqa: F401
    ANGLE_DIRECTIVES_BY_CATEGORY,
    render_angle_directive_template as _render_template_fallback,
)
from .writer_brief_prompt import (  # noqa: F401
    build_curator_prompt,
    format_research_profile_for_curator as _format_research_profile_for_curator,
)
from .writer_brief_rendering import render_source_facts_block

logger = logging.getLogger(__name__)


def _invoke_curator_model(
    *,
    prompt: str,
    model_name: str,
    max_tokens: int,
    temperature: float,
) -> tuple[str, str]:
    from utils import get_vertex_llm  # type: ignore

    llm = get_vertex_llm(
        temperature=temperature,
        max_tokens=max_tokens,
        model_name=model_name,
    )
    raw = llm.invoke(prompt)
    text = raw if isinstance(raw, str) else str(raw)
    return text, model_name


def run_writer_brief(
    *,
    venue_name: str,
    location_label: str,
    category: str,
    angle: ListicleAngle | None,
    research_profile: ResearchProfile,
    model_name: str = "gemini-2.5-flash",
    max_tokens: int = 10240,
    temperature: float = 0.1,
) -> tuple[WriterBrief, WriterBriefTrace]:
    """Run the curator while preserving the facade's injectable model seam."""
    return execute_writer_brief(
        venue_name=venue_name,
        location_label=location_label,
        category=category,
        angle=angle,
        research_profile=research_profile,
        model_name=model_name,
        max_tokens=max_tokens,
        temperature=temperature,
        invoke_curator=_invoke_curator_model,
        exception_logger=logger,
    )


__all__ = [
    "ANGLE_DIRECTIVES_BY_CATEGORY",
    "MAX_SOURCE_FACTS",
    "MIN_SOURCE_FACTS",
    "SourceFact",
    "WriterBrief",
    "WriterBriefTrace",
    "build_curator_prompt",
    "parse_writer_brief_response",
    "render_source_facts_block",
    "run_writer_brief",
]
