"""Prompt building and validation for research-backed listicle generation."""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Literal

from app.shared.prompts import ANTI_AI_TELLS_BLURB

from .angle_assignment import ANTI_AI_PROMPT_CATEGORIES, ListicleAngle
from .writer_brief import WriterBrief, render_source_facts_block

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

LISTICLE_ANGLE_GUIDANCE: dict[ListicleAngle, str] = {
    # ---------- Dining ----------
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
    # ---------- Accommodations ----------
    "location-and-setting": (
        "Sentence 1 must place the property in its physical setting using one concrete geographic detail "
        "(beachfront on a named bay, perched on a ridge above the medina, set into the old quarter of a "
        "named city). No vague positioning like 'centrally located' — name what's actually around it. "
        "Geography anchors the blurb, especially in itineraries."
    ),
    "view-and-vista": (
        "Sentence 1 must name what guests actually see (the volcano from south-facing rooms, the rooftop "
        "view over the cathedral, the courtyard pool from the suite balcony). One concrete sightline with "
        "one specific fact about where in the property it lives. No 'sweeping panoramas' or 'stunning views'."
    ),
    "design-and-aesthetic": (
        "Sentence 1 must describe one concrete material, design choice, or named space — the lobby's "
        "exposed-stone walls, the restaurant's open kitchen, the pool deck's terrazzo, a clawfoot tub in "
        "the suites. Public spaces often carry more identity than rooms; lead with whichever is strongest. "
        "No vibe adjectives like 'thoughtfully designed' or 'well-appointed' — describe what's actually there."
    ),
    "signature-amenity": (
        "Sentence 1 must name one specific standalone feature that defines the stay (the rooftop hammam, "
        "the private beach club, the library, the observatory) and one concrete fact about it (the floor "
        "it's on, the hours it runs, who designed it). Reserve for features that are genuinely distinctive — "
        "not every property has one. If no distinctive amenity is in the context, switch to design-and-aesthetic "
        "rather than inventing one."
    ),
    "food-and-beverage": (
        "Sentence 1 must name a specific on-site restaurant, bar, breakfast, or rooftop and one concrete fact "
        "about it (the chef, the cuisine, the hours, the cocktail program). The F&B is often the draw — sometimes "
        "the property is built around it. If F&B is generic or only breakfast-tier, switch to design-and-aesthetic "
        "or signature-amenity rather than padding."
    ),
    "trip-fit": (
        "Sentence 1 must name the kind of trip the property serves best (a honeymoon, a long remote-work stay, "
        "a family with toddlers, a solo business swing) and immediately back it with one concrete reason (a room "
        "configuration, a service rhythm, a quiet floor, kid amenities, a workspace setup). Assertion plus evidence "
        "in the same opening."
    ),
    "property-backstory": (
        "Sentence 1 must name the owner, designer, or origin year and one specific fact about it (a former "
        "use of the building, the architect, the family that runs it). Only choose this angle if the facts "
        "are in the context. If the signal is thin, switch to design-and-aesthetic — do not invent history. "
        "Most chain properties have no real backstory; pick something else."
    ),
    "booking-tip": (
        "Sentence 1 must deliver one specific, actionable booking or stay tip a first-time guest would "
        "not guess (a specific room number worth requesting, the cheapest night of the week, what time "
        "to arrive for the best check-in). No clipped imperative closers; the tip belongs at the top."
    ),
    # ---------- Attractions ----------
    "signature-feature": (
        "Sentence 1 must name the single specific thing the attraction is built around (a named "
        "painting, a specific room, a viewpoint, a route) and one concrete fact about it (height, age, "
        "scale, when it opens). If no named feature is in the context, switch to setting rather than "
        "inventing one."
    ),
    "setting": (
        "Sentence 1 must place the reader at the site using one concrete physical detail (the approach, "
        "the light at a specific hour, the surrounding terrain, the material the building is made of). "
        "No mood adjectives in the lead."
    ),
    "history-built": (
        "Sentence 1 must name when the place was built or founded and one specific fact tied to the "
        "date (who designed it, what it replaced, what war or movement it survived). Only choose this "
        "angle if those facts are in the context. If the signal is thin, switch to setting — do not "
        "invent dates."
    ),
    "visit-time-tip": (
        "Sentence 1 must deliver one specific, actionable visit tip a first-time visitor would not "
        "guess (a time of day, a side entrance, an order to walk the rooms, a ticket trick). No "
        "clipped imperative closers; the tip belongs at the top."
    ),
    "best-for-visit-type": (
        "Sentence 1 must name the kind of visit the place serves best (a half-day with kids, a rainy "
        "afternoon, a quick photo stop, a full-day deep dive) and immediately back it with one "
        "concrete reason (the pacing, the layout, what's covered, what's nearby)."
    ),
    # ---------- Nightlife ----------
    "best-for-night": (
        "Name the kind of night this venue is best suited for and give one concrete reason why. "
        "The reason can come from the room, pacing, music, menu, crowd, or overall format."
    ),
}

