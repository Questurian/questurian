"""Catching what the cut said to leave out, before and after paying for it.

Run 33fca394 approved an angle reading "Nikkei cevicherias doing
Japanese-Peruvian preparations" while its cut read "no places where ceviche is
not the primary offering". Those two disagree. Nothing said so, the search ran,
and 8 of its 10 places were barred by the same order that bought them -- one of
seven paid searches, spent entirely on results already ruled out.
"""

from __future__ import annotations

import pytest

from app.features.listicle_pipeline import cut_review, service, store
from app.features.listicle_pipeline.contracts import SearchOrder, SelectedAngle
from tests.listicle_test_support import agreed_state


def _order(**overrides) -> SearchOrder:
    defaults = dict(
        run_id="run0001",
        kind="cevicherias",
        place="Lima",
        exclusions="no places where ceviche is not the primary offering",
        angles=[
            SelectedAngle(angle_id="a1", text="cevicherias open for decades"),
            SelectedAngle(
                angle_id="a2",
                text="Nikkei cevicherias doing Japanese-Peruvian preparations",
            ),
        ],
    )
    defaults.update(overrides)
    return SearchOrder(**defaults)


def _reviewer(payload, *, seen=None):
    def review(job_id, prompt, tool_name, schema):
        if seen is not None:
            seen.append((job_id, prompt, tool_name))
        return payload

    return review


# Before the money is spent


def test_an_angle_that_fights_the_cut_is_named():
    conflicts = cut_review.review_order(
        _order(),
        _reviewer(
            {
                "conflicts": [
                    {
                        "angle_id": "a2",
                        "why": "Most Nikkei restaurants serve ceviche among many dishes.",
                    }
                ]
            }
        ),
    )
    assert [c.angle_id for c in conflicts] == ["a2"]
    # Carries the wording so the screen can show it against the right line.
    assert "Nikkei" in conflicts[0].angle_text


def test_an_angle_id_nobody_offered_is_not_a_finding():
    """A verdict about an angle this order does not have is not about this
    order. Dropped rather than shown against a made-up line."""
    conflicts = cut_review.review_order(
        _order(),
        _reviewer({"conflicts": [{"angle_id": "a99", "why": "invented"}]}),
    )
    assert conflicts == []


def test_an_order_with_no_cut_does_not_spend_to_learn_that():
    seen: list = []
    assert cut_review.review_order(_order(exclusions=""), _reviewer({}, seen=seen)) == []
    assert seen == [], "nothing to contradict, so nothing should have been asked"


def test_an_order_with_no_angles_does_not_spend_either():
    seen: list = []
    assert cut_review.review_order(_order(angles=[]), _reviewer({}, seen=seen)) == []
    assert seen == []


# After they come back


def _candidates():
    return [
        {
            "name": "Maido",
            "district": "Miraflores",
            "sightings": [{"evidence": "top Nikkei restaurant, offers ceviche"}],
        },
        {
            "name": "Canta Rana",
            "district": "Barranco",
            "sightings": [{"evidence": "cevicheria open since the 1980s"}],
        },
    ]


def test_a_returned_place_that_breaks_the_cut_is_flagged():
    flags = cut_review.review_candidates(
        _order(),
        _candidates(),
        _reviewer(
            {
                "barred": [
                    {
                        "number": 1,
                        "name": "Maido",
                        "why": "A Nikkei restaurant where ceviche is one dish of many.",
                        "confidence": "clear",
                    }
                ]
            }
        ),
    )
    assert set(flags) == {"Maido"}
    assert flags["Maido"]["confidence"] == "clear"


def test_the_evidence_the_searches_wrote_is_what_gets_judged():
    """The whole reason this costs one call instead of forty: nothing is
    looked up. "offers ceviche" is already on disk."""
    seen: list = []
    cut_review.review_candidates(_order(), _candidates(), _reviewer({}, seen=seen))
    prompt = seen[0][1]
    assert "offers ceviche" in prompt
    assert "cevicheria open since the 1980s" in prompt
    assert "no places where ceviche is not the primary offering" in prompt


