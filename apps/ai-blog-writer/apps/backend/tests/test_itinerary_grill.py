"""The day interview, and the one thing it is not allowed to do.

The loop itself is the article grill's and is tested there. What is tested
here is the part this feature adds: the checklist it settles, the prompt it
asks with, and -- the load-bearing one -- that it reaches no search, enforced
in code rather than requested in prose.
"""

from __future__ import annotations

from app.features.itinerary_pipeline import grill
from app.features.itinerary_pipeline.contracts import ITINERARY_MARKER_KEYS
from app.features.prompt2blog.grill_v4 import GrillDependencies, start_grill
from app.features.prompt2blog.contracts_v4 import MARKER_KEYS

from tests.itinerary_pipeline_support import LookupHungryGrill, ScriptedGrill


BRIEF = "THE TRIP: Lima.\nTHE DAY: six stops."


def test_the_interview_settles_the_eight_areas_and_agrees():
    llm = ScriptedGrill(ITINERARY_MARKER_KEYS)
    state = grill.start(run_id="run1", seed="Day 1 of 3 in Lima", brief=BRIEF, llm=llm)
    assert state.status == "asking"
    assert state.marker_keys == ITINERARY_MARKER_KEYS

    while state.status == "asking":
        state = grill.answer(state, "Yes, that one.", brief=BRIEF, llm=llm)

    assert state.status == "agreed"
    assert set(state.markers_covered) == set(ITINERARY_MARKER_KEYS)
    assert state.consensus


def test_it_reports_itself_as_the_itinerary_job():
    """Not `p2b.grill`. The dashboard changes a model by job id, and a feature
    that borrows the engine and keeps the engine's id is a feature nobody can
    point at a different model."""
    llm = ScriptedGrill(ITINERARY_MARKER_KEYS)
    grill.start(run_id="run1", seed="Day 1", brief=BRIEF, llm=llm)
    assert llm.jobs == ["itinerary.grill"]


def test_starting_buys_no_seed_research():
    """The article grill looks the subject up before asking anything. This one
    must not: its facts come from a setup somebody filled in, and a lookup here
    would put unverified venue knowledge into a recommendation."""
    calls: list[str] = []

    def research(query: str):
        calls.append(query)
        return "some digest", ["https://example.com"], 10

    llm = ScriptedGrill(ITINERARY_MARKER_KEYS)
    dependencies = GrillDependencies(
        llm=llm,
        research=research,
        job_id="itinerary.grill",
        build_prompt=lambda state: BRIEF,
        seed_research_enabled=False,
        mid_turn_lookup_enabled=False,
    )
    state = start_grill(
        run_id="run1",
        seed="Day 1",
        dependencies=dependencies,
        marker_keys=ITINERARY_MARKER_KEYS,
    )
    assert calls == []
    assert state.research_digest == ""
    assert state.research_source_urls == []


def test_a_model_that_asks_for_a_lookup_does_not_get_one():
    """The prompt says not to. A model that ignores it still cannot spend."""
    calls: list[str] = []

    def research(query: str):
        calls.append(query)
        return "digest", [], 1

    llm = LookupHungryGrill(ITINERARY_MARKER_KEYS)
    dependencies = GrillDependencies(
        llm=llm,
        research=research,
        job_id="itinerary.grill",
        build_prompt=lambda state: BRIEF,
        seed_research_enabled=False,
        mid_turn_lookup_enabled=False,
    )
    state = start_grill(
        run_id="run1",
        seed="Day 1",
        dependencies=dependencies,
        marker_keys=ITINERARY_MARKER_KEYS,
    )
    assert llm.lookups_requested >= 1, "the double was supposed to ask for one"
    assert calls == []
    assert state.lookups == []
    # And the turn is still usable: ignoring the lookup does not throw the
    # perfectly good question away with it.
    assert state.status == "asking"
    assert state.pending is not None


def test_the_article_grill_still_researches():
    """The capability switches default to on. A change made for the itinerary
    that quietly ungrounds Prompt2Blog is a worse bug than the one it fixes."""
    calls: list[str] = []

    def research(query: str):
        calls.append(query)
        return "digest", ["https://example.com"], 5

    llm = ScriptedGrill(MARKER_KEYS)
    dependencies = GrillDependencies(llm=llm, research=research)
    state = start_grill(run_id="run1", seed="Lima food", dependencies=dependencies)
    assert calls == ["Lima food"]
    assert state.research_digest == "digest"


def test_the_prompt_carries_the_day_and_forbids_venue_facts():
    llm = ScriptedGrill(ITINERARY_MARKER_KEYS)
    brief = "THE DAY YOU ARE PLANNING: day 1 of 3 · id day-1"
    grill.start(run_id="run1", seed="Day 1", brief=brief, llm=llm)
    prompt = llm.prompts[0]
    assert brief in prompt
    assert "YOU CANNOT LOOK ANYTHING UP" in prompt
    assert "NEVER state a fact about a real place" in prompt
    # The two rules the plan is most insistent about.
    assert "never mean fewer stops" in prompt
    assert '"UNKNOWN", NOT "NONE"' in prompt


def test_the_brief_is_rebuilt_per_turn_and_not_stored_in_the_seed():
    """A resumed interview has to describe the trip as it is now, not as it was
    when the interview opened."""
    llm = ScriptedGrill(ITINERARY_MARKER_KEYS)
    state = grill.start(run_id="run1", seed="Day 1 of 3", brief="FIRST BRIEF", llm=llm)
    state = grill.answer(state, "Yes.", brief="SECOND BRIEF", llm=llm)
    assert "FIRST BRIEF" in llm.prompts[0]
    assert "SECOND BRIEF" in llm.prompts[1]
    assert "FIRST BRIEF" not in llm.prompts[1]
    assert state.seed == "Day 1 of 3"
