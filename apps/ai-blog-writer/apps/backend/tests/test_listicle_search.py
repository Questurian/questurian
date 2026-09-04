"""The search order: what it asks for, and what it does with the answers."""

from __future__ import annotations

import pytest

from app.features.listicle_pipeline.search import (
    Candidate,
    merge_contained,
    name_tokens,
    normalise_name,
    parse_rows,
    per_angle_ask,
    run_search_order,
)


def test_asks_for_more_than_the_target_because_rows_collapse():
    """The first real run lost 15 of 49 rows to duplicates.

    Asking each angle for exactly its share guarantees falling short, so the
    ask carries the overlap already priced in.
    """
    assert per_angle_ask(40, 6) * 6 > 40


def test_the_ask_is_bounded_at_both_ends():
    # A tiny list still has to ask for enough to survive any overlap at all.
    assert per_angle_ask(4, 2) >= 6
    # And no single search is worth asking for more than it will answer well.
    assert per_angle_ask(500, 1) <= 15


def test_a_preamble_and_numbering_do_not_lose_the_list():
    """Models add both however firmly they are told not to, and a reply thrown
    away for its shape is a whole angle missing from the list."""
    rows = parse_rows(
        "Here are the places I found:\n"
        "1. Pescados Capitales | Miraflores | opened 2001\n"
        "- Chez Wong | La Victoria | reservation only\n"
        "I hope this helps.\n"
    )
    assert [row[0] for row in rows] == ["Pescados Capitales", "Chez Wong"]


def test_a_market_is_not_a_listicle_entry():
    """`Surquillo Market (stalls)` is a fair answer to "stalls inside Lima's
    markets" and is not a place a reader can walk into as one business."""
    rows = parse_rows(
        "Surquillo Market (stalls) | Surquillo | many stalls\n"
        "Al Toke Pez | Surquillo | counter with six stools\n"
    )
    assert [row[0] for row in rows] == ["Al Toke Pez"]


def test_the_same_place_under_two_names_is_one_place():
    """Double-counting the strongest entries corrupts the ranking rather than
    merely padding the list."""
    assert normalise_name("La Mar") == normalise_name("La Mar Cebichería")
    assert normalise_name("Cevichería Nancy") == normalise_name("Nancy")


def test_a_name_that_is_only_noise_words_survives():
    """`El Mercado` is a real restaurant; stripping both words would erase it."""
    assert normalise_name("El Mercado")


def test_overlap_is_kept_rather_than_thinned():
    """A place several angles agree on is the strongest thing on the list, and
    that count is the only ranking signal the pipeline has earned."""
    replies = {
        "awards": "El Mercado | Miraflores | on best-of lists",
        "nikkei": "El Mercado | Miraflores | Japanese-Peruvian",
        "decades": "Canta Rana | Barranco | open since the 1980s",
    }
    calls: list[str] = []

    def research(prompt: str):
        for angle, reply in replies.items():
            if angle in prompt:
                calls.append(angle)
                return reply, ["https://example.test"], 10
        raise AssertionError("unexpected prompt")

    candidates, results = run_search_order(
        list(replies),
        kind="cevicherias",
        place="Lima, Peru",
        target_items=10,
        research=research,
    )

    assert len(calls) == 3
    assert [c.name for c in candidates] == ["El Mercado", "Canta Rana"]
    assert candidates[0].overlap == 2
    assert sorted(candidates[0].found_by) == ["awards", "nikkei"]
    assert all(result.rows == 1 for result in results)


def test_the_bar_and_the_cut_reach_the_search():
    """The operator barred general restaurants and the Nikkei search returned
    four of them, because nothing carried the bar out of the interview."""
    seen: list[str] = []

    def research(prompt: str):
        seen.append(prompt)
        return "", [], 0

    run_search_order(
        ["nikkei cevicherias"],
        kind="cevicherias",
        place="Lima, Peru",
        target_items=10,
        exclusions="no hotel restaurants",
        standard="someone other than the place has written about it",
        research=research,
    )

    assert "no hotel restaurants" in seen[0]
    assert "someone other than the place has written about it" in seen[0]


def test_a_search_that_broke_is_not_a_search_that_found_nothing():
    """One is a fact about the network and the other is a fact about the topic,
    and only one of them is worth re-running."""
    attempts = {"n": 0}

    def research(prompt: str):
        attempts["n"] += 1
        raise TimeoutError("read timed out")

    candidates, results = run_search_order(
        ["fishing ports"],
        kind="cevicherias",
        place="Lima, Peru",
        target_items=10,
        research=research,
    )

    assert candidates == []
    assert results[0].failed is True
    assert "TimeoutError" in results[0].reason
    # Retried rather than abandoned: the first real run lost a whole angle to a
    # single timeout.
    assert attempts["n"] > 1


