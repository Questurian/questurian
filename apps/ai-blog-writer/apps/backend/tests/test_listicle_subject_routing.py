"""Which catalogue a commission gets, and how that was decided.

R8 of the verified plan of 2026-09-09. Two faults in one function.

**Accents.** The catalogue matched on ASCII words, so "cevicherías" -- the
correct spelling, and the one an interview in Lima produces -- matched nothing.
A list of cevicherías got the shared shapes and none of the restaurant ones.

**Precedence.** Subject words were matched anywhere in the phrase and a fixed
order broke the tie, with bars first. "Hotels with rooftop bars" is a list of
hotels, and it was handed the bar catalogue on the strength of the word
describing its balconies.

These prove routing. Nothing here says anything about whether a search finds
good places.
"""

from __future__ import annotations

import pytest

from app.features.listicle_pipeline import service, shapes, spec, store
from app.features.listicle_pipeline.contracts import SearchOrder
from tests.listicle_test_support import agreed_state, default_turns, turn


@pytest.mark.parametrize(
    "kind, subject",
    [
        # The reproduction.
        ("cevicherías", "restaurants"),
        ("cevicherias", "restaurants"),
        ("Cevicherías", "restaurants"),
        ("cafés", "restaurants"),
        # The head of the phrase decides.
        ("hotels with rooftop bars", "hotels"),
        ("hotels that have bars", "hotels"),
        ("hotel bars", "bars"),
        ("restaurants with cocktail bars", "restaurants"),
        ("bars serving food", "bars"),
        ("independent long-stay hotels", "hotels"),
        ("rooftop bars", "bars"),
    ],
)
def test_the_head_of_the_phrase_chooses_the_catalogue(kind, subject):
    assert shapes.subject_of(kind) == subject


def test_a_genuinely_mixed_head_is_not_resolved():
    """"Hotels and bars" is two subjects. Guessing one of them hands half the
    commission a catalogue written for the other half; the interview's own kind
    question is what settles it."""
    assert shapes.resolve_subject("hotels and bars") == ("", "mixed")
    assert shapes.resolve_subject("restaurants & bars") == ("", "mixed")


def test_a_subject_the_catalogue_does_not_know_stays_unknown():
    """Not filed under whichever subject shares a word with it. That is how a
    hotel commission came to be offered market stalls."""
    assert shapes.resolve_subject("museums") == ("", "unknown")
    assert shapes.resolve_subject("bookshops") == ("", "unknown")


def test_an_unknown_head_is_not_rescued_by_its_condition():
    """"Museums with bars" is a list of museums. Handing it the bar catalogue
    because the only word the catalogue recognises is in the condition is the
    same fault as "hotels with rooftop bars", one step further out."""
    assert shapes.resolve_subject("museums with bars") == ("", "unknown")


def test_the_approved_spelling_is_never_touched(isolated_db):
    """Folding is for lookup. The noun the operator agreed to is what reaches
    every prompt."""
    state = agreed_state(
        turns=[
            turn("kind", "cevicherías") if t.question.asks_about == "kind" else t
            for t in default_turns()
        ]
    )
    store.save(state)
    order = service.create_order(state)
    assert order.kind == "cevicherías"
    assert order.catalogue_subject == "restaurants"
    assert order.subject_source == "head"


def test_an_order_stored_before_the_subject_was_recorded_computes_it_on_read():
    """No call, no revision, nothing invented."""
    legacy = SearchOrder(run_id="old", kind="hotels with rooftop bars", place="Lima")
    assert legacy.subject_source == ""
    assert spec.catalogue_subject_of(legacy) == "hotels"


def test_the_catalogue_offered_follows_the_resolved_subject():
    offered = {shape.key for shape in shapes.shapes_for(shapes.subject_of("hotel bars"))}
    assert "drink-specialty" in offered
    assert "lodging-format" not in offered

    offered = {
        shape.key for shape in shapes.shapes_for(shapes.subject_of("hotels with bars"))
    }
    assert "lodging-format" in offered
    assert "drink-specialty" not in offered


# The catalogue's own contradictions


def test_no_shape_asks_for_a_condition_its_core_does_not_state():
    """The audit, kept. `family` required generations the core never asked for,
    and `district` required that visitors miss it -- which is `lesser-known`,
    so choosing both narrowed the search to the overlap of two shapes."""
    family = shapes.SHAPES_BY_KEY["family"]
    assert "generation" not in family.instruction.lower()
    assert "generation" not in family.example.lower()

    district = shapes.SHAPES_BY_KEY["district"]
    # The phrase survives only as a prohibition, which is the opposite of a
    # condition -- and the examples, which are what the model copies, no longer
    # carry it at all.
    assert "do not add that visitors miss it" in district.instruction.lower()
    assert "visitors" not in district.example.lower()
    assert "keeps to itself" not in district.example.lower()


def test_every_shared_shape_shows_an_example_for_more_than_one_subject():
    """One example reads as a template to copy; two read as a pattern to
    apply. A shared shape whose examples are all restaurants is a shared shape
    that writes restaurant wording for hotels."""
    for shape in shapes.SHAPES:
        if shape.applies_to:
            continue
        assert shape.example.count("|") >= 1, shape.key


def test_where_to_look_follows_the_subject():
    from app.features.listicle_pipeline.search import build_search_prompt

    hotels = build_search_prompt(
        "hotels with monthly rates",
        kind="hotels",
        place="Lima",
        exclusions="",
        standard="",
        wanted=8,
        subject="hotels",
    )
    assert "accommodation" in hotels
    assert "food" not in hotels.lower()

    food = build_search_prompt(
        "cevicherias open for decades",
        kind="cevicherias",
        place="Lima",
        exclusions="",
        standard="",
        wanted=8,
        subject="restaurants",
    )
    assert "food reporting" in food

    # A subject nothing is known about gets the general answer, not a guess.
    unknown = build_search_prompt(
        "museums with late openings",
        kind="museums",
        place="Lima",
        exclusions="",
        standard="",
        wanted=8,
    )
    assert "local press" in unknown.lower()
    assert "accommodation" not in unknown


def test_the_local_language_instruction_survives_every_subject():
    from app.features.listicle_pipeline.search import build_search_prompt

    for subject in ("", "hotels", "bars", "restaurants"):
        prompt = build_search_prompt(
            "anything",
            kind="things",
            place="Lima",
            exclusions="",
            standard="",
            wanted=8,
            subject=subject,
        )
        assert "local language" in prompt
        collapsed = " ".join(prompt.split())
        assert "keep every business name exactly as it is written locally" in collapsed
