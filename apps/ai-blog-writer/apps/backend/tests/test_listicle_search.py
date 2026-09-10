"""The search order: what it asks for, and what it does with the answers."""

from __future__ import annotations

import pytest

from app.features.listicle_pipeline.search import (
    Candidate,
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


def test_a_fuller_name_from_another_search_is_raised_not_absorbed():
    """"La Mar" and "La Mar Cebichería" are one restaurant, and this step
    cannot prove it: the same shape of evidence produced "Hotel Sol" and
    "Hotel Sol Palace", which are two hotels. Both rows stand, each keeps what
    its own search said about it, and the pair is named.
    """
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

    assert sorted(c.name for c in candidates) == ["La Mar", "La Mar Cebichería"]
    fuller = next(c for c in candidates if c.name == "La Mar Cebichería")
    assert fuller.district == "Miraflores"
    assert all(c.possible_duplicates for c in candidates)


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


def _pooled(*rows):
    """Pool a handful of hand-written rows. (name, district, angle)."""
    from app.features.listicle_pipeline.search import Sighting, pool_sightings

    return pool_sightings(
        [
            Sighting(
                angle=angle,
                angle_id=angle,
                name=name,
                district=district,
                evidence="",
            )
            for name, district, angle in rows
        ]
    )


@pytest.mark.parametrize(
    "first, second",
    [
        # Both seen on the same run once the searches read Spanish sources.
        # These really are one bar and one hotel respectively -- and nothing in
        # the strings says so, which is the whole difficulty.
        ("Bar Inglés at the Country Club Hotel", "Bar Inglés del Country Club"),
        ("Gran Hotel Bolívar", "Gran Hotel Bolívar (Bar Catedral)"),
        ("Hotel B", "Hotel B (Rooftop bar)"),
    ],
)
def test_one_place_named_two_ways_is_shown_twice_and_linked(first, second):
    """Said to be a possible duplicate, never folded into one row.

    These pairs are genuinely one place, and the pipeline still does not merge
    them -- because the string evidence that they are one place is the same
    evidence "Hotel Sol" and "Hotel Sol Palace" produce, and those are two
    hotels. A duplicate on screen costs the operator a glance. A false merge
    deletes a venue and leaves nothing to notice.
    """
    pooled = _pooled((first, "", "a"), (second, "Barranco", "b"))
    assert len(pooled) == 2
    assert all(c.possible_duplicates for c in pooled)
    assert all(c.possible_duplicate_ids for c in pooled)
    assert {c.candidate_id for c in pooled} != {""}, "and each one is addressable"


def test_containment_is_not_identity():
    """The reproduction. Two hotels in one district, one name inside the
    other's: folded into a single candidate with two sightings and no warning,
    and the shorter-named hotel was gone."""
    pooled = _pooled(("Hotel Sol", "Centro", "a"), ("Hotel Sol Palace", "Centro", "b"))
    assert sorted(c.name for c in pooled) == ["Hotel Sol", "Hotel Sol Palace"]
    assert all(len(c.sightings) == 1 for c in pooled)
    assert all(c.possible_duplicate_ids for c in pooled)


def test_a_shorter_name_inside_a_longer_one_is_raised_as_a_pair():
    """Two rows, and a hint. The hint reads every word in the name rather than
    only the distinguishing ones: dropping "bar" and "la" before comparing is
    what left "La Mar" and "La Mar Cebichería" with nothing to link them."""
    pooled = _pooled(
        ("Bar Inglés", "", "a"), ("Bar Inglés del Country Club", "", "b")
    )
    assert len(pooled) == 2
    assert all(c.possible_duplicates for c in pooled)


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
    pooled = _pooled((first, "", "a"), (second, "", "b"))
    assert len(pooled) == 2


def test_a_one_word_abbreviation_is_raised_against_its_full_name():
    """Read off the live runs of 2026-09-10, both unflagged at the time.

    A model that writes a place out in full under one angle and shortens it
    under another shortens it to one word. The two-token floor silenced exactly
    that pair, and "Sonia" sat beside "Cevichería Sonia" in the same district
    with nothing on screen to connect them.
    """
    for short, full, district in (
        ("Saha", "SAHA Rooftop", "Miraflores"),
        ("Sonia", "Cevichería Sonia", "Chorrillos"),
    ):
        pooled = _pooled((short, district, "a"), (full, district, "b"))
        assert len(pooled) == 2, f"{short} must not be merged into {full}"
        assert all(c.possible_duplicates for c in pooled), f"{short} ~ {full}"


@pytest.mark.parametrize(
    "generic", ["Rooftop", "Bar", "Casa", "Hotel", "Terraza", "Restaurante"]
)
def test_a_lone_generic_word_is_not_a_name_and_links_to_nothing(generic):
    """The cost of accepting one-word containment, and the guard that pays it.

    A row that says only what kind of thing it is, is contained in half the
    pool. Linking on it would put a duplicate label on rows that share nothing
    but a category -- and a label that fires everywhere is one the operator
    learns to scroll past.
    """
    pooled = _pooled(
        (generic, "Miraflores", "a"),
        (f"{generic} Barranco", "Miraflores", "b"),
        ("Hotel B Rooftop", "Barranco", "c"),
        ("Casa Republica Barranco", "Barranco", "d"),
    )
    lone = next(c for c in pooled if c.name == generic)
    assert not lone.possible_duplicates, f"{generic!r} is a category, not a name"


def test_two_generic_words_together_can_still_be_a_name():
    """"El Mercado" is a real restaurant in Miraflores. The one-word guard must
    not grow into a rule that a name made of ordinary words is not a name."""
    pooled = _pooled(
        ("El Mercado", "Miraflores", "a"), ("El Mercado Miraflores", "Miraflores", "b")
    )
    assert len(pooled) == 2
    assert all(c.possible_duplicates for c in pooled)


def test_an_unknown_district_cannot_bridge_two_known_branches():
    """The failure this guards: a row with no district joining a Centro branch
    to a Barranco one, and three rows becoming one venue."""
    pooled = _pooled(
        ("Tanta", "Centro", "a"),
        ("Tanta", "Barranco", "b"),
        ("Tanta", "", "c"),
    )
    assert len(pooled) == 3
    assert sum(len(c.sightings) for c in pooled) == 3


def test_the_same_evidence_pools_the_same_way_whichever_order_it_arrives_in():
    rows = [
        ("El Mercado", "Miraflores", "a"),
        ("El Mercado", "Miraflores", "b"),
        ("Canta Rana", "Barranco", "b"),
        ("Tanta", "Centro", "c"),
    ]
    forward = _pooled(*rows)
    backward = _pooled(*reversed(rows))
    assert {c.candidate_id for c in forward} == {c.candidate_id for c in backward}
    assert sorted(c.name for c in forward) == sorted(c.name for c in backward)


def test_changed_membership_is_a_different_candidate():
    """What stops a stale verdict landing on new evidence: a candidate that
    gained a sighting is not the candidate a review was filed against."""
    before = _pooled(("El Mercado", "Miraflores", "a"))
    after = _pooled(("El Mercado", "Miraflores", "a"), ("El Mercado", "Miraflores", "b"))
    assert before[0].candidate_id != after[0].candidate_id


def test_every_input_sighting_appears_exactly_once():
    rows = [
        ("Hotel Sol", "Centro", "a"),
        ("Hotel Sol", "Centro", "b"),
        ("Hotel Sol Palace", "Centro", "c"),
        ("Hotel Sol", "", "d"),
    ]
    pooled = _pooled(*rows)
    members = [s.sighting_id for c in pooled for s in c.sightings]
    assert len(members) == len(rows)
    assert len(set(members)) == len(rows)


def test_a_parenthetical_is_the_rows_reason_not_part_of_the_name():
    assert name_tokens("Hotel B (Rooftop bar)") == name_tokens("Hotel B")


# --- what the plan of 2026-09-08 changed ----------------------------------


from app.features.listicle_pipeline.search import (  # noqa: E402
    SPECIFIC,
    AngleRequest,
    Sighting,
    build_search_prompt,
    contribution_of,
    pool_sightings,
    role_allowances,
    strip_list_marker,
)


@pytest.mark.parametrize(
    "line, expected",
    [
        # The failure. Stripping every leading digit turned a real hotel into
        # a common noun, and nothing downstream could tell it had happened.
        ("1900 Hotel", "1900 Hotel"),
        ("1. Bodega 1884", "Bodega 1884"),
        ("2) Bar Piselli 1915", "Bar Piselli 1915"),
        ("- Al Toke Pez", "Al Toke Pez"),
        ("**La Mar**", "La Mar"),
        ("400 Grados", "400 Grados"),
        ("10. 1900 Hotel", "1900 Hotel"),
    ],
)
def test_a_list_marker_goes_and_the_name_stays(line, expected):
    assert strip_list_marker(line) == expected


def test_a_numbered_row_keeps_the_year_in_the_name():
    rows = parse_rows("1. Bodega 1900 | Barranco | open since 1900\n")
    assert rows[0][0] == "Bodega 1900"


def test_two_branches_of_one_business_stay_two_businesses():
    """Merging them keeps one and loses the other, and the loss is invisible --
    the surviving row looks like an ordinary candidate.

    The rows are identical apart from the district, which is exactly the shape
    a chain's two branches arrive in.
    """
    merged = pool_sightings(
        [
            Sighting(angle="a", angle_id="a1", name="Tanta", district="Centro", evidence=""),
            Sighting(angle="b", angle_id="a2", name="Tanta", district="Miraflores", evidence=""),
        ]
    )
    assert len(merged) == 2
    # Not silently dropped either: the screen is told these might be one place.
    assert all(c.possible_duplicates for c in merged)


def test_a_branch_named_in_the_title_is_not_folded_into_the_shorter_name():
    pooled = _pooled(
        ("Tanta Larcomar", "Miraflores", "a"),
        ("Tanta Larcomar Centro", "Centro", "b"),
    )
    assert len(pooled) == 2
    assert all(c.possible_duplicates for c in pooled)


def test_two_bars_inside_one_hotel_stay_two_bars():
    pooled = _pooled(
        ("Gran Hotel Bolívar (Bar Catedral)", "", "a"),
        ("Gran Hotel Bolívar (Bar Maury)", "", "b"),
    )
    assert len(pooled) == 2


def test_a_hotel_and_its_only_named_bar_are_linked_not_merged():
    """One row qualified and one not, in a search for bars, is usually the same
    bar written two ways. It is not always: "Hotel Azul" and "Hotel Azul (Lobby
    bar)" are a hotel and a bar inside it, and the strings cannot tell the two
    situations apart.

    The cost of the honest answer is real and is recorded here: the overlap of
    a place two angles agreed on is split across two rows, and the count is
    reported as provisional while it is."""
    pooled = _pooled(("Hotel B", "", "a"), ("Hotel B (Rooftop bar)", "", "b"))
    assert len(pooled) == 2
    assert all(c.possible_duplicates for c in pooled)


def test_an_accent_variant_in_the_same_district_still_merges():
    merged = pool_sightings(
        [
            Sighting(angle="a", angle_id="a1", name="Cevichería Nancy", district="Callao", evidence="x"),
            Sighting(angle="b", angle_id="a2", name="Cevicheria Nancy", district="Callao", evidence="y"),
        ]
    )
    assert len(merged) == 1
    assert merged[0].overlap == 2


def test_every_original_sighting_survives():
    """Keeping one evidence sentence and throwing the rest away is too thin to
    check an identity with: two angles found this place for two different
    reasons and the reasons are the only way to see whether it is one place.

    These two rows disagree about the district -- one states it and one does
    not -- so they are two candidates and both reasons are still on screen."""
    merged = pool_sightings(
        [
            Sighting(angle="awards", angle_id="a1", name="El Mercado", district="", evidence="on best-of lists"),
            Sighting(angle="nikkei", angle_id="a2", name="El Mercado", district="Miraflores", evidence="Japanese-Peruvian"),
        ]
    )
    assert len(merged) == 2
    assert sorted(s.evidence for c in merged for s in c.sightings) == [
        "Japanese-Peruvian",
        "on best-of lists",
    ]
    assert all(c.possible_duplicates for c in merged)


def test_contribution_does_not_depend_on_which_search_ran_first():
    """The first angle to return a place used to collect it, so reordering the
    searches changed the table."""
    shared = [
        Sighting(angle="a", angle_id="a1", name="El Mercado", district="Miraflores", evidence=""),
        Sighting(angle="b", angle_id="a2", name="El Mercado", district="Miraflores", evidence=""),
        Sighting(angle="b", angle_id="a2", name="Canta Rana", district="Barranco", evidence=""),
    ]
    forward = pool_sightings(shared)
    backward = pool_sightings(list(reversed(shared)))
    assert contribution_of(forward, "a") == contribution_of(backward, "a") == (1, 1, 0)
    assert contribution_of(forward, "b") == contribution_of(backward, "b") == (2, 1, 1)


def test_a_narrow_search_is_told_that_one_result_is_a_good_result():
    prompt = build_search_prompt(
        "the cevicheria credited with starting the boom",
        kind="cevicherias",
        place="Lima",
        exclusions="",
        standard="",
        wanted=2,
        role=SPECIFIC,
    )
    assert "do not pad" in prompt.lower()
    assert "keep going until" not in prompt.lower()


def test_the_requirements_are_composed_in_rather_than_written_into_the_angle():
    prompt = build_search_prompt(
        "rooftop bars with a view of the sea",
        kind="bars",
        place="Lima",
        exclusions="no hotel chains",
        standard="independently owned",
        wanted=8,
    )
    assert "independently owned" in prompt
    assert "no hotel chains" in prompt
    assert "no matter which description found it" in prompt


def test_allowances_are_bounded_and_add_up_to_more_than_the_target():
    allowances = role_allowances(40, ["broad", "broad", "distinctive", SPECIFIC])
    assert sum(allowances) >= 40
    assert allowances[3] < allowances[0]


def test_an_angle_request_carries_its_identity_through_the_result():
    def research(prompt: str):
        return "Al Toke Pez | Surquillo | counter", ["https://example.test"], 5

    _, results = run_search_order(
        [AngleRequest(angle_id="a7", text="counter ceviche", role="distinctive", wanted=6)],
        kind="cevicherias",
        place="Lima",
        target_items=20,
        research=research,
    )
    assert results[0].angle_id == "a7"
    assert results[0].role == "distinctive"
    assert results[0].wanted == 6
