"""
Stage 3: Article composition with coverage analysis.

This stage:
1. Retrieves guidelines for the classified article type
2. Checks if the transcript covers the guideline requirements
3. Generates supplemental content if coverage is insufficient
4. Composes the final article in markdown format
"""

from __future__ import annotations

import logging
import re
from pathlib import Path

from langchain_core.prompts import PromptTemplate

from app.core import get_article_type_by_name
from app.config import ARTICLE_GUIDELINES_DIR
from app.features.youtube2blog.config import Y2B_COMPOSE_MODEL, Y2B_PRIMARY_MODEL
from shared import Stage1Output, Stage2Output, Stage3Output
from utils import get_vertex_llm, parse_json_response

logger = logging.getLogger(__name__)

# Path to general guidelines file
GENERAL_GUIDELINES_PATH = Path(__file__).parent.parent.parent.parent / "data" / "general.md"


def _stage3_llm(model_name: str = Y2B_PRIMARY_MODEL):
    return get_vertex_llm(
        temperature=0.3,
        max_tokens=8192,
        model_name=model_name,
    )


def _load_general_guidelines() -> str:
    """Load general guidelines from markdown file."""
    try:
        if GENERAL_GUIDELINES_PATH.exists():
            content = GENERAL_GUIDELINES_PATH.read_text(encoding="utf-8").strip()
            if content:
                return f"\n\n---\n\nGENERAL GUIDELINES:\n\n{content}"
        logger.warning(f"General guidelines file not found: {GENERAL_GUIDELINES_PATH}")
        return ""
    except Exception as e:
        logger.warning(f"Failed to load general guidelines: {e}")
        return ""


def _normalize_guideline_key(value: str) -> str:
    normalized = value.replace("’", "'").replace("`", "'")
    normalized = normalized.lower()
    normalized = re.sub(r"\.md$", "", normalized)
    normalized = normalized.replace("&", " and ")
    normalized = re.sub(r"[^a-z0-9]+", "", normalized)
    return normalized


def _load_guideline_from_file(article_type: str) -> str:
    """Load guideline markdown from filesystem when a matching file exists."""
    if not ARTICLE_GUIDELINES_DIR.exists():
        return ""

    exact_path = ARTICLE_GUIDELINES_DIR / f"{article_type}.md"
    if exact_path.exists():
        try:
            return exact_path.read_text(encoding="utf-8").strip()
        except Exception as exc:
            logger.warning("Failed reading guideline file %s: %s", exact_path, exc)
            return ""

    target_key = _normalize_guideline_key(article_type)
    if not target_key:
        return ""

    for candidate in ARTICLE_GUIDELINES_DIR.glob("*.md"):
        if _normalize_guideline_key(candidate.stem) == target_key:
            try:
                return candidate.read_text(encoding="utf-8").strip()
            except Exception as exc:
                logger.warning("Failed reading guideline file %s: %s", candidate, exc)
                return ""
    return ""


def _retrieve_guideline(article_type: str) -> str:
    """Fetch guideline from markdown files first, DB second."""
    file_guideline = _load_guideline_from_file(article_type)
    if file_guideline:
        return file_guideline

    article_type_data = get_article_type_by_name(article_type)
    if not article_type_data:
        logger.warning(f"No article type found for: {article_type}")
        return ""
    return article_type_data.get("guideline", "") or ""


