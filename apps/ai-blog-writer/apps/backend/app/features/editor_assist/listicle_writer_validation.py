"""Output normalization and validation for Listicle Content Generation."""

import re

from .listicle_prompt_policy import (
    BLURB_MAX_WORDS,
    BLURB_MIN_WORDS,
    INTRO_MAX_WORDS,
    INTRO_MIN_WORDS,
    REVIEW_DISCLOSURE_PHRASES,
)
from .listicle_writer_contracts import ListicleFieldType

WORD_PATTERN = re.compile(r"[A-Za-z0-9']+")
RATING_PATTERN = re.compile(
    r"\b(?:rating|ratings|rated|review score|review scores|score|scores|stars?)\b",
    flags=re.I,
)
HEADING_PATTERN = re.compile(r"^\s*(?:#{1,6}\s+|\*\*.+\*\*$)", flags=re.M)
BULLET_PATTERN = re.compile(r"^\s*(?:[-*]|\d+\.)\s+", flags=re.M)
FOOTNOTE_PATTERN = re.compile(r"\[\d+\]")
EM_DASH_PATTERN = re.compile("—")
PROCESS_PATTERN = re.compile(
    r"\b(?:reviews?\s+say|reviewers?\s+say|diners?\s+say|articles?\s+say|based on reviews?|according to reviews?)\b",
    flags=re.I,
)
FENCE_PATTERN = re.compile(
    r"^\s*```(?:markdown|md|text)?\s*(.*?)\s*```\s*$", flags=re.S | re.I
)


def strip_generation_fence(text: str) -> str:
    stripped = text.strip()
    fenced = FENCE_PATTERN.match(stripped)
    if fenced:
        stripped = fenced.group(1).strip()
    else:
        for prefix in ("Paragraph:", "Intro:", "Blurb:", "Copy:"):
            if stripped.startswith(prefix):
                stripped = stripped[len(prefix) :].strip()
                break
    return stripped


def normalize_block(text: str) -> str:
    return re.sub(r"[ \t]+", " ", text.strip())


def word_count(text: str) -> int:
    return len(WORD_PATTERN.findall(text))


def validate_generated_text(
    *,
    field_type: ListicleFieldType,
    text: str,
) -> list[str]:
    errors: list[str] = []
    stripped = strip_generation_fence(text)
    normalized = normalize_block(stripped)

    if not normalized:
        return ["Output is empty."]

    if "\n" in stripped:
        errors.append("Output must be a single paragraph.")

    if HEADING_PATTERN.search(stripped):
        errors.append("Output must not include a heading or subheading.")

    if BULLET_PATTERN.search(stripped):
        errors.append("Output must not include bullet points or numbered lists.")

    if FOOTNOTE_PATTERN.search(stripped):
        errors.append("Output must not include citation markers.")

    if EM_DASH_PATTERN.search(text):
        errors.append("Output must not include em dashes.")

    if RATING_PATTERN.search(stripped):
        errors.append("Output must not mention ratings, stars, or scores.")

    lowered = normalized.casefold()
    if PROCESS_PATTERN.search(stripped) or any(
        phrase in lowered for phrase in REVIEW_DISCLOSURE_PHRASES
    ):
        errors.append("Output must not expose the research or review process.")

    count = word_count(normalized)
    if field_type == "blurb" and (count < BLURB_MIN_WORDS or count > BLURB_MAX_WORDS):
        errors.append(
            f"Blurb must be between {BLURB_MIN_WORDS} and {BLURB_MAX_WORDS} words."
        )
    if field_type == "intro" and (count < INTRO_MIN_WORDS or count > INTRO_MAX_WORDS):
        errors.append(
            f"Intro must be between {INTRO_MIN_WORDS} and {INTRO_MAX_WORDS} words."
        )

    return errors
