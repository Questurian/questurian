"""Prompt building and validation for research-backed listicle generation."""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Literal

from app.shared.prompts import ANTI_AI_TELLS_BLURB
from app.shared.text import normalize_dashes

ListicleArticleType = Literal["single-type-listicle", "listicle-itinerary"]
ListicleFieldType = Literal["intro", "blurb"]
ListicleCategory = Literal[
    "dining",
    "accommodations",
    "attractions",
    "nightlife",
    "key_location",
]
ListTone = Literal[
    "elevated", "casual", "hidden-gem", "family-friendly", "date-night", "budget"
]

ListicleAngle = Literal[
    "signature-dish",
    "atmosphere",
    "founders-backstory",
    "insider-tip",
    "best-for",
    "whats-different",
]

LISTICLE_ANGLE_GUIDANCE: dict[ListicleAngle, str] = {
    "signature-dish": (
        "Sentence 1 must name one specific dish or item. Not a category, not a metaphor about the "
        "cooking — the dish itself, by name. Build the rest of the blurb around it. If the context "
        "does not contain a named dish, switch to whats-different rather than inventing one."
    ),
    "atmosphere": (
        "Sentence 1 must place the reader in the room using one concrete physical detail (the light, "
        "the seating count, the music, a material, the crowd at a specific hour). No mood adjectives "
        "in the lead. The food is supporting evidence, not the headline."
    ),
    "founders-backstory": (
        "Sentence 1 must name the person and one specific fact about them (where they trained, what "
        "they ran before, the year they opened). Only choose this angle if those facts are in the "
        "context. If the signal is thin, switch to atmosphere — do not invent a backstory."
    ),
    "insider-tip": (
        "Sentence 1 must deliver one specific, actionable tip a first-time visitor would not guess "
        "(a time, a seat, an order, a side door). No setup, no hedging, no clever metaphor — the "
        "tip is the lead. Avoid clipped imperative closers; the tip belongs at the top, not the end."
    ),
    "best-for": (
        "Sentence 1 must name the occasion or audience the venue serves best, then immediately back "
        "it with one concrete reason (a feature of the room, the menu, the pacing, the price). "
        "Assertion plus evidence in the same opening, not assertion alone."
    ),
    "whats-different": (
        "Sentence 1 must name the specific thing that sets this place apart from neighboring options "
        "of the same kind (a technique, a sourcing choice, a format, a hybrid). Comparative without "
        "naming competitors. No 'X rather than Y' constructions — state the differentiator directly."
    ),
}


LIST_TONE_GUIDANCE: dict[ListTone, str] = {
    "elevated": (
        "Polished, refined, slightly formal. Confident editorial voice; favor precise nouns over hype."
    ),
    "casual": (
        "Friendly and conversational. Approachable cadence; second person sparingly; never breezy or chatty to a fault."
    ),
    "hidden-gem": (
        "Insider, discovery-led. Frame the venue as a find; avoid clichés like \"best-kept secret\"; concrete specifics over mystique."
    ),
    "family-friendly": (
        "Warm and practical. Note the things parents and kids will actually care about; never condescending or saccharine."
    ),
    "date-night": (
        "Intimate and atmospheric. Lean on lighting, music, room feel, and pacing; never crass or sentimental."
    ),
    "budget": (
        "Value-focused and practical. Be direct about what makes it affordable; never patronizing about price."
    ),
}

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
        stripped = fenced.group(1).strip()
    else:
        for prefix in ("Paragraph:", "Intro:", "Blurb:", "Copy:"):
            if stripped.startswith(prefix):
                stripped = stripped[len(prefix):].strip()
                break
    return normalize_dashes(stripped)


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
    voice_block = _voice_rules_block(category, target.field_type)
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
        f"{custom_block}"
        f"{voice_block}\n\n"
        "Output:\n"
        "One blurb paragraph only."
    ).strip()


def _voice_rules_block(category: ListicleCategory | None, field_type: ListicleFieldType) -> str:
    # Dining-blurb pilot only. Other categories and intros are unaffected
    # until the pilot's stopping rule (≥70% banned-phrase reduction across 20
    # blurbs AND zero fabricated anchors) is met.
    if field_type != "blurb" or category != "dining":
        return ""
    return f"\n\n{ANTI_AI_TELLS_BLURB}"


def _tone_block(list_tone: ListTone | None) -> str:
    if list_tone is None:
        return ""
    guidance = LIST_TONE_GUIDANCE.get(list_tone)
    if not guidance:
        return ""
    return f"\n\nLIST TONE\n{list_tone}: {guidance}"


def _angle_block(listicle_angle: ListicleAngle | None) -> str:
    if listicle_angle is None:
        return ""
    guidance = LISTICLE_ANGLE_GUIDANCE.get(listicle_angle)
    if not guidance:
        return ""
    return f"\n\nBLURB ANGLE\n{listicle_angle}: {guidance}"


