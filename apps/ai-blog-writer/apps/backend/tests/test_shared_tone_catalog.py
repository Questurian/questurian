"""Invariants for the shared tone catalog.

data/prompt2blog/tones lives under prompt2blog but is not prompt2blog's:
app.shared.tone_profiles points at it, and url2blog and youtube2blog both
resolve tones through that loader. resolve_tone_profile raises on an unknown
id, so deleting a file breaks two other pipelines at runtime.

That is why this file used to say "add to this list; never remove from it".
On 2026-08-27 the owner overrode it deliberately: ten tones had collapsed into
two real dials, four of them were duplicates, subject matter, or a register the
voice rules forbid, and Prompt2Blog getting the right result was ranked above
keeping url2blog and youtube2blog undisturbed. The retired ids are pinned below
so the removal stays a decision rather than a regression.
"""

from __future__ import annotations

from app.shared.tone_profiles import (
    DEFAULT_TONE_ID,
    load_tone_profiles,
    resolve_tone_profile,
)

# The supported set. Adding is free; removing is an owner decision that has to
# update RETIRED_TONE_IDS and the shared frontend union in the same change.
SHIPPED_TONE_IDS = {
    "aspirational-grounded",
    "editorial",
    "experienced-traveler",
    "no-fluff-field-guide",
    "practical",
    "practical-authority",
}

# Cut on 2026-08-27, with the reason each one failed to be a tone:
#   editorial-comparison      duplicated the Comparison article form
#   street-smart-nomad        duplicated the safety topic module
#   forbes-service-journalism was Practical Authority with different adjectives
#   inspirational             asked for the register the voice rules ban
RETIRED_TONE_IDS = {
    "editorial-comparison",
    "forbes-service-journalism",
    "inspirational",
    "street-smart-nomad",
}


def test_every_shipped_tone_id_still_resolves():
    for tone_id in SHIPPED_TONE_IDS:
        assert resolve_tone_profile(tone_id)["id"] == tone_id


def test_the_catalog_is_exactly_the_supported_set():
    assert {profile["id"] for profile in load_tone_profiles()} == SHIPPED_TONE_IDS


def test_retired_tone_ids_are_gone_on_purpose():
    # The loader raises rather than falling back, so a caller still sending one
    # of these fails loudly instead of silently writing in the wrong voice.
    for tone_id in RETIRED_TONE_IDS:
        try:
            resolve_tone_profile(tone_id)
        except ValueError:
            continue
        raise AssertionError(f"{tone_id} was retired but still resolves")


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


def test_every_tone_declares_what_it_commits_to_and_where_it_stands():
    """Ten tones collapsed into four because nothing pinned them apart.

    By the time tone runs, the article form has set structure, the topic module
    has set subject, and the brand voice has set vocabulary. Stance and distance
    are the only dials left, so every tone has to state both, and has to point
    at the tone a writer should have picked instead.
    """
    for profile in load_tone_profiles():
        instructions = profile["instructions"]
        assert "Commits to:" in instructions, f"{profile['id']} declares no stance"
        assert "Not this tone if" in instructions, f"{profile['id']} names no neighbour"
        assert (
            "The writer is" in instructions
        ), f"{profile['id']} does not say where the writer stands"


def test_no_tone_points_at_a_retired_neighbour():
    labels = {profile["label"] for profile in load_tone_profiles()}

    for profile in load_tone_profiles():
        pointer = profile["instructions"].split("Not this tone if", 1)[1]
        assert any(
            label in pointer for label in labels
        ), f"{profile['id']} redirects to a tone that no longer exists"
