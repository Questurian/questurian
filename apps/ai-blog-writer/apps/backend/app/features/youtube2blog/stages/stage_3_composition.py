"""Article composition for YouTube2Blog Stage 3."""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from langchain_core.prompts import PromptTemplate

from app.shared.prompts import ANTI_AI_TELLS_FULL
from app.shared.text import enforce_anti_ai_tells_markdown

logger = logging.getLogger(__name__)

COMPOSITION_PROMPT = """You are an expert article composer.

Your task is to compose a complete, polished article from the provided content,
following the structure and style defined in the guideline.

---

ARTICLE DETAILS:

Title: {title}
Type: {article_type}

---

GUIDELINE TO FOLLOW:

{guideline}

---

{content}

---

COMPOSITION RULES:

1. Follow the guideline's structure and formatting requirements
2. Use ALL relevant content from the transcript
3. Integrate supplemental content naturally (if provided)
4. Write in clear, engaging prose appropriate for the article type
5. Include proper headings, subheadings, and formatting
6. Do NOT add new information not present in the source content
7. Do NOT include meta-commentary about the article
8. Start directly with the article content
9. Write for readers first and SEO second. Use natural travel-news language, avoid keyword stuffing, avoid repetitive SEO headings, and make the article feel edited by a human. Include SEO elements only where they improve clarity: a strong headline, concise subhead, clean section structure, accurate metadata, and natural keywords. SEO structure and keywords never override the voice rules appended below.

---

OUTPUT FORMAT:

Write the complete article in markdown format.
Start with a level-1 heading (# Title).
Use proper markdown formatting throughout.
{general_guidelines}
"""


def compose_article(
    transcript: str,
    supplemental: str | None,
    guideline: str,
    article_type: str,
    title: str,
    llm: Any,
    tone_guidance: str | None = None,
    *,
    load_general_guidelines: Callable[[], str],
) -> tuple[str, str, str]:
    """Compose the final Markdown article from explicit source parts."""
    content_section = f"""PRIMARY CONTENT (from transcript):

{transcript}"""
    if supplemental:
        content_section += f"""

---

SUPPLEMENTAL CONTENT (AI-generated to fill gaps):

{supplemental}"""

    prompt = PromptTemplate(
        input_variables=[
            "title",
            "article_type",
            "guideline",
            "content",
            "general_guidelines",
        ],
        template=COMPOSITION_PROMPT,
    )
    full_prompt = prompt.format(
        title=title,
        article_type=article_type,
        guideline=guideline,
        content=content_section,
        general_guidelines=load_general_guidelines(),
    )
    if tone_guidance:
        full_prompt = f"{full_prompt}\n\n{tone_guidance.strip()}"
    full_prompt = f"{full_prompt}\n\n{ANTI_AI_TELLS_FULL}"
    logger.info("  Composition prompt length: %d chars", len(full_prompt))

    result = llm.invoke(full_prompt)
    logger.info(
        "  Composition response length: %d chars",
        len(result) if result else 0,
    )
    if not result or not result.strip():
        raise RuntimeError("Article composition failed: LLM returned empty response")

    final_article = enforce_anti_ai_tells_markdown(
        str(result),
        repair=lambda repair_prompt: llm.invoke(repair_prompt),
        context="youtube2blog compose",
    )
    return final_article, full_prompt, result
