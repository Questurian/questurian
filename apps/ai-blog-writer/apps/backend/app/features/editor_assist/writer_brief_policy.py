"""Static editorial policy for Writer Brief angle directives."""

from __future__ import annotations

from .angle_assignment import ListicleAngle

# Per-angle directive templates, keyed by category. The {venue} placeholder is
# filled by the curator (or by deterministic fallback rendering) before the
# directive reaches the writer prompt. These are the venue-facing directives
# referenced in ADR 0007 (nightlife), ADR 0009 (dining), ADR 0011
# (accommodations), and ADR 0012 (attractions) — distinct from
# LISTICLE_ANGLE_GUIDANCE, which is the legacy model-facing instruction text
# still used by fat-prompt categories.
ANGLE_DIRECTIVES_BY_CATEGORY: dict[str, dict[ListicleAngle, str]] = {
    "nightlife": {
        "best-for-night": (
            "Open by naming the kind of night {venue} is best for, and give one "
            "concrete reason rooted in the room, the drinks, the crowd, or the "
            "pacing."
        ),
    },
    "dining": {
        "signature-dish": (
            "Open by naming one specific dish at {venue} and one concrete "
            "reason it's worth ordering."
        ),
        "atmosphere": (
            "Open by placing the reader in the room at {venue} with one "
            "concrete physical detail — the light, the seating, the music, "
            "the crowd at a specific hour."
        ),
        "founders-backstory": (
            "Open by naming the person behind {venue} and one specific fact "
            "about them — where they trained, what they ran before, when "
            "they opened."
        ),
        "insider-tip": (
            "Open with one specific, actionable tip at {venue} a first-time "
            "visitor wouldn't guess — a time, a seat, an order, a side door."
        ),
        "best-for": (
            "Open by naming the occasion {venue} serves best, then one "
            "concrete reason rooted in the room, the menu, the pacing, or "
            "the price."
        ),
        "whats-different": (
            "Open by naming the specific thing that sets {venue} apart from "
            "neighboring options of the same kind — a technique, a sourcing "
            "choice, a format."
        ),
    },
    "accommodations": {
        "location-and-setting": (
            "Open by placing {venue} in its physical setting with one "
            "concrete geographic anchor — the bay, the ridge, the named "
            "neighborhood, what's on either side. No 'centrally located'."
        ),
        "view-and-vista": (
            "Open by naming what guests actually see from {venue} — the "
            "specific sightline, which rooms or spaces it's from, one "
            "concrete fact about it."
        ),
        "design-and-aesthetic": (
            "Open by describing one concrete material, named space, or "
            "design choice at {venue} — the lobby, the restaurant, the pool "
            "deck, or the rooms, whichever carries the strongest identity."
        ),
        "signature-amenity": (
            "Open by naming the one standalone feature that defines a stay "
            "at {venue} — the rooftop hammam, the private beach club, the "
            "library — and one concrete fact about it."
        ),
        "food-and-beverage": (
            "Open by naming a specific on-site restaurant, bar, breakfast, "
            "or rooftop at {venue} and one concrete fact — the chef, the "
            "cuisine, the cocktail program, the hours."
        ),
        "trip-fit": (
            "Open by naming the kind of trip {venue} serves best — a "
            "honeymoon, a long remote-work stay, a family with toddlers, a "
            "solo business swing — and one concrete reason rooted in the "
            "rooms, the service, or the property's rhythm."
        ),
        "property-backstory": (
            "Open by naming the owner, designer, or origin year of {venue} "
            "and one specific fact — a former use of the building, the "
            "architect, the family that runs it."
        ),
        "booking-tip": (
            "Open with one specific, actionable booking or stay tip for "
            "{venue} a first-time guest wouldn't guess — a room to request, "
            "a night of the week, an arrival window."
        ),
        "whats-different": (
            "Open by naming the specific thing that sets {venue} apart from "
            "neighboring properties of the same kind — a design choice, a "
            "service rhythm, a location format, a hybrid concept."
        ),
    },
    "attractions": {
        "signature-feature": (
            "Open by naming the specific feature {venue} is built around — "
            "the viewpoint, route, room, artwork, ruin, exhibit, or natural "
            "formation — and one concrete fact that makes it worth the stop."
        ),
        "setting": (
            "Open by placing the reader at {venue} with one concrete physical "
            "detail — the approach, surrounding terrain, material, light at a "
            "specific hour, or what frames the site."
        ),
        "history-built": (
            "Open by naming when {venue} was built, founded, used, or changed "
            "and one specific fact tied to that history — who built it, what it "
            "replaced, what it survived, or why it matters."
        ),
        "visit-time-tip": (
            "Open with one specific, actionable visit tip for {venue} a "
            "first-time visitor would not guess — a time of day, entrance, "
            "walking order, ticket choice, or pacing move."
        ),
        "best-for-visit-type": (
            "Open by naming the kind of visit {venue} serves best — a quick "
            "photo stop, rainy afternoon, kid-friendly half day, full deep dive, "
            "or quiet early-morning visit — and one concrete reason."
        ),
        "whats-different": (
            "Open by naming the specific thing that sets {venue} apart from "
            "nearby attractions of the same kind — a format, scale, access, "
            "setting, collection, route, or viewpoint."
        ),
    },
}


def get_angle_directive_template(
    category: str,
    angle: ListicleAngle | None,
) -> str | None:
    if angle is None:
        return None
    return ANGLE_DIRECTIVES_BY_CATEGORY.get(category, {}).get(angle)


def render_angle_directive_template(template: str | None, venue_name: str) -> str:
    if not template:
        return ""
    return template.replace("{venue}", venue_name)


__all__ = [
    "ANGLE_DIRECTIVES_BY_CATEGORY",
    "get_angle_directive_template",
    "render_angle_directive_template",
]
