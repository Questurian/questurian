"""Improvement 05: what the editor keeps having to fix.

Every accepted section edit is a person saying the writer got something wrong
and this is what right looks like. One of those is a correction. Twenty of the
same shape, across different articles and different forms, is a gap in the house
voice.

The whole design is the difference between those two things, so most of these
tests are about refusing to draw a conclusion: from too few articles, from one
form, or from evidence that has already been used to draw it.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.features.prompt2blog.edit_patterns import (
    MIN_FORMS_FOR_A_VOICE_RULE,
    MIN_RUNS_FOR_A_PATTERN,
    Occurrence,
    PatternDecision,
    edit_shape,
    gather_occurrences,
    group_patterns,
    outstanding,
    review,
)

HEDGED = (
    "## Where to eat\n\nBoth are arguably good, and it might come down to "
    "what you generally prefer on the day."
)
CHOSEN = (
    "## Where to eat\n\nGo to Surquillo market. Central is the one to book "
    "only if a tasting menu is what you came for."
)


def _edit(**overrides) -> dict[str, Any]:
    payload = dict(
        section_id="s1",
        action_id="clarify_recommendation",
        applied_at="2026-09-07T00:00:00+00:00",
        editor="alan",
        what_changed="Named the choice.",
        previous_markdown="(whole draft)",
        before=HEDGED,
        after=CHOSEN,
        reason="it kept hedging instead of choosing",
        form_id="service-guide",
    )
    payload.update(overrides)
    return payload


def _histories(count: int, **overrides) -> dict[str, Any]:
    return {
        f"run-{index}": {"edits": [_edit(**overrides)]} for index in range(count)
    }


# ---------------------------------------------------------------------------
# The shape of an edit, in a word two edits can share
# ---------------------------------------------------------------------------


def test_naming_a_choice_where_there_was_none_is_its_own_shape():
    assert edit_shape(HEDGED, CHOSEN) == "choice_named"


def test_removing_hedging_without_changing_length_is_its_own_shape():
    before = "It might arguably be quite good."
    after = "It is very good indeed at that."
    assert edit_shape(before, after) == "hedge_removed"


def test_a_materially_shorter_replacement_is_a_cut():
    before = " ".join(["word"] * 40)
    after = " ".join(["word"] * 20)
    assert edit_shape(before, after) == "shortened"


def test_a_longer_replacement_that_names_a_choice_is_about_the_choice():
    """Length is the side effect. Grouping it as `lengthened` would put the

    same editorial move in two piles.
    """
    before = "Both places serve ceviche."
    after = (
        "Both places serve ceviche, and if you have one meal you should go to "
        "the market rather than the dining room, because that is where the "
        "cooking is."
    )
    assert edit_shape(before, after) == "choice_named"


def test_an_edit_that_matched_nothing_is_a_rephrase_not_a_guess():
    before = "The market sits in Surquillo."
    after = "Surquillo is where the market sits."
    assert edit_shape(before, after) == "rephrased"


# ---------------------------------------------------------------------------
# Reading accepted edits
# ---------------------------------------------------------------------------


def test_edits_are_grouped_by_the_kind_of_work_they_did():
    patterns = group_patterns(gather_occurrences(_histories(3)))
    assert len(patterns) == 1
    assert patterns[0].action_id == "clarify_recommendation"
    assert patterns[0].shape == "choice_named"
    assert patterns[0].runs == ["run-0", "run-1", "run-2"]


def test_an_edit_recorded_before_the_section_text_travelled_counts_for_nothing():
    """Rather than counting as a rephrase.

    Runs edited before improvement 05 have an action and no before/after.
    Reading them as evidence of anything would put a shape on edits nobody can
    see.
    """
    occurrences = gather_occurrences({"run-0": {"edits": [_edit(before="", after="")]}})
    assert occurrences == []


def test_an_edit_that_changed_only_whitespace_is_not_a_pattern():
    occurrences = gather_occurrences(
        {"run-0": {"edits": [_edit(after=HEDGED.replace("\n\n", "\n\n  "))]}}
    )
    assert occurrences == []


def test_an_unknown_form_stays_unknown_rather_than_being_guessed():
    """Guessing it is how a single-form pattern becomes a voice rule."""
    occurrences = gather_occurrences({"run-0": {"edits": [_edit(form_id="")]}})
    assert occurrences[0].form_id == ""


# ---------------------------------------------------------------------------
# The two refusals
# ---------------------------------------------------------------------------


def test_two_articles_is_a_coincidence_with_a_witness():
    pattern = group_patterns(gather_occurrences(_histories(2)))[0]
    assert pattern.enough_history is False
    assert pattern.can_be_a_voice_rule is False
    assert "coincidence with a witness" in pattern.as_record()["why_not_a_voice_rule"]


def test_the_same_fix_on_one_form_is_a_finding_about_that_form():
    """A correction appropriate to a service guide is not a rule about profiles.

    The voice file is read by every form there is, so this refusal is separate
    from the not-enough-history one and says something different.
    """
    pattern = group_patterns(gather_occurrences(_histories(4)))[0]
    assert pattern.enough_history is True
    assert pattern.can_be_a_voice_rule is False
    record = pattern.as_record()
    assert "service-guide" in record["why_not_a_voice_rule"]
    assert "not a rule about every article" in record["why_not_a_voice_rule"]


def test_enough_articles_across_enough_forms_is_worth_asking_about():
    histories = {
        "run-0": {"edits": [_edit(form_id="service-guide")]},
        "run-1": {"edits": [_edit(form_id="service-guide")]},
        "run-2": {"edits": [_edit(form_id="comparison")]},
        "run-3": {"edits": [_edit(form_id="destination-guide")]},
    }
    pattern = group_patterns(gather_occurrences(histories))[0]

    assert pattern.can_be_a_voice_rule is True
    assert pattern.as_record()["why_not_a_voice_rule"] == ""


def test_the_thresholds_are_floors_not_findings():
    """Above them the question is worth asking. That is all they mean."""
    assert MIN_RUNS_FOR_A_PATTERN == 3
    assert MIN_FORMS_FOR_A_VOICE_RULE == 2
    reviewed = review(_histories(4))
    assert "not proof that the voice file is wrong" in reviewed["means"]


def test_one_operator_editing_one_article_repeatedly_is_one_opinion():
    """Counted by article, not by edit.

    The same person fixing the same piece three times is one opinion held
    loudly, and counting edits would let it clear the bar alone.
    """
    histories = {"run-0": {"edits": [_edit(), _edit(section_id="s2"), _edit(section_id="s3")]}}
    pattern = group_patterns(gather_occurrences(histories))[0]

    assert len(pattern.occurrences) == 3
    assert pattern.runs == ["run-0"]
    assert pattern.enough_history is False


# ---------------------------------------------------------------------------
# Held-out examples
# ---------------------------------------------------------------------------


def test_some_examples_are_held_back_from_whatever_rule_is_drawn():
    """A rule checked only against what produced it cannot fail."""
    pattern = group_patterns(gather_occurrences(_histories(6)))[0]
    motivating, held_out = pattern.split_for_review()

    assert motivating and held_out
    assert len(motivating) + len(held_out) == 6


def test_examples_are_held_out_by_article_not_by_edit():
    """Two edits from the same article are the same evidence twice.

    Holding one of them back would leave a "held-out" example the rule had
    effectively already seen.
    """
    histories = {
        f"run-{index}": {"edits": [_edit(), _edit(section_id="s2")]}
        for index in range(4)
    }
    pattern = group_patterns(gather_occurrences(histories))[0]
    motivating, held_out = pattern.split_for_review()

    motivating_runs = {item.run_id for item in motivating}
    held_out_runs = {item.run_id for item in held_out}
    assert motivating_runs & held_out_runs == set()


def test_a_pattern_is_never_held_out_into_nothing():
    pattern = group_patterns(gather_occurrences(_histories(MIN_RUNS_FOR_A_PATTERN)))[0]
    motivating, _held_out = pattern.split_for_review()
    assert motivating


# ---------------------------------------------------------------------------
# Nothing here writes a rule
# ---------------------------------------------------------------------------


def test_the_review_says_it_changes_nothing():
    """Silently learning a new instruction is the failure this is one wrong

    turn away from. The refusal is written into the payload rather than left to
    whoever reads it.
    """
    means = review(_histories(4))["means"]
    assert "Nothing here changes any rule" in means
    assert "edited by a person" in means


def test_an_editors_taste_is_also_a_pattern_and_the_payload_says_so():
    assert "an editor's taste is also a pattern" in review(_histories(4))["means"]


def test_a_pattern_a_person_answered_stops_being_offered():
    histories = {
        "run-0": {"edits": [_edit(form_id="service-guide")]},
        "run-1": {"edits": [_edit(form_id="comparison")]},
        "run-2": {"edits": [_edit(form_id="destination-guide")]},
    }
    reviewed = review(histories)
    assert len(outstanding(reviewed, [])) == 1

    settled = [
        PatternDecision(
            pattern_id="clarify_recommendation:choice_named", verdict="adopted"
        )
    ]
    assert outstanding(reviewed, settled) == []


@pytest.mark.parametrize("verdict", ["adopted", "declined"])
def test_both_answers_stop_it_being_offered_and_only_one_improves_anything(verdict):
    histories = {
        "run-0": {"edits": [_edit(form_id="service-guide")]},
        "run-1": {"edits": [_edit(form_id="comparison")]},
        "run-2": {"edits": [_edit(form_id="destination-guide")]},
    }
    settled = [
        PatternDecision(
            pattern_id="clarify_recommendation:choice_named", verdict=verdict
        )
    ]
    assert outstanding(review(histories), settled) == []


def test_a_pattern_below_threshold_is_reported_but_never_offered():
    """Visible, so an operator can see it forming. Not actionable yet."""
    reviewed = review(_histories(2))
    assert reviewed["patterns"]
    assert reviewed["ready_for_review"] == []
    assert outstanding(reviewed, []) == []


def test_the_reasons_the_operator_typed_travel_with_the_pattern():
    pattern = group_patterns(gather_occurrences(_histories(3)))[0]
    assert pattern.reasons == ["it kept hedging instead of choosing"]


def test_an_edit_with_no_reason_is_not_read_as_having_one():
    """Nothing is inferred from the absence of a reason."""
    pattern = group_patterns(gather_occurrences(_histories(3, reason="")))[0]
    assert pattern.reasons == []
    assert isinstance(pattern.occurrences[0], Occurrence)
