"""The catalogue: what a commission is offered, and what the wording asks for.

Two faults from the plan of 2026-09-08 live here. A hotel commission was shown
market stalls and cuisine fusions because one restaurant-shaped catalogue was
shown to every subject. And the wording rules could not stop a search
over-tightening while the catalogue itself was asking for it -- "known for one
thing and little else" excludes a specialist with a full menu, and "no sign, no
listing" asks the web to find something described as unfindable.
"""

from __future__ import annotations

import pytest

from app.features.listicle_pipeline.shapes import (
    SHAPES,
    SHAPES_BY_KEY,
    BROAD,
    SPECIFIC,
    overlap_notes,
    shape_menu,
    shapes_for,
    subject_of,
    suggested_angle_count,
)


@pytest.mark.parametrize(
    "kind, subject",
    [
        ("cevicherias", "restaurants"),
        ("pizzerias", "restaurants"),
        ("rooftop bars", "bars"),
        ("pisco bars", "bars"),
        ("independent hotels", "hotels"),
        ("hostels", "hotels"),
        # A subject the catalogue knows nothing extra about keeps the shared
        # shapes rather than being filed under one it does not belong to.
        ("museums", ""),
        ("surf breaks", ""),
    ],
)
def test_the_subject_is_read_off_the_kind(kind, subject):
    assert subject_of(kind) == subject


def test_a_hotel_list_is_not_offered_market_stalls_or_cuisine_fusions():
    keys = {shape.key for shape in shapes_for("hotels")}
    assert "informal" not in keys
    assert "crossed" not in keys
    assert "regional-tradition" not in keys


def test_a_hotel_list_is_offered_hotel_dimensions():
    keys = {shape.key for shape in shapes_for("hotels")}
    assert {"lodging-format", "long-stay", "building-character", "family-facilities"} <= keys


def test_a_bar_list_is_offered_bar_dimensions():
    keys = {shape.key for shape in shapes_for("bars")}
    assert {"drink-specialty", "live-music", "dancing", "local-drinking"} <= keys
    assert "informal" not in keys


def test_an_unsupported_subject_keeps_the_shared_shapes():
    keys = {shape.key for shape in shapes_for("")}
    assert {"cheap", "luxury", "institution", "setting", "district"} <= keys
    assert not any(shape.applies_to for shape in shapes_for(""))


@pytest.mark.parametrize(
    "key, banned",
    [
        # Every one of these was in the catalogue as a condition, and every one
        # of them is a condition the shape does not mean. What the shape MEANS
        # and the EXAMPLE searches are what reach a finished angle, so those
        # are what must be clean; the instruction may still name the condition,
        # because warning the writer off it is the opposite of asking for it.
        ("one-thing", "little else"),
        ("purist", "no fusion"),
        ("lesser-known", "no listing"),
        ("lesser-known", "no sign"),
        ("institution", "landmark status unless"),
        ("institution", "50+"),
    ],
)
def test_the_catalogue_stopped_asking_for_the_over_tightening(key, banned):
    shape = SHAPES_BY_KEY[key]
    text = f"{shape.core} {shape.example}".lower()
    assert banned not in text


def test_a_shape_that_bans_something_says_so_as_a_prohibition_on_the_writer():
    """Where the wording has to warn the model off a condition, it warns the
    model rather than putting the condition in the search."""
    assert "do not require" in SHAPES_BY_KEY["one-thing"].instruction.lower()
    assert "do not say it has no" in SHAPES_BY_KEY["lesser-known"].instruction.lower()


def test_the_recent_opening_window_is_explicit_and_anchored():
    instruction = SHAPES_BY_KEY["new-wave"].instruction.lower()
    assert "explicitly" in instruction
    assert "today's date" in instruction


def test_cheap_hidden_and_informal_are_no_longer_one_group():
    """A cheap neighbourhood bar and an expensive hidden one are both real and
    both worth searching for. They shared a group and at most one could be
    chosen."""
    notes = overlap_notes("")
    assert "cheap and lesser-known" not in notes
    assert "cheap and informal" not in notes


def test_award_and_expensive_are_not_declared_duplicates():
    assert "luxury" not in SHAPES_BY_KEY["award"].overlaps_with


def test_an_overlap_the_old_groups_missed_is_now_stated():
    """Family-run and longstanding are often the same places and shared no
    group at all."""
    assert "institution" in SHAPES_BY_KEY["family"].overlaps_with


def test_no_shape_claims_to_collide_with_something_that_is_not_a_shape():
    for shape in SHAPES:
        for other in shape.overlaps_with:
            assert other in SHAPES_BY_KEY, f"{shape.key} -> {other}"


def test_every_shape_declares_a_role_it_can_actually_be_asked_for():
    for shape in SHAPES:
        assert shape.role in {BROAD, "distinctive", SPECIFIC}


def test_the_narrow_shapes_are_labelled_narrow():
    """"The place credited with starting it" cannot supply twelve, and the
    allowance follows the role."""
    assert SHAPES_BY_KEY["origin"].role == SPECIFIC


def test_the_menu_a_commission_sees_carries_meaning_and_wording_separately():
    menu = shape_menu("hotels")
    assert "means:" in menu and "write:" in menu
    assert "market" not in menu.lower()


@pytest.mark.parametrize(
    "target, expected", [(5, 2), (12, 3), (24, 4), (40, 6), (200, 10)]
)
def test_the_angle_count_heuristic_lives_in_code(target, expected):
    """It was written out as arithmetic in the prompt as well, and the two came
    to disagree."""
    assert suggested_angle_count(target) == expected


def test_a_shapes_theme_comes_from_the_catalogue_not_from_a_model():
    """A live run sent the shape's LABEL as `group` on one turn and its KEY on
    the next. Both are real values and neither is the theme, and since the
    screen groups by this field to warn about colliding angles, every option
    landed in a group of one and the warning could never fire."""
    from app.features.listicle_pipeline.spec import _theme_for

    assert _theme_for("institution", "Local institution") == "heritage"
    assert _theme_for("institution", "institution") == "heritage"
    assert _theme_for("cheap", "") == "price"
    # An angle the catalogue has no shape for keeps what it was given: there is
    # nothing to look up.
    assert _theme_for("", "sourcing") == "sourcing"


def test_a_role_that_is_not_a_role_falls_back_to_the_catalogue():
    from app.features.listicle_pipeline.spec import _checked_role

    assert _checked_role("specific", "institution") == "specific"
    assert _checked_role("", "origin") == "specific"
    assert _checked_role("enthusiastic", "origin") == "specific"
