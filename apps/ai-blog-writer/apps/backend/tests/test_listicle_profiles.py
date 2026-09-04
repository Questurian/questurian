"""Place profiles: what is kept about a place, and what stays true on a rerun."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.features.listicle_pipeline import profile_store
from app.features.listicle_pipeline.profile_research import (
    build_research_prompt,
    parse_claims,
    research_place,
)
from app.features.listicle_pipeline.profiles import Claim, PlaceProfile, Sighting


@pytest.fixture(autouse=True)
def isolated_db(tmp_path, monkeypatch):
    """Never let these touch the real pipeline database.

    Routes driven through this app run real handlers against `data/pipeline.db`
    unless the path is redirected, and that has cost real data before.
    """
    import app.config as config
    import app.core.database as database

    monkeypatch.setattr(config, "DATA_DIR", tmp_path, raising=False)
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "test.db", raising=False)
    monkeypatch.setattr(database, "DATA_DIR", tmp_path, raising=False)
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "test.db", raising=False)
    yield


# --- identity -------------------------------------------------------------


def test_the_same_place_typed_two_ways_opens_one_profile():
    first = profile_store.open_profile(name="Museo del Pisco", city="Lima, Peru")
    second = profile_store.open_profile(name="museo  del  pisco", city="Lima, Peru")
    assert first.profile_id == second.profile_id


def test_the_same_name_in_another_city_is_another_place():
    lima = profile_store.open_profile(name="Museo del Pisco", city="Lima, Peru")
    cusco = profile_store.open_profile(name="Museo del Pisco", city="Cusco, Peru")
    assert lima.profile_id != cusco.profile_id


def test_a_profile_gains_its_anchor_without_losing_what_it_gathered():
    """Profiles are opened before resolution runs -- there may be no API key at
    all -- so the anchor has to arrive later without starting again."""
    opened = profile_store.open_profile(name="Bar Cordano", city="Lima, Peru")
    profile_store.add_claims(
        opened.profile_id, [Claim(kind="history", text="Opened in 1905.")]
    )

    profile_store.open_profile(
        name="Bar Cordano", city="Lima, Peru", place_id="ChIJcordano"
    )

    anchored = profile_store.find(place_id="ChIJcordano")
    assert anchored is not None
    assert anchored.profile_id == opened.profile_id
    assert len(anchored.claims) == 1


def test_an_anchored_profile_is_found_by_its_place_id_whatever_it_is_called():
    """The whole reason for the Place ID: a later run spelling the name
    differently must reach the same profile."""
    opened = profile_store.open_profile(
        name="Bar Inglés", city="Lima, Peru", place_id="ChIJingles"
    )
    found = profile_store.find(place_id="ChIJingles", name="Bar Inglés del Country Club")
    assert found is not None and found.profile_id == opened.profile_id


# --- accumulating ---------------------------------------------------------


def test_researching_the_same_place_twice_does_not_double_its_claims():
    profile = profile_store.open_profile(name="Canta Rana", city="Lima, Peru")
    claim = Claim(kind="award", text="Won the Summum award in 2019.")

    assert profile_store.add_claims(profile.profile_id, [claim]) == 1
    # Reworded punctuation, same words. This is what a second research pass
    # actually returns.
    assert (
        profile_store.add_claims(
            profile.profile_id, [Claim(kind="award", text="won the summum award in 2019")]
        )
        == 0
    )
    assert len(profile_store.find(name="Canta Rana", city="Lima, Peru").claims) == 1


def test_a_rerun_of_the_same_listicle_does_not_inflate_the_overlap_signal():
    profile = profile_store.open_profile(name="Chez Wong", city="Lima, Peru")
    sighting = Sighting(angle="open for decades", run_id="run-a")

    assert profile_store.add_sighting(profile.profile_id, sighting) is True
    assert profile_store.add_sighting(profile.profile_id, sighting) is False


def test_a_second_listicle_adds_to_the_same_profile():
    """The payoff for keeping profiles at all: a place found by four angles
    across two lists is known to be a major place, for free."""
    profile = profile_store.open_profile(name="Museo del Pisco", city="Lima, Peru")
    for run_id, angle in (
        ("pisco-run", "bars open for decades"),
        ("pisco-run", "rooftop bars"),
        ("cocktail-run", "where bartenders drink"),
    ):
        profile_store.add_sighting(
            profile.profile_id, Sighting(angle=angle, run_id=run_id)
        )

    stored = profile_store.find(name="Museo del Pisco", city="Lima, Peru")
    assert len(stored.angles_seen) == 3
    assert sorted(stored.runs_seen) == ["cocktail-run", "pisco-run"]


def test_a_place_with_no_place_id_is_listed_for_resolution():
    profile_store.open_profile(name="El Bar de Niko", city="Lima, Peru")
    profile_store.open_profile(
        name="Anchored Bar", city="Lima, Peru", place_id="ChIJanchored"
    )
    assert [p.name for p in profile_store.unresolved()] == ["El Bar de Niko"]


def test_the_lm_link_is_written_back():
    """So a later listicle finding this place knows there is nothing to send."""
    profile = profile_store.open_profile(name="La Mar", city="Lima, Peru")
    profile_store.set_lm_location_id(profile.profile_id, 4417)
    assert profile_store.find(name="La Mar", city="Lima, Peru").lm_location_id == 4417


# --- what the gate will read ---------------------------------------------


def test_claims_are_counted_by_kind_not_just_totalled():
    """Four reviews and no history is not the same place to write about as no
    reviews and four history claims, and both are four claims."""
    profile = PlaceProfile(
        profile_id="p",
        name="x",
        claims=[
            Claim(kind="review", text="a"),
            Claim(kind="review", text="b"),
            Claim(kind="history", text="c"),
        ],
    )
    assert profile.claims_by_kind() == {"review": 2, "history": 1}


def test_an_award_never_goes_stale_and_a_practice_does():
    """An award in 2019 was still won in 2019. "Lunch only" from three years
    ago may simply be untrue now."""
    long_ago = datetime.now(timezone.utc) - timedelta(days=900)
    assert Claim(kind="award", text="won", found_at=long_ago).is_stale() is False
    assert Claim(kind="practice", text="lunch only", found_at=long_ago).is_stale() is True


# --- research -------------------------------------------------------------


def test_the_angles_go_into_the_lookup():
    """They are why the place is on this list, and they tell the search where
    to dig."""
    prompt = build_research_prompt("Chez Wong", "Lima, Peru", ["open for decades"])
    assert "Chez Wong" in prompt
    assert "open for decades" in prompt
    # And the local-language instruction that was worth 27% more results in the
    # search step applies here for the same reason.
    assert "local language" in prompt


def test_the_lookup_refuses_the_fields_location_manager_owns():
    prompt = build_research_prompt("Chez Wong", "Lima, Peru", [])
    assert "opening hours" in prompt
    assert "Do NOT report its address" in prompt


def test_an_invented_kind_keeps_the_sentence():
    """The model invented a label; the thing it labelled was still published."""
    claims = parse_claims("vibe | Regulars have gone for thirty years | 2020 | http://a")
    assert len(claims) == 1
    assert claims[0].kind == "other"
    assert claims[0].about_year == 2020


def test_a_claim_with_no_source_of_its_own_inherits_the_searchs():
    """Something was read to write that sentence; we just do not know which."""
    def research(prompt: str):
        return "history | Opened in 1905 | 1905 | ", ["https://elcomercio.pe/x"], 10

    result = research_place("Bar Cordano", "Lima, Peru", [], research)
    assert result.claims[0].source_url == "https://elcomercio.pe/x"
    assert result.sources == ["https://elcomercio.pe/x"]


def test_a_failed_lookup_leaves_the_profile_alone():
    def research(prompt: str):
        raise TimeoutError("read timed out")

    result = research_place("Somewhere", "Lima, Peru", [], research)
    assert result.claims == [] and result.sources == []
    # And it says so, rather than looking like a place nobody has written about.
    assert result.failed is True
    assert "TimeoutError" in result.reason


def test_a_namespace_url_is_not_a_citation():
    """Grounding metadata returns XML and SVG namespaces alongside real
    sources. Attributing a claim about a bar to w3.org is worse than
    attributing it to nothing: it looks like a citation."""
    def research(prompt: str):
        return "history | Opened in 1880 | 1880 | ", [
            "http://www.w3.org/2000/svg",
            "https://elcomercio.pe/real",
        ], 10

    result = research_place("Antigua Taberna Queirolo", "Lima, Peru", [], research)
    assert result.sources == ["https://elcomercio.pe/real"]
    assert result.claims[0].source_url == "https://elcomercio.pe/real"


def test_a_thin_first_answer_is_looked_up_again():
    """The same prompt for Antigua Taberna Queirolo returned nineteen claims,
    then one, then none, with nothing changed between the calls."""
    replies = iter([
        "history | Opened in 1880 | 1880 | http://a.test",
        "award | UNESCO Blue Shield | 2026 | http://b.test",
        "person | Founded by Santiago Queirolo | 1880 | http://c.test",
    ])
    calls = {"n": 0}

    def research(prompt: str):
        calls["n"] += 1
        return next(replies), ["http://a.test"], 5

    result = research_place("Antigua Taberna Queirolo", "Lima, Peru", [], research)
    # Every attempt is kept, because each finds different material.
    assert calls["n"] == 3
    assert len(result.claims) == 3


def test_a_place_with_plenty_is_not_looked_up_again():
    rich = "\n".join(f"review | finding number {n} | | http://a.test" for n in range(8))
    calls = {"n": 0}

    def research(prompt: str):
        calls["n"] += 1
        return rich, ["http://a.test"], 5

    result = research_place("Museo del Pisco", "Lima, Peru", [], research)
    assert calls["n"] == 1
    assert len(result.claims) == 8


def test_a_place_nobody_has_written_about_says_so_after_trying():
    def research(prompt: str):
        return "Nothing found.", ["http://a.test"], 1

    result = research_place("Somewhere Obscure", "Lima, Peru", [], research)
    assert result.failed is False
    assert "found nothing published" in result.reason
