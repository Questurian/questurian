"""The agreement, and the number it was actually agreed on.

The first real run displayed a search order for twenty items and searched for
forty. Nothing was broken in the searching; the count was read back out of a
sentence and the sentence contained both numbers.
"""

from __future__ import annotations

import pytest

from app.features.listicle_pipeline import spec
from app.features.listicle_pipeline.search import SPECIFIC, role_allowances
from tests.listicle_test_support import agreed_state, default_turns, option, turn


def _state_with_count(answer: str, *, recommendation: str = "20", seed: str | None = None):
    turns = [t for t in default_turns() if t.question.asks_about != "count"]
    turns.insert(2, turn("count", answer, recommendation=recommendation))
    return agreed_state(
        seed=seed or "The 40 best cevicherias in Lima", turns=turns
    )


def test_a_correction_is_read_as_the_correction():
    """"20, not 40" used to resolve to 40, because the old reader took the
    largest plausible number it could see."""
    assert spec.resolve_count(_state_with_count("20, not 40")).value == 20


def test_a_correction_written_the_other_way_round_reads_the_same():
    assert spec.resolve_count(_state_with_count("not 40, 20")).value == 20


def test_agreeing_without_saying_a_number_takes_the_number_proposed():
    """"Yes, that's right" is a perfectly good answer to "is 20 the number?"
    and carries no number at all. The old reader fell back to the seed, which
    is where the number the interview had just argued them out of was."""
    decision = spec.resolve_count(
        _state_with_count("Yes, that's right", recommendation="20")
    )
    assert decision.value == 20
    assert decision.source == "accepted"


def test_accepting_the_draft_untouched_is_still_an_acceptance():
    decision = spec.resolve_count(_state_with_count("20", recommendation="20"))
    assert decision.value == 20


def test_a_price_or_a_year_is_not_a_list_length():
    decision = spec.resolve_count(
        _state_with_count("Keep it to 20; nothing over 150 soles a head.")
    )
    assert decision.value == 20


def test_an_ambiguous_answer_is_used_and_flagged_rather_than_guessed_at():
    """A run that cannot proceed helps nobody, and a number chosen silently
    from an ambiguous sentence is the fault this record exists to fix. It picks
    the conservative reading and says it is unsure."""
    decision = spec.resolve_count(_state_with_count("somewhere between 20 and 40"))
    assert decision.value == 20
    assert decision.ambiguous is True
    assert "20" in decision.note and "40" in decision.note


def test_the_summary_and_the_execution_read_the_same_number():
    order = spec.build_search_order(_state_with_count("20, not 40"))
    assert order.target_count == 20
    assert "20 cevicherias" in spec.summary_of(order)


def test_an_operator_correction_overrides_the_reading():
    order = spec.build_search_order(
        _state_with_count("somewhere between 20 and 40"), target_count=25
    )
    assert order.target_count == 25
    assert order.count_ambiguous is False


def test_each_angle_keeps_its_identity_and_its_shape():
    order = spec.build_search_order(agreed_state())
    assert [a.text for a in order.angles] == [
        "cevicherias open for decades",
        "very cheap cevicherias people rate highly",
    ]
    assert [a.shape_key for a in order.angles] == ["institution", "cheap"]
    assert all(a.edited is False for a in order.angles)
    assert len({a.angle_id for a in order.angles}) == 2


def test_the_screens_own_record_of_what_was_chosen_wins():
    """The picker knows which menu entry a line came from and whether the
    operator changed it. Inferring that back out of the finished sentence is
    guesswork, and this record is what stops the pipeline doing it."""
    state = agreed_state()
    order = spec.build_search_order(
        state,
        selections=[
            {
                "text": "cevicherias open for decades",
                "angle_id": "picked-1",
                "shape_key": "institution",
                "group": "heritage",
                "role": "broad",
                "edited": False,
            },
            {
                "text": "very cheap cevicherias people rate highly",
                "angle_id": "picked-2",
                "shape_key": "cheap",
                "group": "price",
                "role": "broad",
                "edited": True,
            },
        ],
    )
    assert [a.angle_id for a in order.angles] == ["picked-1", "picked-2"]
    assert order.angles[1].edited is True


def test_an_edited_line_is_marked_as_edited_even_without_the_screens_record():
    """An interview answered as plain text still has to say that a line no
    longer matches the menu entry it came from -- the shape's opinion about
    what this angle overlaps with is no longer known to be true."""
    turns = [t for t in default_turns() if t.question.asks_about != "angles"]
    turns.append(
        turn(
            "angles",
            "cevicherias open for decades that are also famous",
            options=[
                option(
                    "cevicherias open for decades",
                    recommended=True,
                    group="heritage",
                    shape="institution",
                )
            ],
        )
    )
    order = spec.build_search_order(agreed_state(turns=turns))
    assert order.angles[0].edited is True
    # The lineage is kept -- it is worth knowing where the line came from --
    # and `edited` is what stops anything treating the shape's group as still
    # describing it.
    assert order.angles[0].shape_key == "institution"


