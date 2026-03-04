"""
Stage 1: Clean transcript text from the raw video record.
"""

from __future__ import annotations

import logging

from langchain_core.prompts import PromptTemplate

from app.features.youtube2blog.config import Y2B_PRIMARY_MODEL
from shared import RawVideoRecord, Stage1Output
from utils import get_vertex_llm

logger = logging.getLogger(__name__)


PRIMARY_CLEANING_PROMPT = """You are a transcript cleaner. Extract ONLY the core content from this video transcript.

REMOVE:
- Intros and outros ("Hey everyone, welcome back...")
- Ad reads and sponsor segments ("This video is sponsored by...")
- Calls to action ("Don't forget to like and subscribe...")
- Off-topic tangents
- Filler phrases and repetition

KEEP:
- Main educational/informational content
- Key examples and explanations
- Important quotes and insights

Return ONLY the cleaned transcript text. No JSON, no explanations - just the cleaned content.

Transcript:
{transcript}"""

REPAIR_CLEANING_PROMPT = """You are repairing a transcript-cleaning attempt.

Goal:
- Keep meaningful core instructional content.
- Remove intros/outros, ads, calls-to-action, and filler.
- Avoid over-pruning; preserve enough detail to support article generation.

Hard constraints:
- Output plain text only.
- Keep major examples, key claims, and explanatory paragraphs.
- Do not summarize into bullets.
- Do not output JSON or commentary.

Original transcript:
{transcript}

Previous cleaned attempt (too aggressive or too noisy):
{previous_cleaned}
"""


def _clean_transcript_impl(
    *,
    record: RawVideoRecord,
    mode: str,
    previous_cleaned: str | None = None,
) -> Stage1Output:
    """Clean transcript in primary or repair mode."""
    if mode not in {"primary", "repair"}:
        raise ValueError(f"Unsupported transcript clean mode: {mode}")

    logger.info("=" * 60)
    logger.info("STAGE 1: Cleaning transcript with AI (%s mode)", mode)
    logger.info("=" * 60)
    logger.info("  Video: %s", record.title)
    logger.info("  Input transcript: %d chars", len(record.transcript))

    llm = get_vertex_llm(
        temperature=0.1,
        max_tokens=8000,
        model_name=Y2B_PRIMARY_MODEL,
    )

    if mode == "repair":
        prompt = PromptTemplate(
            input_variables=["transcript", "previous_cleaned"],
            template=REPAIR_CLEANING_PROMPT,
        )
        llm_input = prompt.format(
            transcript=record.transcript,
            previous_cleaned=(previous_cleaned or "").strip()[:12000],
        )
    else:
        prompt = PromptTemplate(
            input_variables=["transcript"],
            template=PRIMARY_CLEANING_PROMPT,
        )
        llm_input = prompt.format(transcript=record.transcript)

    logger.info("  Sending to Vertex AI...")
    result = llm.invoke(llm_input)
    logger.info("  Received response from Vertex AI")

    cleaned_transcript = result.strip()
    output = Stage1Output(
        video_id=record.video_id,
        title=record.title,
        cleaned_transcript=cleaned_transcript,
    )

    logger.info("  Output transcript: %d chars", len(output.cleaned_transcript))
    reduction = 100 - (
        len(output.cleaned_transcript) / max(1, len(record.transcript)) * 100
    )
    logger.info("  Reduction: %.1f%%", reduction)
    logger.info("=" * 60)
    return output


def stage_1_clean_transcript(record: RawVideoRecord) -> Stage1Output:
    """Primary stage-1 transcript cleaning."""
    return _clean_transcript_impl(record=record, mode="primary")


def stage_1_repair_transcript(
    record: RawVideoRecord,
    previous_cleaned: str | None,
) -> Stage1Output:
    """Repair cleaning pass used by branch retry."""
    return _clean_transcript_impl(
        record=record,
        mode="repair",
        previous_cleaned=previous_cleaned,
    )
