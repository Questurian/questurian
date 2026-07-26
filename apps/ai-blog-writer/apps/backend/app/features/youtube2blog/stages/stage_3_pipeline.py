"""Legacy all-in-one Stage 3 orchestration."""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from shared import Stage1Output, Stage2Output, Stage3Output

logger = logging.getLogger(__name__)


def compose_stage_3(
    stage1: Stage1Output,
    stage2: Stage2Output,
    *,
    tone_guidance: str | None,
    compose_model: str,
    make_llm: Callable[..., Any],
    retrieve_guideline: Callable[[str], str],
    check_coverage: Callable[..., tuple[bool, str, list[str], str, str]],
    gather_missing_info: Callable[..., tuple[str, str, str]],
    compose_article: Callable[..., tuple[str, str, str]],
) -> Stage3Output:
    """Run the original sequential Stage 3 workflow."""
    logger.info("=" * 60)
    logger.info("STAGE 3: Composing article")
    logger.info("=" * 60)
    logger.info("  Video: %s", stage1.title)
    logger.info("  Article Type: %s", stage2.classification)
    logger.info("  Transcript length: %d chars", len(stage1.cleaned_transcript))

    llm = make_llm()

    logger.info("  Step 1: Retrieving guideline...")
    guideline = retrieve_guideline(stage2.classification)
    if not guideline:
        logger.warning(
            "  No guideline found for article type: %s",
            stage2.classification,
        )
        guideline = (
            f"Write a {stage2.classification} article based on the provided content."
        )
    logger.info("  Guideline length: %d chars", len(guideline))

    logger.info("  Step 2: Checking transcript coverage...")
    (
        coverage_sufficient,
        coverage_analysis,
        missing_sections,
        coverage_prompt,
        coverage_response,
    ) = check_coverage(stage1.cleaned_transcript, guideline, llm)
    logger.info("  Coverage sufficient: %s", coverage_sufficient)
    logger.info("  Analysis: %s", coverage_analysis)
    if missing_sections:
        logger.info("  Missing sections: %s", missing_sections)

    supplemental_content = None
    supplement_prompt = None
    supplement_response = None
    if not coverage_sufficient and missing_sections:
        logger.info("  Step 3: Generating supplemental content...")
        (
            supplemental_content,
            supplement_prompt,
            supplement_response,
        ) = gather_missing_info(
            stage1.cleaned_transcript,
            missing_sections,
            stage2.classification,
            llm,
            tone_guidance,
        )
        logger.info(
            "  Supplemental content length: %d chars",
            len(supplemental_content) if supplemental_content else 0,
        )
    else:
        logger.info("  Step 3: Skipping supplemental content (coverage sufficient)")

    logger.info("  Step 4: Composing final article...")
    final_article, composition_prompt, composition_response = compose_article(
        stage1.cleaned_transcript,
        supplemental_content,
        guideline,
        stage2.classification,
        stage1.title,
        make_llm(compose_model),
        tone_guidance,
    )
    logger.info("  Final article length: %d chars", len(final_article))

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
