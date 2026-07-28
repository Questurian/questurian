"""
Stage 1: Clean transcript text from the raw video record.
"""

from __future__ import annotations

import logging

from langchain_core.prompts import PromptTemplate

from app.features.youtube2blog.content.script import is_non_latin_script
from app.features.youtube2blog.config import (
    Y2B_PRIMARY_MODEL,
    Y2B_STAGE1_CHUNK_TARGET_CHARS,
    Y2B_STAGE1_CHUNKING_CHAR_THRESHOLD,
    Y2B_STAGE1_MAX_OUTPUT_TOKENS,
)
from shared import RawVideoRecord, Stage1Output
from utils import get_vertex_llm

logger = logging.getLogger(__name__)


PRIMARY_CLEANING_PROMPT = """You are cleaning a video transcript for downstream article generation.

This is a cleaning and translation task. The output must always be in English,
regardless of the transcript's source language.

REMOVE ONLY:
- greetings, channel branding, and outros
- sponsor reads, affiliate pitches, and housekeeping
- repetitive filler, verbal stumbles, and obvious off-topic tangents

KEEP INTACT OR NEAR-INTACT:
- explanations, arguments, walkthrough steps, examples, stories, and Q&A
- transitions between substantive sections
- warnings, caveats, comparisons, and nuanced details

Rules:
- If the transcript is not in English, translate it to English as you clean it.
- Do not compress several paragraphs into a short summary.
- If a passage contains useful instruction or analysis, keep it.
- When unsure, keep more rather than less.
- Return plain text only. No JSON, bullets, or commentary.

Transcript:
{transcript}"""

PRIMARY_CHUNK_CLEANING_PROMPT = """You are cleaning chunk {chunk_index} of {chunk_count}
from a longer video transcript for downstream article generation.

This is a cleaning and translation task. The output must always be in English,
regardless of the transcript's source language.

REMOVE ONLY:
- greetings, channel branding, and outros
- sponsor reads, affiliate pitches, and housekeeping
- repetitive filler, verbal stumbles, and obvious off-topic tangents

KEEP INTACT OR NEAR-INTACT:
- explanations, arguments, walkthrough steps, examples, stories, and Q&A
- transitions between substantive sections
- warnings, caveats, comparisons, and nuanced details

Rules:
- If the transcript is not in English, translate it to English as you clean it.
- Do not compress this chunk into an abstract or recap.
- If a passage contains useful instruction or analysis, keep it.
- When unsure, keep more rather than less.
- Return plain text only. No JSON, bullets, or commentary.

Transcript chunk:
{transcript}"""

REPAIR_CLEANING_PROMPT = """You are repairing a transcript-cleaning attempt that was too compressed.

The output must always be in English. If the original transcript was in another
language, continue working in English.

Goal:
- Keep meaningful core instructional content.
- Remove intros/outros, ads, calls-to-action, and filler.
- Avoid over-pruning; preserve enough detail to support article generation.
- Expand the draft when the prior attempt collapsed full sections into short summaries.

Hard constraints:
- This is still cleaning, not summarizing.
- Preserve chronology and the speaker's substantive meaning whenever practical.
- Keep major examples, key claims, explanatory paragraphs, and transitions.
- Do not summarize into bullets.
- Do not output JSON or commentary.
- When unsure, keep more of the original transcript's content.

Original transcript:
{transcript}

Previous cleaned attempt (too aggressive or too noisy):
{previous_cleaned}
"""

TRANSLATION_ENFORCEMENT_PROMPT = """If the following text is already in English, return it exactly as-is without any changes.
If it is in any other language, translate it to English while preserving all content, meaning, and structure.
Return only the text with no commentary or preamble.

Text:
{text}"""


def _needs_english_enforcement(text: str) -> bool:
    """True when text still carries enough non-Latin script to look untranslated."""
    return is_non_latin_script(text)


def _ensure_english(text: str, llm: object) -> str:
    """
    Repair a cleaning pass that failed to translate.

    This used to run unconditionally on both the transcript and the title. The
    transcript call re-emitted the entire cleaned transcript through the model
    on every run -- the expensive output tokens -- to almost always receive a
    byte-identical copy, because all three cleaning prompts already order a
    translation to English. Callers now gate it on evidence the translation did
    not happen.
    """
    logger.info("  Running English enforcement pass...")
    prompt = PromptTemplate(input_variables=["text"], template=TRANSLATION_ENFORCEMENT_PROMPT)
    result = llm.invoke(prompt.format(text=text))
    logger.info("  English enforcement complete: %d chars", len(result.strip()))
    return result.strip()


