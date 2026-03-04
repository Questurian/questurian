"""
Stage 2: Classify article type using AI.
"""

from __future__ import annotations

import logging

from langchain_core.prompts import PromptTemplate

from app.core import read_article_definitions
from app.features.youtube2blog.config import Y2B_PRIMARY_MODEL
from shared import Stage1Output, Stage2Output
from utils import get_vertex_llm, parse_json_response

logger = logging.getLogger(__name__)


def stage_2_classify_article_type(
    stage1: Stage1Output,
    allowed_article_types: list[str],
    *,
    classification_mode: str = "primary",
) -> Stage2Output:
    """
    Stage 2: Classify the cleaned transcript into one of 42 article types.

    Uses AI to determine the best article format based on transcript content.
    Returns classification, confidence score, and reasoning.
    """
    logger.info("=" * 60)
    logger.info("STAGE 2: Classifying article type")
    logger.info("=" * 60)
    logger.info(f"  Video: {stage1.title}")
    logger.info(f"  Transcript length: {len(stage1.cleaned_transcript)} chars")

    if classification_mode not in {"primary", "retry"}:
        raise ValueError(f"Unsupported classification mode: {classification_mode}")

    # Retry pass gets a longer context window for borderline cases.
    max_classification_chars = 15000 if classification_mode == "primary" else 30000
    transcript_for_classification = stage1.cleaned_transcript
    if len(transcript_for_classification) > max_classification_chars:
        transcript_for_classification = transcript_for_classification[:max_classification_chars]
        logger.info(
            "  Truncated transcript to %d chars for %s classification",
            max_classification_chars,
            classification_mode,
        )

    llm = get_vertex_llm(
        temperature=0.1,
        max_tokens=2048,
        model_name=Y2B_PRIMARY_MODEL,
    )

    # Build the article types list for the prompt
    article_types_list = "\n".join(f"- {t}" for t in allowed_article_types)

    # Get article definitions from database
    article_definitions = "\n".join(read_article_definitions())

    prompt = PromptTemplate(
        input_variables=["transcript", "article_types", "definitions"],
        template="""You are an article-intent classification engine.

Your ONLY task is to analyze a cleaned YouTube transcript and classify
what type of article it can most naturally be converted into.

You MUST choose exactly ONE primary classification from the list below.

You are NOT allowed to:
- Write an article
- Suggest multiple primary types
- Invent content not present in the transcript
- Optimize for SEO
- Add tone, outline, or formatting suggestions

Your job is classification ONLY.

---

ALLOWED ARTICLE TYPES (EXACT MATCH REQUIRED):

{article_types}

If none apply clearly, choose the closest fit based on dominant intent.

---

CLASSIFICATION DEFINITIONS (USE THESE INTERNALLY):

{definitions}

---

ANALYSIS RULES:

1. Base classification ONLY on the transcript content.
2. Identify the dominant intent (teach, warn, persuade, analyze, report, tell, inspire, plan, review).
3. Ignore intros, ads, or calls-to-action unless they dominate the transcript.
4. Do NOT assume the creator's intent — infer from language and structure.
5. Choose the classification that best represents the majority of the transcript.
6. If classification seems ambiguous, still choose the most defensible best-fit type.

---

CONFIDENCE GUIDELINES:

- 0.80 – 1.00 → Clear, dominant signals
- 0.60 – 0.79 → Strong but mixed signals
- 0.40 – 0.59 → Ambiguous, best-fit choice
- Below 0.40 → Weak match (still must choose one)

---

OUTPUT FORMAT (STRICT JSON ONLY):

{{
  "classification": "<ONE article type from the allowed list>",
  "confidence": <float between 0.00 and 1.00>,
  "reasoning": "<1-2 sentence explanation of why this classification fits>"
}}

---

TRANSCRIPT:

{transcript}"""
    )

    # Build the full prompt for debugging
    full_prompt = prompt.format(
        transcript=transcript_for_classification,
        article_types=article_types_list,
        definitions=article_definitions,
    )
    logger.info(f"  Full prompt length: {len(full_prompt)} chars")

    logger.info("  Sending to Vertex AI for classification...")
    result = llm.invoke(full_prompt)
    logger.info("  Received response from Vertex AI")
    logger.info(f"  Raw response length: {len(result) if result else 0} chars")
    logger.info(f"  Raw response: {result[:1000] if result else 'EMPTY'}...")

    # Handle empty response
    if not result or not result.strip():
        logger.error("  Vertex AI returned empty response")
        raise RuntimeError("Classification failed: LLM returned empty response")

    logger.info(f"  Raw response preview: {result[:200]}...")

    # Parse JSON response using shared utility
    parsed = parse_json_response(result)
    logger.info("  Successfully parsed JSON response")

    classification = parsed.get("classification", "")
    confidence = float(parsed.get("confidence", 0.0))
    reasoning = parsed.get("reasoning", "")

    # Validate classification is in allowed list
    if classification not in allowed_article_types:
        logger.warning(
            f"  Classification '{classification}' not in allowed list, "
            f"using closest match"
        )
        # Find closest match (case-insensitive)
        for allowed in allowed_article_types:
            if allowed.lower() == classification.lower():
                classification = allowed
                break
        else:
            # Default to first type if no match found
            logger.warning("  No match found, defaulting to 'How-to Guides'")
            classification = "How-to Guides"

    output = Stage2Output(
        video_id=stage1.video_id,
        title=stage1.title,
        classification=classification,
        confidence=confidence,
        reasoning=(
            f"{reasoning} (mode={classification_mode})"
            if reasoning
            else f"mode={classification_mode}"
        ),
        debug_prompt=full_prompt,
        debug_raw_response=result,
    )

    logger.info(f"  Classification: {output.classification}")
    logger.info(f"  Confidence: {output.confidence:.2f}")
    logger.info(f"  Reasoning: {output.reasoning}")
    logger.info("=" * 60)

    return output
