"""Prompt building and validation for research-backed listicle generation."""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Literal

ListicleArticleType = Literal["single-type-listicle", "listicle-itinerary"]
ListicleFieldType = Literal["intro", "blurb"]
ListicleCategory = Literal[
    "dining",
    "accommodations",
    "attractions",
    "nightlife",
    "key_location",
]

BLURB_MIN_WORDS = 90
BLURB_MAX_WORDS = 140
INTRO_MIN_WORDS = 80
INTRO_MAX_WORDS = 120

REVIEW_DISCLOSURE_PHRASES = (
    "reviews say",
    "reviewers say",
    "diners love",
    "diners say",
    "guests love",
    "guests say",
    "articles say",
    "based on reviews",
    "according to reviews",
    "recent reviews",
    "recent articles",
)

CATEGORY_PROMPT_VARIANTS: dict[ListicleCategory, dict[str, str]] = {
    "dining": {
        "label": "Dining",
        "editor_role": "food and travel editor",
        "subject_label": "Restaurant name",
        "focus": (
            "Focus on the food, specialties, atmosphere, and the kind of meal or outing "
            "the place delivers."
        ),
        "research": "Prioritize the official site, menu pages if available, then recent articles and recent diner reviews.",
    },
    "accommodations": {
        "label": "Accommodations",
        "editor_role": "travel editor",
        "subject_label": "Property name",
        "focus": (
            "Focus on the setting, room style, design, amenities, service rhythm, and "
            "what kind of stay the property delivers."
        ),
        "research": "Prioritize the official property site, room and amenity pages, then recent articles and recent guest reviews.",
    },
    "attractions": {
        "label": "Attractions",
        "editor_role": "travel editor",
        "subject_label": "Attraction name",
        "focus": (
            "Focus on the main draw, atmosphere, setting, pacing, and the kind of visit "
            "or moment the attraction offers."
        ),
        "research": "Prioritize the official venue or attraction site, practical visit pages, then recent articles and recent visitor reviews.",
    },
    "nightlife": {
        "label": "Nightlife",
        "editor_role": "food and nightlife editor",
        "subject_label": "Venue name",
        "focus": (
            "Focus on the drinks or music program, room feel, energy, crowd, and the "
            "night out the venue delivers."
        ),
        "research": "Prioritize the official venue site or social pages, menus if available, then recent articles and recent guest reviews.",
    },
    "key_location": {
        "label": "Key Location",
        "editor_role": "travel editor",
        "subject_label": "Place name",
        "focus": (
            "Focus on the atmosphere, defining features, and the kind of experience or "
            "pause this place adds to an itinerary."
        ),
        "research": "Prioritize the official site if available, practical destination pages, then recent articles and recent visitor reviews.",
    },
}

ARTICLE_TYPE_LABELS: dict[ListicleArticleType, str] = {
    "single-type-listicle": "single-type travel listicle",
    "listicle-itinerary": "listicle itinerary",
}

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
FENCE_PATTERN = re.compile(r"^\s*```(?:markdown|md|text)?\s*(.*?)\s*```\s*$", flags=re.S | re.I)


@dataclass(frozen=True)
class ListicleWriterTarget:
    target_id: str
    field_type: ListicleFieldType
    category: ListicleCategory | None
    display_name: str | None = None
    research_subject: str | None = None
    location_label: str | None = None
    current_content: str = ""
    supporting_context: str = ""


def strip_generation_fence(text: str) -> str:
    stripped = text.strip()
    fenced = FENCE_PATTERN.match(stripped)
    if fenced:
        return fenced.group(1).strip()

    for prefix in ("Paragraph:", "Intro:", "Blurb:", "Copy:"):
        if stripped.startswith(prefix):
            return stripped[len(prefix):].strip()
    return stripped


def _normalize_block(text: str) -> str:
    return re.sub(r"[ \t]+", " ", text.strip())


def _word_count(text: str) -> int:
    return len(WORD_PATTERN.findall(text))


def _build_common_rules(*, field_type: ListicleFieldType) -> list[str]:
    lines = [
        "Use the online research to inform the copy, but never mention reviews, reviewers, diners, guests, articles, sources, or the research process.",
        "Do not mention ratings, stars, or review scores.",
        "Do not invent details.",
        "Do not sound like a hotel brochure, tourist ad, or AI summary.",
        "No em dashes.",
    ]
    if field_type == "blurb":
        lines.insert(0, f"Write one paragraph of about {BLURB_MIN_WORDS} to {BLURB_MAX_WORDS} words.")
        lines.insert(1, "Do not include a heading or subheading. The subject title is rendered elsewhere in the builder.")
    else:
        lines.insert(0, f"Write one intro paragraph of about {INTRO_MIN_WORDS} to {INTRO_MAX_WORDS} words.")
        lines.insert(1, "Do not include a heading or subheading.")
    return lines


def _render_supporting_context(supporting_context: str, article_context: str) -> str:
    sections: list[str] = []
    if supporting_context.strip():
        sections.append(f"BUILDER CONTEXT\n{supporting_context.strip()}")
    if article_context.strip():
        sections.append(f"ARTICLE CONTEXT\n{article_context.strip()}")
    return "\n\n".join(sections)


