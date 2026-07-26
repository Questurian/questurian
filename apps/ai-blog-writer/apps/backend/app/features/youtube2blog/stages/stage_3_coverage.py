"""Coverage Analysis for YouTube2Blog Stage 3."""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from langchain_core.prompts import PromptTemplate
from utils import parse_json_response

logger = logging.getLogger(__name__)

COVERAGE_PROMPT = """You are an article content analyst.

Your task is to analyze if a YouTube transcript provides sufficient content
to write a complete article following the given guideline.

---

GUIDELINE FOR THE ARTICLE:

{guideline}

---

TRANSCRIPT TO ANALYZE:

{transcript}

---

ANALYSIS INSTRUCTIONS:

1. Identify the key sections/topics required by the guideline
2. Check if the transcript provides content for each required section
3. Determine if there are any major gaps that would require additional content

A transcript has "sufficient coverage" if:
- It covers at least 70% of the guideline's required sections
- The main topic/theme is well addressed
- Minor gaps can be filled with logical transitions

---

OUTPUT FORMAT (STRICT JSON ONLY):

{{
  "coverage_sufficient": <true or false>,
  "analysis": "<2-3 sentence explanation of the coverage assessment>",
  "missing_sections": ["<list of major sections not covered by transcript>"]
}}

If coverage is sufficient, missing_sections should be an empty array [].
{general_guidelines}
"""


def check_coverage(
    transcript: str,
    guideline: str,
    llm: Any,
    *,
    load_general_guidelines: Callable[[], str],
) -> tuple[bool, str, list[str], str, str]:
    """Analyze whether the transcript covers the article guideline."""
    prompt = PromptTemplate(
        input_variables=["transcript", "guideline", "general_guidelines"],
        template=COVERAGE_PROMPT,
    )
    full_prompt = prompt.format(
        transcript=transcript[:15000],
        guideline=guideline,
        general_guidelines=load_general_guidelines(),
    )
    logger.info("  Coverage check prompt length: %d chars", len(full_prompt))

    result = llm.invoke(full_prompt)
    logger.info(
        "  Coverage check response length: %d chars",
        len(result) if result else 0,
    )
    if not result or not result.strip():
        raise RuntimeError("Coverage check failed: LLM returned empty response")

    parsed = parse_json_response(result)
    coverage_sufficient = parsed.get("coverage_sufficient", False)
    analysis = parsed.get("analysis", "")
    missing_sections = parsed.get("missing_sections", [])

    return (
        coverage_sufficient,
        analysis,
        missing_sections,
        full_prompt,
        result,
    )