@pytest.mark.parametrize("value", ["", "maybe", "CLEARLY", "yes", "definite"])
def test_a_confidence_nobody_recognises_is_read_as_arguable(value):
    """The safe direction. `arguable` asks the operator to look; `clear` tells
    them not to bother, and a wrong `clear` costs a place that belonged."""
    flags = cut_review.review_candidates(
        _order(),
        _candidates(),
        _reviewer(
            {
                "barred": [
                    {"number": 1, "name": "Maido", "why": "because", "confidence": value}
                ]
            }
        ),
    )
    assert flags["Maido"]["confidence"] == "arguable"


def test_the_row_number_identifies_the_place_not_its_name():
    """A real call answered "Chez Wong (La Victoria)" -- it had copied the line
    back exactly as printed, district and all. Keying on the name dropped every
    finding silently. The number cannot be mangled by formatting."""
    flags = cut_review.review_candidates(
        _order(),
        _candidates(),
        _reviewer(
            {
                "barred": [
                    {
                        "number": 1,
                        "name": "Maido (Miraflores)",
                        "why": "ceviche is one dish of many",
                        "confidence": "clear",
                    }
                ]
            }
        ),
    )
    assert set(flags) == {"Maido"}


def test_the_listing_is_numbered_so_the_answer_can_point_at_a_row():
    seen: list = []
    cut_review.review_candidates(_order(), _candidates(), _reviewer({}, seen=seen))
    prompt = seen[0][1]
    assert "1. Maido" in prompt
    assert "2. Canta Rana" in prompt


@pytest.mark.parametrize("number", [0, 3, 99, -1, None, "two"])
def test_a_row_number_that_is_not_a_row_is_dropped(number):
    flags = cut_review.review_candidates(
        _order(),
        _candidates(),
        _reviewer(
            {"barred": [{"number": number, "name": "Maido", "why": "x",
                         "confidence": "clear"}]}
        ),
    )
    assert flags == {}


def test_a_number_naming_a_different_place_is_dropped_as_an_off_by_one():
    """Acting on it would flag an innocent place while the real one goes
    unflagged -- worse than losing the finding."""
    flags = cut_review.review_candidates(
        _order(),
        _candidates(),
        _reviewer(
            {
                "barred": [
                    {
                        "number": 2,
                        "name": "Maido",
                        "why": "ceviche is one dish of many",
                        "confidence": "clear",
                    }
                ]
            }
        ),
    )
    assert flags == {}, "row 2 is Canta Rana, so this verdict is not trustworthy"


# Where it runs, and where it must not


def test_agreeing_checks_the_order_because_that_turn_already_spends(isolated_db):
    state = agreed_state()
    store.save(state)
    order = service.create_order(
        state,
        _reviewer({"conflicts": [{"angle_id": "a1", "why": "it fights the cut"}]}),
    )
    assert order.conflicts_checked is True
    assert [c.why for c in order.angle_conflicts] == ["it fights the cut"]


def test_opening_the_order_never_spends(isolated_db):
    """Reopening a run without buying anything is the point of addressing runs
    by id. An unchecked order says so rather than reading as cleared."""
    state = agreed_state()
    store.save(state)
    order = service.order(state.run_id)
    assert order is not None
    assert order.conflicts_checked is False
    assert order.angle_conflicts == []


def test_a_check_that_fails_is_not_a_clean_bill(isolated_db):
    def explode(*_args, **_kwargs):
        raise RuntimeError("the model timed out")

    state = agreed_state()
    store.save(state)
    order = service.create_order(state, explode)
    assert order.conflicts_checked is False, "a failure must not read as checked"
    assert order.angle_conflicts == []