NIGHTLIFE_BLURB_CALIBRATION = """\
NIGHTLIFE BLURB CALIBRATION
- Reach the nightlife value within the first sentence: drinks, music, dancing, crowd, room feel, or late-night use. Architecture can support the point, but it cannot bury it.
- Do not write a standalone address sentence ("The address is..."). Use neighborhood or street context only when it changes the reader's decision.
- Avoid database-field prose. Do not paste address, hours, exact age range, exact square meters, or precise time windows unless they are central to why the venue belongs in the list.
- Exact late-night windows need a reason. Prefer approximate phrasing unless the exact range is sourced and useful.
- Use literal verbs for crowd, service, and food. Avoid strained metaphors where service, rooms, balconies, kitchens, or crowds appear to act like machinery or infrastructure.
- Mention unusual drink ingredients only when the source clearly supports them, and use the menu's own wording when available."""


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

INTRO_CATEGORY_ANGLE_GUIDANCE: dict[ListicleCategory, str] = {
    "dining": (
        "Frame the meal decisions this list helps with: cravings, settings, occasions, "
        "and the neighborhood spread. Promise useful dining range without listing venues."
    ),
    "nightlife": (
        "Frame the kind of night out this list helps plan: mood, drinks or music, crowd, "
        "pacing, and late-night fit. Promise a useful night-out map without listing venues."
    ),
    "accommodations": (
        "Frame the kind of stay this list helps choose: location base, property style, "
        "amenities, and trip fit. Promise a useful stay-planning lens without listing properties."
    ),
    "attractions": (
        "Frame the kind of visit this list helps shape: must-see stops, pacing, setting, "
        "and cultural or natural payoff. Promise a useful visit plan without listing attractions."
    ),
    "key_location": (
        "Frame the kind of place or pause this list helps add to the itinerary. Promise "
        "a useful travel lens without listing every location."
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


def format_location_for_prompt(raw: str) -> str:
    """Flip breadcrumb-style location strings into writer-friendly prose.

    Upstream payloads sometimes deliver location as a country > region > area
    breadcrumb (e.g. ``"Peru > Lima > Miraflores"``). Writer- and curator-facing
    prompts read more naturally with the most-specific component first
    (``"Miraflores, Lima, Peru"``). Strings without the breadcrumb separator
    are returned unchanged.
    """
    stripped = (raw or "").strip()
    if " > " not in stripped:
        return stripped
    parts = [segment.strip() for segment in stripped.split(" > ") if segment.strip()]
    return ", ".join(reversed(parts)) if parts else stripped


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
                stripped = stripped[len(prefix) :].strip()
                break
    return stripped


def _normalize_block(text: str) -> str:
    return re.sub(r"[ \t]+", " ", text.strip())


def _word_count(text: str) -> int:
    return len(WORD_PATTERN.findall(text))


def _build_common_rules(*, field_type: ListicleFieldType) -> list[str]:
    lines = [
        "Never mention reviews, reviewers, diners, guests, articles, sources, or the research process.",
        "Do not mention ratings, stars, or review scores.",
        "Do not invent details.",
        "Do not sound like a hotel brochure, tourist ad, or AI summary.",
        "No em dashes.",
    ]
    if field_type == "blurb":
        lines.insert(
            0,
            f"Write one paragraph of about {BLURB_MIN_WORDS} to {BLURB_MAX_WORDS} words.",
        )
        lines.insert(
            1,
            "Do not include a heading or subheading. The subject title is rendered elsewhere in the builder.",
        )
    else:
        lines.insert(
            0,
            f"Write one intro paragraph of about {INTRO_MIN_WORDS} to {INTRO_MAX_WORDS} words.",
        )
        lines.insert(1, "Do not include a heading or subheading.")
    return lines


def _render_supporting_context(
    supporting_context: str,
    article_context: str,
    *,
    include_article_context: bool = True,
) -> str:
    sections: list[str] = []
    if supporting_context.strip():
        sections.append(f"BUILDER CONTEXT\n{supporting_context.strip()}")
    if include_article_context and article_context.strip():
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
    rendered_context = _render_supporting_context(
        target.supporting_context,
        article_context,
        include_article_context=target.field_type == "intro",
    )
    current_copy_block = (
        f"\n\nCURRENT BUILDER COPY\n{target.current_content.strip()}"
        if target.current_content.strip()
        else ""
    )

    if target.field_type == "intro":
        rules = "\n".join(
            f"- {line}" for line in _build_common_rules(field_type="intro")
        )
        intro_angle_block = _intro_category_angle_block(target.category)
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
            f"Location:\n{format_location_for_prompt(article_location)}\n"
            f"{intro_angle_block}"
            f"{context_block}"
            f"{current_copy_block}"
            "\n\nTask:\n"
            "Use the supplied context as the source of truth. Write one publication-ready intro paragraph. "
            "If CURRENT BUILDER COPY is present, treat it as a draft reference only and improve it freely.\n\n"
            "Requirements:\n"
            f"{rules}\n"
            f"- {itinerary_context}\n"
            "- Make clear what kind of experience this article delivers in this location.\n"
            "- Use selected venue names as range context only; do not list venues by default.\n"
            f"{'- Let the LISTICLE CATEGORY INTRO ANGLE shape the article promise.' + chr(10) if intro_angle_block else ''}"
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
    subject_location = format_location_for_prompt(
        target.location_label or article_location
    )
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


def _voice_rules_block(
    category: ListicleCategory | None, field_type: ListicleFieldType
) -> str:
    # Per-category gate; see ANTI_AI_PROMPT_CATEGORIES. A category is added to
    # the set once it clears the validation bar (≥70% banned-phrase reduction
    # across 20 blurbs, zero fabricated anchors). Intros remain on the legacy
    # path until a separate intro-shaped rule set lands.
    if field_type != "blurb" or category not in ANTI_AI_PROMPT_CATEGORIES:
        return ""
    category_block = (
        f"\n\n{NIGHTLIFE_BLURB_CALIBRATION}" if category == "nightlife" else ""
    )
    return f"\n\n{ANTI_AI_TELLS_BLURB}{category_block}"


def _tone_block(list_tone: ListTone | None) -> str:
    if list_tone is None:
        return ""
    guidance = LIST_TONE_GUIDANCE.get(list_tone)
    if not guidance:
        return ""
    return f"\n\nLIST TONE\n{list_tone}: {guidance}"


def _intro_category_angle_block(category: ListicleCategory | None) -> str:
    if category is None:
        return ""
    guidance = INTRO_CATEGORY_ANGLE_GUIDANCE.get(category)
    if not guidance:
        return ""
    return f"\n\nLISTICLE CATEGORY INTRO ANGLE\n{category}: {guidance}"


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
    optionally Grounded Research findings) have already been supplied in
    supporting_context.
    """
    article_type_label = ARTICLE_TYPE_LABELS[article_type]
    rendered_context = _render_supporting_context(
        target.supporting_context,
        article_context,
        include_article_context=target.field_type == "intro",
    )
    tone_block = _tone_block(list_tone)
    intro_angle_block = _intro_category_angle_block(target.category)
    # Angle only applies to blurbs; intros are list-level and have no per-item angle.
    angle_block = _angle_block(listicle_angle) if target.field_type == "blurb" else ""
    current_copy_block = (
        f"\n\nCURRENT BUILDER COPY\n{target.current_content.strip()}"
        if target.current_content.strip()
        else ""
    )

    if target.field_type == "intro":
        rules = "\n".join(
            f"- {line}" for line in _build_common_rules(field_type="intro")
        )
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
            f"Location:\n{format_location_for_prompt(article_location)}"
            f"{tone_block}"
            f"{intro_angle_block}\n"
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
            "- Use selected venue names as range context only; do not list venues by default.\n"
            f"{'- Match the LIST TONE precisely.' + chr(10) if tone_block else ''}"
            f"{'- Let the LISTICLE CATEGORY INTRO ANGLE shape the article promise.' + chr(10) if intro_angle_block else ''}"
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
    subject_location = format_location_for_prompt(
        target.location_label or article_location
    )
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


LEAN_AVOID_LINES_SHARED = (
    'Em dashes, and comma-bracketed asides used in their place',
    'Three-adjective stacks ("warm, intimate, and storied")',
    'Personified menus, rooms, or drinks',
    'Kicker closers, imperative sign-offs ("Book ahead"), and tidy summary endings',
    '"Curate," "craft" as a verb, "elevate," "showcase," "leverage"',
    'Hedges: arguably, perhaps, truly, simply, just',
    'Inventing details (prices, named items, specific years, quotes)',
    'Database-field prose (exact hours, square meters, age ranges)',
)

# Category-specific avoid lines for the lean writer prompt. Empty by default;
# add lines here once test runs surface failure modes specific to a category.
# Example: dining might want "Cuisine-as-mood ('the cuisine is warm and
# inviting') — describe what's on the plate, not how it feels."
LEAN_AVOID_LINES_BY_CATEGORY: dict[ListicleCategory, tuple[str, ...]] = {
    "dining": (),
    "nightlife": (),
    # Calibration lines added after the first-run audit ADR 0011 anticipated.
    # Each line targets a concrete failure mode observed in initial outputs:
    # lazy address-as-lead, brand-name decoration, hedged availability, AI
    # metaphor closers, amenity-list run-on closers.
    "accommodations": (
        'Address-as-lead ("its address", "the address is", "perfectly located", "centrally located") — name the place, the street, the bay, the ridge, or the neighborhood instead',
        'Brand-name decoration: do not invent drinks, cuisines, music programs, or design details around a branded bar/restaurant/lounge name. Use only what the source facts explicitly say',
        'Hedged availability ("a lucky few", "for those who", "if you\'re fortunate", "select rooms") — state what exists or omit it',
        'AI metaphor closers ("at full volume", "in full swing", "meets X meets Y", "feels like a destination rather than a thoroughfare", "punches above its weight")',
        'Amenity-list closer sentences ("An indoor pool, a 24/7 gym, and the grab-and-go round out the practical side") — fold amenities into the lead or drop them',
        'Standalone facility sentences (gym, business center, parking) that name nothing distinctive about them',
    ),
}


def build_lean_writer_prompt(
    *,
    category: ListicleCategory,
    article_title: str,
    article_type: ListicleArticleType,
    article_location: str,
    target: ListicleWriterTarget,
    brief: WriterBrief,
    custom_instruction: str = "",
    list_tone: ListTone | None = None,
) -> str:
    """Lean writer prompt for blurb categories on the curated path
    (ADR 0007 nightlife, ADR 0009 dining).

    Drops BUILDER CONTEXT, ANTI_AI_TELLS_BLURB, per-category calibration, and
    the legacy Triad/Rhythm/Cadence triple-stack. Renders the Writer Brief as
    a tone line, an angle directive, and a flat Source Facts list. The short
    Avoid list and the editorial voice line replace the legacy voice block.
    """
    article_type_label = ARTICLE_TYPE_LABELS[article_type]
    venue_name = (target.research_subject or target.display_name or "").strip()
    venue_location = format_location_for_prompt(
        target.location_label or article_location
    )
    tone_guidance = LIST_TONE_GUIDANCE.get(list_tone) if list_tone else None
    tone_line = (
        f"Tone: {list_tone}. {tone_guidance}"
        if list_tone and tone_guidance
        else "Tone: Elevated editorial. Confident, precise, a point of view. Not formal to the point of stiffness."
    )
    angle_line = (
        f"Angle: {brief.angle_directive}"
        if brief.angle_directive
        else "Angle: Open with one concrete reason this venue belongs in the list."
    )
    source_facts_block = render_source_facts_block(brief)
    avoid_lines = LEAN_AVOID_LINES_SHARED + LEAN_AVOID_LINES_BY_CATEGORY.get(
        category, ()
    )
    avoid_block = "Avoid:\n" + "\n".join(f"- {line}" for line in avoid_lines)
    current_copy_block = (
        f"\n\nCurrent draft (improve freely; do not preserve its shape):\n{target.current_content.strip()}"
        if target.current_content.strip()
        else ""
    )
    custom_block = (
        f"\n\nExtra instruction: {custom_instruction.strip()}"
        if custom_instruction.strip()
        else ""
    )
    # Plumb the per-category editor_role for dining and accommodations
    # (ADR 0009, ADR 0011). Nightlife keeps its existing voice line untouched —
    # ADR 0009 explicitly preserves nightlife behavior.
    if category in ("dining", "accommodations", "attractions"):
        editor_role = CATEGORY_PROMPT_VARIANTS[category]["editor_role"]
        voice_line = (
            f"Write like a {editor_role} who has been there. Take a position. Pick the "
            "one detail that actually decides the recommendation and lead with it."
        )
        category_label = CATEGORY_PROMPT_VARIANTS[category]["label"].lower()
        listicle_descriptor = f"{category_label} listicle"
    else:
        voice_line = (
            "Write like an editor who has been there. Take a position. Pick the one "
            "detail that actually decides the recommendation and lead with it."
        )
        listicle_descriptor = "nightlife listicle"
    return (
        f'You are writing one blurb for a {listicle_descriptor}, "{article_title.strip()}."\n'
        f"Article type: {article_type_label}\n"
        f"Venue: {venue_name}, {venue_location}\n"
        f"{tone_line}\n"
        f"{angle_line}\n\n"
        f"{source_facts_block}\n\n"
        f"Length: {BLURB_MIN_WORDS} to {BLURB_MAX_WORDS} words. One paragraph. No heading.\n"
        f"{voice_line}\n\n"
        f"{avoid_block}\n\n"
        "Vary sentence length. Not every sentence the same shape."
        f"{current_copy_block}"
        f"{custom_block}\n\n"
        "Output the paragraph only."
    ).strip()


def build_identity_only_writer_prompt(
    *,
    article_title: str,
    article_type: ListicleArticleType,
    article_location: str,
    target: ListicleWriterTarget,
    article_context: str,
    custom_instruction: str = "",
    list_tone: ListTone | None = None,
) -> str:
    """Writer prompt for the demote-and-warn path: Research Profile produced
    no usable angle or bucket evidence, so the venue has no public footprint
    to lean on. The blurb is composed from static identity only, with strict
    constraints against inferred claims.
    """
    article_type_label = ARTICLE_TYPE_LABELS[article_type]
    category = target.category or "dining"
    variant = CATEGORY_PROMPT_VARIANTS[category]
    rules = "\n".join(f"- {line}" for line in _build_common_rules(field_type="blurb"))
    subject_label = variant["subject_label"]
    subject_name = (target.research_subject or target.display_name or "").strip()
    subject_location = format_location_for_prompt(
        target.location_label or article_location
    )
    tone_block = _tone_block(list_tone)
    custom_block = (
        f"\n\nCUSTOM INSTRUCTION\n{custom_instruction.strip()}"
        if custom_instruction.strip()
        else ""
    )
    voice_block = _voice_rules_block(category, target.field_type)
    return (
        "You are writing a blurb for a travel listicle in the style of a polished digital publication. "
        f"Write like a confident {variant['editor_role']}, not like a review summary.\n\n"
        "EVIDENCE STATUS\n"
        "No public evidence was found for this venue. Compose only from the identity fields below. "
        "Do not infer specifics that are not present here.\n\n"
        f"Article type:\n{article_type_label}\n\n"
        f"Article title:\n{article_title.strip()}\n\n"
        f"{subject_label}:\n{subject_name}\n\n"
        f"Location:\n{subject_location}"
        f"{tone_block}\n\n"
        "Task:\n"
        "Write one short, factual blurb paragraph using only the identity and category above.\n\n"
        "Strict constraints:\n"
        f"{rules}\n"
        "- Do not claim a signature dish, signature program, signature feature, or signature amenity.\n"
        "- Do not assert atmosphere, vibe, energy, crowd, or room feel.\n"
        "- Do not name dishes, drinks, DJs, designers, owners, or founders.\n"
        "- Do not use superlatives or comparative claims (best, most, finest, beloved, iconic).\n"
        "- Do not invent history, dates, awards, prices, hours, or amenities.\n"
        "- Keep to the category and neighborhood positioning only.\n"
        f"{custom_block}"
        f"{voice_block}\n\n"
        "Output:\n"
        "One short blurb paragraph only."
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
    brief: WriterBrief | None = None,
) -> str:
    """Build a retry prompt anchored on the same prompt shape as the original
    draft.

    For dining (ADR 0009), accommodations (ADR 0011), and attractions (ADR 0012), retry runs on the lean
    prompt when a usable Writer Brief is available. For every other category —
    including nightlife, whose existing retry-on-fat-prompt behavior ADR 0009
    explicitly preserves — retry runs on the legacy fat prompt.
    """
    failures = "\n".join(f"- {item}" for item in validation_errors)
    if (
        target.field_type == "blurb"
        and target.category in ("dining", "accommodations", "attractions")
        and brief is not None
        and brief.is_usable
    ):
        base_prompt = build_lean_writer_prompt(
            category=target.category,
            article_title=article_title,
            article_type=article_type,
            article_location=article_location,
            target=target,
            brief=brief,
            custom_instruction=custom_instruction,
            list_tone=list_tone,
        )
    else:
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

    if EM_DASH_PATTERN.search(text):
        errors.append("Output must not include em dashes.")

    if RATING_PATTERN.search(stripped):
        errors.append("Output must not mention ratings, stars, or scores.")

    lowered = normalized.casefold()
    if PROCESS_PATTERN.search(stripped) or any(
        phrase in lowered for phrase in REVIEW_DISCLOSURE_PHRASES
    ):
        errors.append("Output must not expose the research or review process.")

    word_count = _word_count(normalized)
    if field_type == "blurb" and (
        word_count < BLURB_MIN_WORDS or word_count > BLURB_MAX_WORDS
    ):
        errors.append(
            f"Blurb must be between {BLURB_MIN_WORDS} and {BLURB_MAX_WORDS} words."
        )
    if field_type == "intro" and (
        word_count < INTRO_MIN_WORDS or word_count > INTRO_MAX_WORDS
    ):
        errors.append(
            f"Intro must be between {INTRO_MIN_WORDS} and {INTRO_MAX_WORDS} words."
        )

    return errors
