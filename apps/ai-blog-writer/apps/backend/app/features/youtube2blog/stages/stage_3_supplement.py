"""Missing-section supplementation for YouTube2Blog Stage 3."""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from langchain_core.prompts import PromptTemplate

from app.shared.prompts import ANTI_AI_TELLS_FULL
from app.shared.text import enforce_anti_ai_tells_markdown

logger = logging.getLogger(__name__)

SUPPLEMENT_PROMPT = """You are a content enhancement specialist.

The following transcript is being converted into a "{article_type}" article,
but it's missing some required sections. Your task is to generate
supplemental content that logically extends what's in the transcript.

---

ORIGINAL TRANSCRIPT (for context):

{transcript}

---

MISSING SECTIONS TO GENERATE:

{missing_sections}

---

GENERATION RULES:

1. Base supplemental content on themes and topics from the transcript
2. Do NOT invent specific facts, statistics, or claims not in the transcript
3. Use general knowledge to expand on concepts mentioned
4. Preserve the source meaning and details; do not copy transcript filler, hedges, or rambling cadence
5. Keep each section concise (2-4 paragraphs)
6. Use clear logical transitions only where needed; avoid stock transition phrases
7. Supplemental context may explain concepts already mentioned in the transcript, but the final article cannot invent unsupported specifics

---

OUTPUT FORMAT:

Write the supplemental content as markdown, with each section clearly labeled.
Do NOT include any JSON formatting. Just write the content directly.

Example:
## [Section Name]

[Content for this section...]

## [Another Section]

[Content for this section...]
{general_guidelines}
"""


def gather_missing_info(
    transcript: str,
    missing_sections: list[str],
    article_type: str,
    llm: Any,
    tone_guidance: str | None = None,
    *,
    load_general_guidelines: Callable[[], str],
) -> tuple[str, str, str]:
    """Generate supplemental Markdown for uncovered guideline sections."""
    prompt = PromptTemplate(
        input_variables=[
            "transcript",
            "missing_sections",
            "article_type",
            "general_guidelines",
        ],
        template=SUPPLEMENT_PROMPT,
    )
    full_prompt = prompt.format(
        transcript=transcript[:10000],
        missing_sections="\n".join(f"- {section}" for section in missing_sections),
        article_type=article_type,
        general_guidelines=load_general_guidelines(),
    )
    if tone_guidance:
        full_prompt = f"{full_prompt}\n\n{tone_guidance.strip()}"
    full_prompt = f"{full_prompt}\n\n{ANTI_AI_TELLS_FULL}"
    logger.info("  Supplement generation prompt length: %d chars", len(full_prompt))

    result = llm.invoke(full_prompt)
    logger.info(
        "  Supplement generation response length: %d chars",
        len(result) if result else 0,
    )
    if not result or not result.strip():
        return "", full_prompt, result

    supplemental = enforce_anti_ai_tells_markdown(
        str(result),
        repair=lambda repair_prompt: llm.invoke(repair_prompt),
        context="youtube2blog supplement",
    )
    return supplemental, full_prompt, result