def test_changing_the_cut_retires_the_old_verdict(isolated_db):
    state = agreed_state()
    store.save(state)
    service.create_order(
        state, _reviewer({"conflicts": [{"angle_id": "a1", "why": "stale"}]})
    )

    revised = service.revise_order(
        state.run_id, exclusions="no chains at all", review=None
    )
    # The old answer was about a different question. Cleared, and honestly
    # marked unchecked rather than silently carried forward.
    assert revised.angle_conflicts == []
    assert revised.conflicts_checked is False


def test_nobody_checked_and_nothing_was_barred_are_different(isolated_db):
    state = agreed_state()
    store.save(state)
    service.create_order(state, None)
    order = service.order(state.run_id)

    assert store.load_cut_review(order.run_id, order.revision) is None
    store.save_cut_review(order.run_id, order.revision, {})
    assert store.load_cut_review(order.run_id, order.revision) == {}


def _two_rows_one_name():
    """A pair the merge refused to join, because their districts disagreed."""
    return [
        {
            "name": "Hanzo",
            "district": "Miraflores",
            "sightings": [{"evidence": "Nikkei restaurant"}],
        },
        {
            "name": "Hanzo",
            "district": "San Isidro",
            "sightings": [{"evidence": "second location"}],
        },
    ]


def test_two_verdicts_about_one_name_are_both_kept():
    """Last-write-wins threw one away silently. Run 33fca394 has three such
    pairs, and one came back barred for two different reasons."""
    flags = cut_review.review_candidates(
        _order(exclusions="no chains, and no places where ceviche is not primary"),
        _two_rows_one_name(),
        _reviewer(
            {
                "barred": [
                    {
                        "number": 1,
                        "name": "Hanzo",
                        "why": "A Nikkei restaurant.",
                        "confidence": "arguable",
                    },
                    {
                        "number": 2,
                        "name": "Hanzo",
                        "why": "It has a second location.",
                        "confidence": "clear",
                    },
                ]
            }
        ),
    )
    assert "Nikkei" in flags["Hanzo"]["why"]
    assert "second location" in flags["Hanzo"]["why"]
    # The stronger of the two readings, so a `clear` is not softened by an
    # `arguable` that happened to arrive after it.
    assert flags["Hanzo"]["confidence"] == "clear"


def test_the_same_reason_twice_is_not_said_twice():
    flags = cut_review.review_candidates(
        _order(),
        _two_rows_one_name(),
        _reviewer(
            {
                "barred": [
                    {"number": 1, "name": "Hanzo", "why": "A Nikkei restaurant.",
                     "confidence": "arguable"},
                    {"number": 2, "name": "Hanzo", "why": "A Nikkei restaurant.",
                     "confidence": "arguable"},
                ]
            }
        ),
    )
    assert flags["Hanzo"]["why"] == "A Nikkei restaurant."


def test_an_unmerged_twin_is_marked_so_it_does_not_read_as_a_chain():
    """A real run flagged Chez Wong and El Verídico de Fidel as chains because
    each appeared as two unmerged rows in different districts. Neither is a
    chain: it is one place whose district two searches recorded differently."""
    seen: list = []
    cut_review.review_candidates(
        _order(exclusions="no chains"),
        [
            {
                "name": "Chez Wong",
                "district": "Lince",
                "possible_duplicates": ["Chez Wong"],
                "sightings": [{"evidence": "best ceviche in the world"}],
            },
            {
                "name": "Chez Wong",
                "district": "La Victoria",
                "possible_duplicates": ["Chez Wong"],
                "sightings": [{"evidence": "awarded on numerous occasions"}],
            },
        ],
        _reviewer({}, seen=seen),
    )
    prompt = seen[0][1]
    assert prompt.count("may be the same place as another row here") == 2
    # Phrases chosen to sit inside one line: the prompt is wrapped.
    assert "record-keeping artefact" in prompt
    assert "Do not call something a chain because it appears twice" in prompt


def test_a_row_with_no_twin_is_not_marked():
    seen: list = []
    cut_review.review_candidates(_order(), _candidates(), _reviewer({}, seen=seen))
    assert "may be the same place" not in seen[0][1]
