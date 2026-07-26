"""Static editorial policy and reusable prompt-policy rendering."""

from app.shared.prompts import ANTI_AI_TELLS_BLURB

from .angle_assignment import ANTI_AI_PROMPT_CATEGORIES, ListicleAngle
from .listicle_writer_contracts import (
    ListTone,
    ListicleArticleType,
    ListicleCategory,
    ListicleFieldType,
)

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
LEAN_AVOID_LINES_BY_CATEGORY: dict[ListicleCategory, tuple[str, ...]] = {
    "dining": (),
    "nightlife": (),
    "accommodations": (
        'Address-as-lead ("its address", "the address is", "perfectly located", "centrally located") — name the place, the street, the bay, the ridge, or the neighborhood instead',
        'Brand-name decoration: do not invent drinks, cuisines, music programs, or design details around a branded bar/restaurant/lounge name. Use only what the source facts explicitly say',
        'Hedged availability ("a lucky few", "for those who", "if you\'re fortunate", "select rooms") — state what exists or omit it',
        'AI metaphor closers ("at full volume", "in full swing", "meets X meets Y", "feels like a destination rather than a thoroughfare", "punches above its weight")',
        'Amenity-list closer sentences ("An indoor pool, a 24/7 gym, and the grab-and-go round out the practical side") — fold amenities into the lead or drop them',
        'Standalone facility sentences (gym, business center, parking) that name nothing distinctive about them',
    ),
}


def format_location_for_prompt(raw: str) -> str:
    """Flip breadcrumb-style locations into most-specific-first prose."""
    stripped = (raw or "").strip()
    if " > " not in stripped:
        return stripped
    parts = [segment.strip() for segment in stripped.split(" > ") if segment.strip()]
    return ", ".join(reversed(parts)) if parts else stripped


def build_common_rules(*, field_type: ListicleFieldType) -> list[str]:
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


def render_supporting_context(
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


def voice_rules_block(
    category: ListicleCategory | None, field_type: ListicleFieldType
) -> str:
    if field_type != "blurb" or category not in ANTI_AI_PROMPT_CATEGORIES:
        return ""
    category_block = (
        f"\n\n{NIGHTLIFE_BLURB_CALIBRATION}" if category == "nightlife" else ""
    )
    return f"\n\n{ANTI_AI_TELLS_BLURB}{category_block}"


def tone_block(list_tone: ListTone | None) -> str:
    if list_tone is None:
        return ""
    guidance = LIST_TONE_GUIDANCE.get(list_tone)
    if not guidance:
        return ""
    return f"\n\nLIST TONE\n{list_tone}: {guidance}"


def intro_category_angle_block(category: ListicleCategory | None) -> str:
    if category is None:
        return ""
    guidance = INTRO_CATEGORY_ANGLE_GUIDANCE.get(category)
    if not guidance:
        return ""
    return f"\n\nLISTICLE CATEGORY INTRO ANGLE\n{category}: {guidance}"


def angle_block(listicle_angle: ListicleAngle | None) -> str:
    if listicle_angle is None:
        return ""
    guidance = LISTICLE_ANGLE_GUIDANCE.get(listicle_angle)
    if not guidance:
        return ""
    return f"\n\nBLURB ANGLE\n{listicle_angle}: {guidance}"