def _check_coverage(transcript: str, guideline: str, llm) -> tuple[bool, str, list[str], str, str]:
    """
    LLM call to analyze if transcript covers guideline requirements.

    Returns: (coverage_sufficient, analysis, missing_sections, prompt, response)
    """
    general_guidelines = _load_general_guidelines()

    prompt = PromptTemplate(
        input_variables=["transcript", "guideline", "general_guidelines"],
        template="""You are an article content analyst.

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
    )

    full_prompt = prompt.format(
        transcript=transcript[:15000],  # Truncate for coverage check
        guideline=guideline,
        general_guidelines=general_guidelines,
    )
    logger.info(f"  Coverage check prompt length: {len(full_prompt)} chars")

    result = llm.invoke(full_prompt)
    logger.info(f"  Coverage check response length: {len(result) if result else 0} chars")

    if not result or not result.strip():
        raise RuntimeError("Coverage check failed: LLM returned empty response")

    parsed = parse_json_response(result)
    coverage_sufficient = parsed.get("coverage_sufficient", False)
    analysis = parsed.get("analysis", "")
    missing_sections = parsed.get("missing_sections", [])

    return coverage_sufficient, analysis, missing_sections, full_prompt, result


def _gather_missing_info(
    transcript: str,
    missing_sections: list[str],
    article_type: str,
    llm
) -> tuple[str, str, str]:
    """
    LLM call to generate supplemental content for missing sections.

    Returns: (supplemental_content, prompt, response)
    """
    sections_list = "\n".join(f"- {s}" for s in missing_sections)
    general_guidelines = _load_general_guidelines()

    prompt = PromptTemplate(
        input_variables=["transcript", "missing_sections", "article_type", "general_guidelines"],
        template="""You are a content enhancement specialist.

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
4. Write in the same tone and style as the transcript
5. Keep each section concise (2-4 paragraphs)
6. Include smooth transition phrases

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
    )

    full_prompt = prompt.format(
        transcript=transcript[:10000],
        missing_sections=sections_list,
        article_type=article_type,
        general_guidelines=general_guidelines,
    )
    logger.info(f"  Supplement generation prompt length: {len(full_prompt)} chars")

    result = llm.invoke(full_prompt)
    logger.info(f"  Supplement generation response length: {len(result) if result else 0} chars")

    if not result or not result.strip():
        return "", full_prompt, result

    return result.strip(), full_prompt, result


def _compose_article(
    transcript: str,
    supplemental: str | None,
    guideline: str,
    article_type: str,
    title: str,
    llm
) -> tuple[str, str, str]:
    """
    LLM call to compose the final article.

    Returns: (final_article, prompt, response)
    """
    content_section = f"""PRIMARY CONTENT (from transcript):

{transcript}"""

    if supplemental:
        content_section += f"""

---

SUPPLEMENTAL CONTENT (AI-generated to fill gaps):

{supplemental}"""

    general_guidelines = _load_general_guidelines()

    prompt = PromptTemplate(
        input_variables=["title", "article_type", "guideline", "content", "general_guidelines"],
        template="""You are an expert article composer.

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

---

OUTPUT FORMAT:

Write the complete article in markdown format.
Start with a level-1 heading (# Title).
Use proper markdown formatting throughout.
{general_guidelines}
"""
    )

    full_prompt = prompt.format(
        title=title,
        article_type=article_type,
        guideline=guideline,
        content=content_section,
        general_guidelines=general_guidelines,
    )
    logger.info(f"  Composition prompt length: {len(full_prompt)} chars")

    result = llm.invoke(full_prompt)
    logger.info(f"  Composition response length: {len(result) if result else 0} chars")

    if not result or not result.strip():
        raise RuntimeError("Article composition failed: LLM returned empty response")

    return result.strip(), full_prompt, result


def stage_3_retrieve_guideline(article_type: str) -> str:
    """Public helper used by graph node to fetch article guideline."""
    guideline = _retrieve_guideline(article_type)
    if guideline:
        return guideline
    return f"Write a {article_type} article based on the provided content."


def stage_3_coverage_check(
    *,
    transcript: str,
    guideline: str,
    model_name: str = Y2B_PRIMARY_MODEL,
) -> dict[str, object]:
    """Run coverage analysis as an explicit graph branch node."""
    llm = _stage3_llm(model_name)
    (
        coverage_sufficient,
        analysis,
        missing_sections,
        coverage_prompt,
        coverage_response,
    ) = _check_coverage(transcript, guideline, llm)
    return {
        "coverage_sufficient": bool(coverage_sufficient),
        "coverage_analysis": analysis,
        "missing_sections": list(missing_sections),
        "debug_coverage_prompt": coverage_prompt,
        "debug_coverage_response": coverage_response,
    }


def stage_3_generate_supplement(
    *,
    transcript: str,
    missing_sections: list[str],
    article_type: str,
    model_name: str = Y2B_PRIMARY_MODEL,
) -> dict[str, str]:
    """Generate supplemental markdown for missing sections."""
    llm = _stage3_llm(model_name)
    supplemental_content, supplement_prompt, supplement_response = _gather_missing_info(
        transcript,
        missing_sections,
        article_type,
        llm,
    )
    return {
        "supplemental_content": supplemental_content or "",
        "debug_supplement_prompt": supplement_prompt or "",
        "debug_supplement_response": supplement_response or "",
    }