def build_writer_prompt(
    *,
    article_title: str,
    article_type: ListicleArticleType,
    article_location: str,
    target: ListicleWriterTarget,
    article_context: str,
    custom_instruction: str = "",
    list_tone: ListTone | None = None,
    listicle_angle: ListicleAngle | None = None,
) -> str:
    """Writer-only prompt: same shape as build_generation_prompt but without
    the "research this online" instruction. Used when LOCATION FACTS (and
    optionally Fallback Research findings) have already been supplied in
    supporting_context.
    """
    article_type_label = ARTICLE_TYPE_LABELS[article_type]
    rendered_context = _render_supporting_context(target.supporting_context, article_context)
    tone_block = _tone_block(list_tone)
    # Angle only applies to blurbs; intros are list-level and have no per-item angle.
    angle_block = _angle_block(listicle_angle) if target.field_type == "blurb" else ""
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
            f"Location:\n{article_location.strip()}"
            f"{tone_block}\n"
            f"{context_block}"
            f"{current_copy_block}"
            "\n\nTask:\n"
            "Use the supplied context as the source of truth. Write one publication-ready intro paragraph. "
            "If CURRENT BUILDER COPY is present, treat it as a draft reference only and improve it freely. "
            "Do not invent details beyond what the context supports.\n\n"
            "Requirements:\n"
            f"{rules}\n"
            f"- {itinerary_context}\n"
            "- Make clear what kind of experience this article delivers in this location.\n"
            f"{'- Match the LIST TONE precisely.' + chr(10) if tone_block else ''}"
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
    voice_block = _voice_rules_block(category, target.field_type)
    return (
        "You are writing a blurb for a travel listicle in the style of a polished digital publication. "
        f"Write like a confident {variant['editor_role']}, not like a review summary.\n\n"
        f"Article type:\n{article_type_label}\n\n"
        f"Article title:\n{article_title.strip()}\n\n"
        f"{subject_label}:\n{subject_name}\n\n"
        f"Location:\n{subject_location}"
        f"{tone_block}"
        f"{angle_block}\n"
        f"{context_block}"
        f"{current_copy_block}"
        "\n\nTask:\n"
        "Use the supplied context as the source of truth. Write one publication-ready blurb. "
        "If CURRENT BUILDER COPY is present, treat it as a draft reference only and improve it freely. "
        "Do not invent details beyond what the context supports.\n\n"
        "Requirements:\n"
        f"{rules}\n"
        f"- {variant['focus']}\n"
        "- Make clear why it belongs in this specific list.\n"
        "- Anchor the writing in the concrete facts you have; do not speculate.\n"
        f"{'- Match the LIST TONE precisely.' + chr(10) if tone_block else ''}"
        f"{'- Lead from the BLURB ANGLE; let it shape the first sentence.' + chr(10) if angle_block else ''}"
        "- Keep the writing concise, polished, and specific.\n"
        f"{custom_block}"
        f"{voice_block}\n\n"
        "Output:\n"
        "One blurb paragraph only."
    ).strip()


def build_fallback_research_prompt(
    *,
    subject_name: str,
    subject_location: str,
    category: ListicleCategory,
    gap_descriptions: list[str],
) -> str:
    """Scoped research prompt: returns short structured findings keyed to the
    specific Tier-2 gaps the LM record could not fill. Intended for a single
    Gemini call with Google Search grounding. Output is meant to be injected
    into the writer prompt's supporting_context, not shown to the operator.
    """
    variant = CATEGORY_PROMPT_VARIANTS.get(category) or CATEGORY_PROMPT_VARIANTS["dining"]
    gaps_block = "\n".join(f"- {gap}" for gap in gap_descriptions) or "- general overview"
    return (
        f"You are a research assistant gathering verified facts about a specific {variant['label'].lower()} venue. "
        f"You will be given the venue name and location, plus a list of information gaps. "
        f"Research only the gaps; do not summarize the entire venue.\n\n"
        f"Venue:\n{subject_name}\n\n"
        f"Location:\n{subject_location}\n\n"
        f"Information gaps to fill:\n{gaps_block}\n\n"
        f"Research guidance:\n{variant['research']}\n\n"
        "Output rules:\n"
        "- Return short bullet points, one fact per line, prefixed by the gap label.\n"
        "- No prose, no marketing language, no opinions, no review quotes.\n"
        "- If a gap cannot be answered from credible sources, write 'unknown' for that gap.\n"
        "- Do not include URLs, citation markers, or source names in the body.\n"
        "- Maximum 12 bullets total.\n\n"
        "Output:\n"
        "Bulleted research findings only."
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
    list_tone: ListTone | None = None,
    listicle_angle: ListicleAngle | None = None,
) -> str:
    failures = "\n".join(f"- {item}" for item in validation_errors)
    base_prompt = build_writer_prompt(
        article_title=article_title,
        article_type=article_type,
        article_location=article_location,
        target=target,
        article_context=article_context,
        custom_instruction=custom_instruction,
        list_tone=list_tone,
        listicle_angle=listicle_angle,
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