def build_generation_prompt(
    *,
    article_title: str,
    article_type: ListicleArticleType,
    article_location: str,
    target: ListicleWriterTarget,
    article_context: str,
    custom_instruction: str = "",
) -> str:
    article_type_label = ARTICLE_TYPE_LABELS[article_type]
    rendered_context = _render_supporting_context(target.supporting_context, article_context)
    current_copy_block = (
        f"\n\nCURRENT BUILDER COPY\n{target.current_content.strip()}"
        if target.current_content.strip()
        else ""
    )

    if target.field_type == "intro":
        rules = "\n".join(f"- {line}" for line in _build_common_rules(field_type="intro"))
        itinerary_context = (
            "Frame the piece like a polished itinerary opener that previews the overall day or sequence."
            if article_type == "listicle-itinerary"
            else "Frame the piece like a polished publication intro that sets up the list without turning into a table of contents."
        )
        custom_block = (
            f"\n\nCUSTOM INSTRUCTION\n{custom_instruction.strip()}"
            if custom_instruction.strip()
            else ""
        )
        context_block = f"\n\n{rendered_context}" if rendered_context else ""
        return (
            "You are writing the intro for a travel listicle in the style of a polished digital publication. "
            "Write like a confident travel editor, not like a review summary.\n\n"
            f"Article type:\n{article_type_label}\n\n"
            f"Article title:\n{article_title.strip()}\n\n"
            f"Location:\n{article_location.strip()}\n"
            f"{context_block}"
            f"{current_copy_block}"
            "\n\nTask:\n"
            "First, research the destination and the venues, stops, or experiences referenced online. "
            "Use official sites first where available, then recent articles and recent user feedback to verify specifics. "
            "Then write one publication-ready intro paragraph based on that research. "
            "If CURRENT BUILDER COPY is present, treat it as a draft reference only and improve it freely.\n\n"
            "Requirements:\n"
            f"{rules}\n"
            f"- {itinerary_context}\n"
            "- Make clear what kind of experience this article delivers in this location.\n"
            "- Keep the writing concise, polished, and specific.\n"
            f"{custom_block}\n\n"
            "Output:\n"
            "One intro paragraph only."
        ).strip()

    category = target.category or "dining"
    variant = CATEGORY_PROMPT_VARIANTS[category]
    rules = "\n".join(f"- {line}" for line in _build_common_rules(field_type="blurb"))
    subject_label = variant["subject_label"]
    subject_name = (target.research_subject or target.display_name or "").strip()
    subject_location = (target.location_label or article_location).strip()
    custom_block = (
        f"\n\nCUSTOM INSTRUCTION\n{custom_instruction.strip()}"
        if custom_instruction.strip()
        else ""
    )
    context_block = f"\n\n{rendered_context}" if rendered_context else ""
    return (
        "You are writing a blurb for a travel listicle in the style of a polished digital publication. "
        f"Write like a confident {variant['editor_role']}, not like a review summary.\n\n"
        f"Article type:\n{article_type_label}\n\n"
        f"Article title:\n{article_title.strip()}\n\n"
        f"{subject_label}:\n{subject_name}\n\n"
        f"Location:\n{subject_location}\n"
        f"{context_block}"
        f"{current_copy_block}"
        "\n\nTask:\n"
        f"First, research this {variant['label'].lower()} online. {variant['research']} "
        "Then write one publication-ready blurb based on that research. "
        "If CURRENT BUILDER COPY is present, treat it as a draft reference only and improve it freely.\n\n"
        "Requirements:\n"
        f"{rules}\n"
        f"- {variant['focus']}\n"
        "- Make clear why it belongs in this specific list.\n"
        "- Absorb the research into direct, confident editorial writing.\n"
        "- Keep the writing concise, polished, and specific.\n"
        f"{custom_block}\n\n"
        "Output:\n"
        "One blurb paragraph only."
    ).strip()


def build_retry_prompt(
    *,
    article_title: str,
    article_type: ListicleArticleType,
    article_location: str,
    target: ListicleWriterTarget,
    article_context: str,
    custom_instruction: str,
    current_output: str,
    validation_errors: list[str],
) -> str:
    failures = "\n".join(f"- {item}" for item in validation_errors)
    base_prompt = build_generation_prompt(
        article_title=article_title,
        article_type=article_type,
        article_location=article_location,
        target=target,
        article_context=article_context,
        custom_instruction=custom_instruction,
    )
    return (
        f"{base_prompt}\n\n"
        "REVISION TASK\n"
        "The previous draft did not pass validation. Rewrite it so it fully complies.\n\n"
        f"VALIDATION FAILURES\n{failures}\n\n"
        f"CURRENT DRAFT\n{current_output.strip()}\n\n"
        "Return only the corrected final paragraph."
    ).strip()


def validate_generated_text(
    *,
    field_type: ListicleFieldType,
    text: str,
) -> list[str]:
    errors: list[str] = []
    stripped = strip_generation_fence(text)
    normalized = _normalize_block(stripped)

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

    if EM_DASH_PATTERN.search(stripped):
        errors.append("Output must not include em dashes.")

    if RATING_PATTERN.search(stripped):
        errors.append("Output must not mention ratings, stars, or scores.")

    lowered = normalized.casefold()
    if PROCESS_PATTERN.search(stripped) or any(phrase in lowered for phrase in REVIEW_DISCLOSURE_PHRASES):
        errors.append("Output must not expose the research or review process.")

    word_count = _word_count(normalized)
    if field_type == "blurb" and (word_count < BLURB_MIN_WORDS or word_count > BLURB_MAX_WORDS):
        errors.append(
            f"Blurb must be between {BLURB_MIN_WORDS} and {BLURB_MAX_WORDS} words."
        )
    if field_type == "intro" and (word_count < INTRO_MIN_WORDS or word_count > INTRO_MAX_WORDS):
        errors.append(
            f"Intro must be between {INTRO_MIN_WORDS} and {INTRO_MAX_WORDS} words."
        )

    return errors
