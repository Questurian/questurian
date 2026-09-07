"""What changed factually, beside what changed textually.

Two halves, kept apart. The exact half is set differences between the two
strings, and is labelled as that: a regex noticing "only" is missing has not
reasoned about anything. The reading half is the checker's verdict, which is
the only one that can say two prices were swapped -- every figure is present in
both, so no comparison of sets will ever see it.
"""

from __future__ import annotations

from app.features.prompt2blog.edit_review import EditReview, candidate_hash
from app.features.prompt2blog.factual_changes import factual_changes, text_changes


def _kinds(original: str, candidate: str) -> list[tuple[str, str]]:
    return [(change.kind, change.text) for change in text_changes(original, candidate)]


def test_a_removed_figure_is_visible():
    assert _kinds("A costs $20 and B costs $40.", "A costs $20.") == [
        ("figure_removed", "$40")
    ]


def test_an_added_figure_is_visible():
    assert _kinds("A is cheap.", "A costs $20.") == [("figure_added", "$20")]


def test_a_date_removed_from_a_sentence_is_visible():
    assert _kinds(
        "The fee was 30 soles as of March 2026.", "The fee is 30 soles."
    ) == [
        ("date_removed", "march 2026"),
        ("qualification_removed", "as of"),
    ]


def test_a_removed_qualification_is_visible():
    assert _kinds(
        "Tickets are 30 soles, subject to seasonal changes.",
        "Tickets are 30 soles.",
    ) == [("qualification_removed", "subject to")]


def test_a_removed_negation_is_visible():
    assert _kinds(
        "The pass does not cover the museum.", "The pass covers the museum."
    ) == [("negation_removed", "not")]


def test_an_added_negation_is_visible():
    assert _kinds(
        "The pass covers the museum.", "The pass does not cover the museum."
    ) == [("negation_added", "not")]


def test_swapped_prices_produce_no_text_change():
    """The whole reason the panel needs two halves.

    "Same numbers" must not mean "same facts". Nothing here can see this one,
    and the panel must not imply that nothing seeing it means nothing is wrong.
    """
    assert _kinds("A costs $20. B costs $40.", "A costs $40. B costs $20.") == []


def test_rewording_that_changes_no_fact_produces_nothing():
    """A panel that fires on every edit teaches an editor to skip it, and then
    it is not there on the one that mattered."""
    assert (
        _kinds(
            "Both places are good, and you will enjoy either of them.",
            "Both are good; either will do.",
        )
        == []
    )


def test_a_qualifier_inside_a_longer_word_is_not_a_match():
    """"about" in "roundabout" is not a qualification."""
    assert _kinds("Walk to the roundabout.", "Walk to the roundabout now.") == []


def test_the_panel_says_what_its_text_changes_are_and_are_not():
    panel = factual_changes(
        original="Tickets are 30 soles as of March 2026.",
        candidate="Tickets are 30 soles.",
        review=None,
        base_revision=4,
    )
    payload = panel.as_dict()

    assert "not a judgement" in payload["text_changes_are"]
    assert {change["kind"] for change in payload["text_changes"]} == {
        "date_removed",
        "qualification_removed",
    }


def test_the_panel_carries_the_reading_as_well_as_the_differences():
    review = EditReview(
        status="unsupported",
        checked=True,
        assessment="The prices are attached to the wrong things.",
        unsupported_claims=[
            {"claim": "A costs $40", "reason": "The record says $20.", "severity": "high"}
        ],
    )
    panel = factual_changes(
        original="A costs $20. B costs $40.",
        candidate="A costs $40. B costs $20.",
        review=review,
        base_revision=4,
    )
    payload = panel.as_dict()

    assert payload["text_changes"] == []
    assert payload["review_status"] == "unsupported"
    assert payload["review"]["unsupported_claims"][0]["claim"] == "A costs $40"


def test_a_checker_that_did_not_answer_shows_as_unknown_not_as_clean():
    panel = factual_changes(
        original="A costs $20.",
        candidate="A is $20.",
        review=EditReview(status="unchecked", checked=False),
        base_revision=1,
    )

    assert panel.review_status == "unchecked"
    assert panel.as_dict()["review"]["checked"] is False


def test_the_panel_is_bound_to_the_candidate_it_describes():
    """An operator reading a panel for older text must not apply newer text
    under it."""
    panel = factual_changes(
        original="A costs $20.",
        candidate="A is $20.",
        review=None,
        base_revision=7,
    )

    assert panel.candidate_hash == candidate_hash("A is $20.")
    assert panel.candidate_hash != candidate_hash("A is $25.")
    assert panel.base_revision == 7