def test_an_angle_nobody_offered_is_recorded_as_the_operators_own():
    turns = [t for t in default_turns() if t.question.asks_about != "angles"]
    turns.append(
        turn(
            "angles",
            "cevicherias beside the Chorrillos fishing landing",
            options=[option("cevicherias open for decades", recommended=True)],
        )
    )
    order = spec.build_search_order(agreed_state(turns=turns))
    assert order.angles[0].custom is True
    assert order.angles[0].shape_key == ""


def test_numbering_in_a_typed_answer_does_not_eat_a_year():
    """The same bounded-marker rule the search parser needed. "1. Bodega 1915"
    loses the marker and keeps the year."""
    turns = [t for t in default_turns() if t.question.asks_about != "angles"]
    turns.append(turn("angles", "1. bars open since 1915\n2. rooftop bars"))
    order = spec.build_search_order(agreed_state(turns=turns))
    assert order.angles[0].text == "bars open since 1915"


def test_a_narrow_angle_is_not_asked_for_a_broad_angles_number():
    """"The place credited with inventing the dish" cannot supply twelve, and
    asking it for twelve is asking it to invent eleven."""
    broad, specific = role_allowances(40, ["broad", SPECIFIC])
    assert specific < broad
    assert specific <= 5


def test_an_order_of_narrow_angles_says_it_may_not_fill_the_list():
    """Said, not fixed. Adding a search the operator did not approve is the
    behaviour this pipeline exists to avoid."""
    turns = [t for t in default_turns() if t.question.asks_about != "angles"]
    turns.append(
        turn(
            "angles",
            "the cevicheria credited with starting the boom",
            options=[
                option(
                    "the cevicheria credited with starting the boom",
                    recommended=True,
                    shape="origin",
                )
            ],
        )
    )
    order = spec.build_search_order(agreed_state(turns=turns))
    assert order.angles[0].role == SPECIFIC
    assert spec.planned_capacity(order) < order.target_count


@pytest.mark.parametrize("marker", ["kind", "place", "bar", "cut"])
def test_every_agreed_field_reaches_the_order(marker):
    order = spec.build_search_order(agreed_state())
    assert getattr(
        order,
        {"kind": "kind", "place": "place", "bar": "standard", "cut": "exclusions"}[
            marker
        ],
    )


# --- what the first real run (292e71e3, 2026-09-08) exposed -----------------


@pytest.mark.parametrize(
    "seed, kind",
    [
        ("The 40 best cevicherias in Lima", "cevicherias"),
        ("Top 20 rooftop bars in Lima", "rooftop bars"),
        ("The best 15 pizzerias in Naples", "pizzerias"),
        ("20 independent hotels in Lima suitable for longer stays", "independent hotels"),
        ("Best cevicherias of Lima", "cevicherias"),
        # Nothing to strip, and nothing stripped.
        ("cevicherias", "cevicherias"),
        # Reduces to nothing, so it keeps what it had: a wrong noun beats none.
        ("The 40 best", "The 40 best"),
    ],
)
def test_a_headline_is_reduced_to_the_noun_that_gets_searched(seed, kind):
    """The interview is told not to spend a turn confirming a word the operator
    already typed, so `kind` is usually covered without a turn -- and the
    fallback was the whole seed. A real run reached the search step about to
    ask the web for "The 40 best cevicherias in Lima in Lima", putting the SEO
    phrase the interview must never treat as a criterion into all seven paid
    searches."""
    assert spec.searchable_kind(seed) == kind


def test_a_marker_covered_without_a_turn_still_yields_a_searchable_noun():
    """The real run's shape exactly: the interview settled kind, place and
    count off the title without spending a turn on any of them."""
    state = agreed_state(
        seed="The 40 best cevicherias in Lima",
        turns=[
            t
            for t in default_turns()
            if t.question.asks_about not in {"kind", "place", "count"}
        ],
    )
    order = spec.build_search_order(state)
    assert order.kind == "cevicherias"
    assert "best" not in order.kind
    assert order.target_count == 40


def test_the_place_falls_back_to_the_location_not_the_whole_headline():
    turns = [
        t for t in default_turns() if t.question.asks_about not in {"kind", "place"}
    ]
    state = agreed_state(seed="The 40 best cevicherias in Lima", turns=turns)
    assert spec.place_from(state) == "Lima"