def _chunk_transcript(transcript: str, max_chars: int) -> list[str]:
    """Split long transcripts into ordered chunks without dropping text."""
    segments = [line.strip() for line in transcript.splitlines() if line.strip()]
    if not segments:
        stripped = transcript.strip()
        return [stripped] if stripped else []

    chunks: list[str] = []
    current = ""

    def _append_long_segment(segment: str) -> None:
        words = segment.split()
        if not words:
            return
        current_words = ""
        for word in words:
            candidate = f"{current_words} {word}".strip()
            if current_words and len(candidate) > max_chars:
                chunks.append(current_words)
                current_words = word
            else:
                current_words = candidate
        if current_words:
            chunks.append(current_words)

    for segment in segments:
        if len(segment) > max_chars:
            if current:
                chunks.append(current)
                current = ""
            _append_long_segment(segment)
            continue

        candidate = f"{current}\n{segment}".strip() if current else segment
        if current and len(candidate) > max_chars:
            chunks.append(current)
            current = segment
        else:
            current = candidate

    if current:
        chunks.append(current)

    return chunks


def _invoke_cleaning_prompt(
    *,
    transcript: str,
    llm: object,
    mode: str,
    previous_cleaned: str | None = None,
    chunk_index: int | None = None,
    chunk_count: int | None = None,
) -> str:
    if mode == "repair":
        prompt = PromptTemplate(
            input_variables=["transcript", "previous_cleaned"],
            template=REPAIR_CLEANING_PROMPT,
        )
        llm_input = prompt.format(
            transcript=transcript,
            previous_cleaned=(previous_cleaned or "").strip()[:12000],
        )
    elif chunk_index is not None and chunk_count is not None:
        prompt = PromptTemplate(
            input_variables=["transcript", "chunk_index", "chunk_count"],
            template=PRIMARY_CHUNK_CLEANING_PROMPT,
        )
        llm_input = prompt.format(
            transcript=transcript,
            chunk_index=chunk_index,
            chunk_count=chunk_count,
        )
    else:
        prompt = PromptTemplate(
            input_variables=["transcript"],
            template=PRIMARY_CLEANING_PROMPT,
        )
        llm_input = prompt.format(transcript=transcript)

    result = llm.invoke(llm_input)
    return result.strip()


def _clean_transcript_impl(
    *,
    record: RawVideoRecord,
    mode: str,
    previous_cleaned: str | None = None,
    model_name: str = Y2B_PRIMARY_MODEL,
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
        max_tokens=Y2B_STAGE1_MAX_OUTPUT_TOKENS,
        model_name=model_name,
    )

    logger.info("  Sending to Vertex AI...")
    if (
        mode == "primary"
        and len(record.transcript) >= Y2B_STAGE1_CHUNKING_CHAR_THRESHOLD
    ):
        transcript_chunks = _chunk_transcript(
            record.transcript,
            max_chars=Y2B_STAGE1_CHUNK_TARGET_CHARS,
        )
        if len(transcript_chunks) > 1:
            logger.info(
                "  Long transcript detected; cleaning %d chunks (target=%d chars)",
                len(transcript_chunks),
                Y2B_STAGE1_CHUNK_TARGET_CHARS,
            )
            cleaned_chunks: list[str] = []
            for chunk_index, transcript_chunk in enumerate(transcript_chunks, start=1):
                logger.info(
                    "  Cleaning chunk %d/%d (%d chars)",
                    chunk_index,
                    len(transcript_chunks),
                    len(transcript_chunk),
                )
                cleaned_chunk = _invoke_cleaning_prompt(
                    transcript=transcript_chunk,
                    llm=llm,
                    mode=mode,
                    chunk_index=chunk_index,
                    chunk_count=len(transcript_chunks),
                )
                if cleaned_chunk:
                    cleaned_chunks.append(cleaned_chunk)
            cleaned_transcript = "\n\n".join(cleaned_chunks).strip()
        else:
            cleaned_transcript = _invoke_cleaning_prompt(
                transcript=record.transcript,
                llm=llm,
                mode=mode,
            )
    else:
        cleaned_transcript = _invoke_cleaning_prompt(
            transcript=record.transcript,
            llm=llm,
            mode=mode,
            previous_cleaned=previous_cleaned,
        )
    logger.info("  Received response from Vertex AI")

    if _needs_english_enforcement(cleaned_transcript):
        cleaned_transcript = _ensure_english(cleaned_transcript, llm)
    english_title = record.title
    if _needs_english_enforcement(english_title):
        english_title = _ensure_english(english_title, llm)

    output = Stage1Output(
        video_id=record.video_id,
        title=english_title,
        cleaned_transcript=cleaned_transcript,
    )

    logger.info("  Output transcript: %d chars", len(output.cleaned_transcript))
    reduction = 100 - (
        len(output.cleaned_transcript) / max(1, len(record.transcript)) * 100
    )
    logger.info("  Reduction: %.1f%%", reduction)
    logger.info("=" * 60)
    return output


def stage_1_clean_transcript(record: RawVideoRecord, *, model_name: str = Y2B_PRIMARY_MODEL) -> Stage1Output:
    """Primary stage-1 transcript cleaning."""
    return _clean_transcript_impl(record=record, mode="primary", model_name=model_name)


def stage_1_repair_transcript(
    record: RawVideoRecord,
    previous_cleaned: str | None,
    *,
    model_name: str = Y2B_PRIMARY_MODEL,
) -> Stage1Output:
    """Repair cleaning pass used by branch retry."""
    return _clean_transcript_impl(
        record=record,
        mode="repair",
        previous_cleaned=previous_cleaned,
        model_name=model_name,
    )