def test_a_transient_failure_does_not_lose_the_angle():
    calls = {"n": 0}

    def research(prompt: str):
        calls["n"] += 1
        if calls["n"] == 1:
            raise TimeoutError("read timed out")
        return "Al Toke Pez | Surquillo | counter", [], 5

    candidates, results = run_search_order(
        ["hidden"], kind="cevicherias", place="Lima, Peru", target_items=10,
        research=research,
    )

    assert [c.name for c in candidates] == ["Al Toke Pez"]
    assert results[0].failed is False


def test_the_fuller_name_and_a_missing_district_are_filled_in():
    # Matched on a word the prompt itself cannot contain: an earlier version of
    # this stub keyed on "one" and started matching every prompt the day the
    # search prompt gained the word "someone".
    def research(prompt: str):
        if "ANGLE-A" in prompt:
            return "La Mar |  | first sighting", [], 1
        return "La Mar Cebichería | Miraflores | second sighting", [], 1

    candidates, _ = run_search_order(
        ["ANGLE-A", "ANGLE-B"], kind="cevicherias", place="Lima, Peru",
        target_items=10, research=research,
    )

    assert len(candidates) == 1
    assert candidates[0].name == "La Mar Cebichería"
    assert candidates[0].district == "Miraflores"


def test_candidate_overlap_counts_angles():
    assert Candidate(name="x", district="", evidence="", found_by=["a", "b"]).overlap == 2


@pytest.mark.parametrize(
    "reply, expected",
    [
        ("", "the search came back empty"),
        ("I could not find any places matching that.", "the search answered but named no places"),
    ],
)
def test_an_empty_angle_says_which_kind_of_empty_it_was(reply, expected):
    """Three different things look identical as a zero, and only one of them is
    worth re-running."""

    def research(prompt: str):
        return reply, [], 1

    _, results = run_search_order(
        ["decades"], kind="cevicherias", place="Lima, Peru", target_items=10,
        research=research,
    )
    assert results[0].failed is False
    assert results[0].reason == expected


@pytest.mark.parametrize(
    "first, second",
    [
        # Both seen on the same run once the searches read Spanish sources.
        ("Bar Inglés at the Country Club Hotel", "Bar Inglés del Country Club"),
        ("Gran Hotel Bolívar", "Gran Hotel Bolívar (Bar Catedral)"),
        ("Hotel B", "Hotel B (Rooftop bar)"),
    ],
)
def test_one_place_named_two_ways_is_one_entry(first, second):
    """An undetected duplicate does not merely pad the list -- it splits the
    entry's overlap in half and drops it down the ranking."""
    merged = merge_contained(
        [
            Candidate(name=first, district="", evidence="", found_by=["a"]),
            Candidate(name=second, district="Barranco", evidence="", found_by=["b"]),
        ]
    )
    assert len(merged) == 1
    assert sorted(merged[0].found_by) == ["a", "b"]
    # A district either row carried survives the merge.
    assert merged[0].district == "Barranco"


def test_the_name_kept_is_the_business_not_the_searchs_note():
    """A tie on distinguishing words means the difference was a parenthetical,
    and the parenthetical is why the row turned up rather than what it is
    called."""
    merged = merge_contained(
        [
            Candidate(name="Hotel B (Rooftop bar)", district="", evidence="", found_by=["a"]),
            Candidate(name="Hotel B", district="", evidence="", found_by=["b"]),
        ]
    )
    assert merged[0].name == "Hotel B"


def test_a_single_distinguishing_word_is_not_enough_to_merge():
    """"Bar Inglés" reduces to one word once "bar" falls away, and one word is
    not evidence that two rows are the same place. The two spellings the real
    run actually produced both carry more than that and do merge."""
    merged = merge_contained(
        [
            Candidate(name="Bar Inglés", district="", evidence="", found_by=["a"]),
            Candidate(
                name="Bar Inglés del Country Club", district="", evidence="", found_by=["b"]
            ),
        ]
    )
    assert len(merged) == 2


@pytest.mark.parametrize(
    "first, second",
    [
        # One shared word is not evidence. These are two different bars.
        ("Museo del Pisco", "Pisco Bar"),
        ("Cala Restaurante", "Carnaval Bar"),
        ("Bodega Piselli", "Bar Piselli 1915"),
    ],
)
def test_two_places_that_merely_share_a_word_stay_apart(first, second):
    merged = merge_contained(
        [
            Candidate(name=first, district="", evidence="", found_by=["a"]),
            Candidate(name=second, district="", evidence="", found_by=["b"]),
        ]
    )
    assert len(merged) == 2


def test_a_parenthetical_is_the_rows_reason_not_part_of_the_name():
    assert name_tokens("Hotel B (Rooftop bar)") == name_tokens("Hotel B")