def test_the_summary_reads_as_a_sentence_rather_than_a_doubled_headline():
    state = agreed_state(
        seed="The 40 best cevicherias in Lima",
        turns=[
            t
            for t in default_turns()
            if t.question.asks_about not in {"kind", "place", "count"}
        ],
    )
    summary = spec.summary_of(spec.build_search_order(state))
    assert summary.startswith("40 cevicherias in Lima.")


# A marker answered twice
#
# Until 2026-09-08 a marker's value was read from the LAST turn that settled
# it. Correct for a correction, silently destructive for the additive
# follow-up the grill actually asks: run 292e71e3 settled the cut, then asked
# "are there any other types of establishments ... you would like to exclude?"
# and recommended "No hotel restaurants." Answering that plainly would have
# left one rule out of four and searched under a quarter of the exclusions,
# on a run that looked entirely normal.


def _twice_about(marker: str, first: str, second: str):
    turns = [t for t in default_turns() if t.question.asks_about != marker]
    turns.append(turn(marker, first))
    turns.append(turn(marker, second))
    return agreed_state(turns=turns)


def test_an_additive_follow_up_keeps_the_first_answer():
    """The real failure, in the shape it really had."""
    state = _twice_about(
        "cut",
        "No chains, no delivery-only kitchens, and no places where ceviche is "
        "not the primary offering.",
        "No hotel restaurants.",
    )
    decision = spec.resolve_answer(state, "cut")
    assert decision.source == "combined"
    for rule in ("chains", "delivery-only", "primary offering", "hotel restaurants"):
        assert rule in decision.text


def test_retyping_the_whole_list_does_not_store_it_twice():
    """What the operator on 2026-09-08 actually did, having read the code.
    The later answer says everything the earlier one said, so it stands
    alone."""
    state = _twice_about(
        "cut",
        "No chains, no delivery-only kitchens, and no places where ceviche is "
        "not the primary offering.",
        "No chains, no delivery-only kitchens, no places where ceviche is not "
        "the primary offering, and no hotel restaurants.",
    )
    decision = spec.resolve_answer(state, "cut")
    assert decision.source == "restated"
    assert decision.text.count("chains") == 1
    assert "hotel restaurants" in decision.text


def test_a_partly_restated_answer_keeps_both_rather_than_guessing():
    """Three rules restated and a fourth gone is ambiguous: dropped on
    purpose, or forgotten. Both are kept, because over-restricting a search is
    visible on the results and under-restricting it is not."""
    state = _twice_about(
        "cut", "no chains, no delivery-only kitchens", "no chains, no hotel bars"
    )
    decision = spec.resolve_answer(state, "cut")
    assert decision.source == "combined"
    assert "delivery-only" in decision.text


def test_a_second_answer_about_the_bar_is_added_not_swapped_in():
    state = _twice_about(
        "bar", "written up by someone other than the place itself", "open on Sundays"
    )
    decision = spec.resolve_answer(state, "bar")
    assert decision.source == "combined"
    assert "written up" in decision.text and "Sundays" in decision.text


def test_the_angles_are_replaced_because_the_picker_sends_the_whole_selection():
    """Un-ticking a box is already an explicit replace. Accumulating here
    would put back the angle the operator just dropped, and every angle is a
    paid search."""
    state = _twice_about("angles", "cevicherias open for decades", "nikkei cevicherias")
    decision = spec.resolve_answer(state, "angles")
    assert decision.source == "replaced"
    assert decision.text == "nikkei cevicherias"
    assert spec.angle_lines(state) == ["nikkei cevicherias"]


def test_a_second_noun_replaces_the_first():
    state = _twice_about("kind", "cevicherias", "seafood restaurants")
    assert spec.kind_from(state) == "seafood restaurants"


def test_a_marker_answered_once_says_nothing_about_being_answered_twice():
    """The normal interview. Both real runs of 2026-09-08 produce no notes,
    which is how this fix stays invisible when nothing repeated."""
    order = spec.build_search_order(agreed_state())
    assert order.answer_notes == []


def test_a_combined_answer_reaches_the_order_and_says_so():
    state = _twice_about(
        "cut", "no chains, no delivery-only kitchens", "no hotel restaurants"
    )
    order = spec.build_search_order(state)
    assert "chains" in order.exclusions and "hotel restaurants" in order.exclusions
    assert any(note.startswith("What is left out:") for note in order.answer_notes)
    # The operator reads this on a headless run, where there is no screen.
    assert "What is left out:" in spec.summary_of(order)


def test_correcting_a_combined_answer_clears_the_question_it_asked():
    notes = [
        "What is left out: This was answered twice and every answer is being used.",
        "What earns a place: This was answered twice and every answer is being used.",
    ]
    remaining = spec.drop_note_for(notes, "cut")
    assert remaining == [notes[1]]
