"""Invariants for the shared tone catalog.

data/prompt2blog/tones lives under prompt2blog but is not prompt2blog's:
app.shared.tone_profiles points at it, and url2blog and youtube2blog both
resolve tones through that loader. resolve_tone_profile raises on an unknown
id, so renaming or deleting a file breaks two other pipelines at runtime and
invalidates any saved composer state referencing the old id.
"""

from __future__ import annotations

from app.shared.tone_profiles import (
    DEFAULT_TONE_ID,
    load_tone_profiles,
    resolve_tone_profile,
)

# Every id that has shipped. Add to this list; never remove from it.
SHIPPED_TONE_IDS = {
    "aspirational-grounded",
    "editorial",
    "editorial-comparison",
    "experienced-traveler",
    "forbes-service-journalism",
    "inspirational",
    "no-fluff-field-guide",
    "practical",
    "practical-authority",
    "street-smart-nomad",
}


def test_every_shipped_tone_id_still_resolves():
    for tone_id in SHIPPED_TONE_IDS:
        assert resolve_tone_profile(tone_id)["id"] == tone_id


def test_default_tone_id_resolves():
    # url2blog and youtube2blog fall back to this constant when no tone is sent.
    assert resolve_tone_profile(None)["id"] == DEFAULT_TONE_ID


def test_exactly_one_tone_is_flagged_default():
    flagged = [p["id"] for p in load_tone_profiles() if p["default"]]

    assert flagged == [DEFAULT_TONE_ID]


def test_tone_order_values_are_unique():
    # Ties fall through to label sort, which makes dropdown order incidental.
    orders = [p["order"] for p in load_tone_profiles()]

    assert len(set(orders)) == len(orders)


def test_every_tone_carries_routing_guidance():
    # The catalog used to mix full guides with one-line stubs, and the stubs
    # were the default and the first two picks. A tone that cannot tell a
    # writer when to choose it is not usable steering.
    for profile in load_tone_profiles():
        instructions = profile["instructions"]
        assert "Best for" in instructions, f"{profile['id']} has no routing line"
        assert len(instructions.split()) >= 50, f"{profile['id']} is a stub"


def test_every_tone_has_a_dropdown_description():
    for profile in load_tone_profiles():
        description = profile["description"]
        assert description, f"{profile['id']} has no description"
        assert len(description) <= 80, f"{profile['id']} description is too long"