def stage_3_compose_from_parts(
    *,
    transcript: str,
    supplemental: str | None,
    guideline: str,
    article_type: str,
    title: str,
    model_name: str = Y2B_PRIMARY_MODEL,
) -> dict[str, str]:
    """Compose article from explicit inputs used by branch nodes.

    Composition is pinned to Y2B_COMPOSE_MODEL regardless of the run's base
    model; `model_name` still selects the model for the other stage-3 nodes.
    """
    llm = _stage3_llm(Y2B_COMPOSE_MODEL)
    final_article, composition_prompt, composition_response = _compose_article(
        transcript,
        supplemental,
        guideline,
        article_type,
        title,
        llm,
    )
    return {
        "final_article": final_article,
        "debug_composition_prompt": composition_prompt,
        "debug_composition_response": composition_response,
    }


def stage_3_compose_article(stage1: Stage1Output, stage2: Stage2Output) -> Stage3Output:
    """
    Stage 3: Compose the final article using guidelines and coverage analysis.

    1. Retrieve guideline for the classified article type
    2. Check if transcript covers guideline requirements
    3. Generate supplemental content if needed
    4. Compose the final article
    """
    logger.info("=" * 60)
    logger.info("STAGE 3: Composing article")
    logger.info("=" * 60)
    logger.info(f"  Video: {stage1.title}")
    logger.info(f"  Article Type: {stage2.classification}")
    logger.info(f"  Transcript length: {len(stage1.cleaned_transcript)} chars")

    llm = _stage3_llm()

    # Step 1: Retrieve guideline
    logger.info("  Step 1: Retrieving guideline...")
    guideline = _retrieve_guideline(stage2.classification)
    if not guideline:
        logger.warning(f"  No guideline found for article type: {stage2.classification}")
        guideline = f"Write a {stage2.classification} article based on the provided content."

    logger.info(f"  Guideline length: {len(guideline)} chars")

    # Step 2: Check coverage
    logger.info("  Step 2: Checking transcript coverage...")
    (
        coverage_sufficient,
        coverage_analysis,
        missing_sections,
        coverage_prompt,
        coverage_response,
    ) = _check_coverage(stage1.cleaned_transcript, guideline, llm)

    logger.info(f"  Coverage sufficient: {coverage_sufficient}")
    logger.info(f"  Analysis: {coverage_analysis}")
    if missing_sections:
        logger.info(f"  Missing sections: {missing_sections}")

    # Step 3: Generate supplemental content if needed
    supplemental_content = None
    supplement_prompt = None
    supplement_response = None

    if not coverage_sufficient and missing_sections:
        logger.info("  Step 3: Generating supplemental content...")
        (
            supplemental_content,
            supplement_prompt,
            supplement_response,
        ) = _gather_missing_info(
            stage1.cleaned_transcript,
            missing_sections,
            stage2.classification,
            llm,
        )
        logger.info(f"  Supplemental content length: {len(supplemental_content) if supplemental_content else 0} chars")
    else:
        logger.info("  Step 3: Skipping supplemental content (coverage sufficient)")

    # Step 4: Compose final article (pinned to the Claude compose model;
    # coverage/supplement above stay on the primary model)
    logger.info("  Step 4: Composing final article...")
    (
        final_article,
        composition_prompt,
        composition_response,
    ) = _compose_article(
        stage1.cleaned_transcript,
        supplemental_content,
        guideline,
        stage2.classification,
        stage1.title,
        _stage3_llm(Y2B_COMPOSE_MODEL),
    )
    logger.info(f"  Final article length: {len(final_article)} chars")

    output = Stage3Output(
        video_id=stage1.video_id,
        title=stage1.title,
        article_type=stage2.classification,
        coverage_sufficient=coverage_sufficient,
        coverage_analysis=coverage_analysis,
        missing_sections=missing_sections,
        supplemental_content=supplemental_content,
        final_article=final_article,
        guideline_used=guideline,
        debug_coverage_prompt=coverage_prompt,
        debug_coverage_response=coverage_response,
        debug_supplement_prompt=supplement_prompt,
        debug_supplement_response=supplement_response,
        debug_composition_prompt=composition_prompt,
        debug_composition_response=composition_response,
    )

    logger.info("=" * 60)
    logger.info("  Stage 3 complete!")
    logger.info("=" * 60)

    return output
