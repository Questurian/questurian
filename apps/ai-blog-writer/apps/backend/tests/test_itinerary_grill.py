"""The day interview, and the one thing it is not allowed to do.

The loop itself is the article grill's and is tested there. What is tested
here is the part this feature adds: the checklist it settles, the prompt it
asks with, and -- the load-bearing one -- that it reaches no search, enforced
in code rather than requested in prose.
"""

from __future__ import annotations

import json

from app.features.itinerary_pipeline import grill
from app.features.itinerary_pipeline.contracts import ITINERARY_MARKER_KEYS
from app.features.prompt2blog.grill_v4 import GrillDependencies, start_grill
from app.features.prompt2blog.contracts_v4 import (
    MARKER_KEYS,
    GrillQuestion,
    GrillState,
    GrillTurn,
)

from tests.itinerary_pipeline_support import LookupHungryGrill, ScriptedGrill


BRIEF = "THE TRIP: Lima.\nTHE DAY: six stops."


def test_the_interview_settles_its_four_topics_and_agrees():
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
    assert "Never state a fact about a real place" in prompt
    assert "never fewer stops" in prompt
    assert "BLANK MEANS UNKNOWN" in prompt
    # The summary it asks for is short and holds no research instructions.
    assert "at most six short" in prompt
    assert "research checklist" not in prompt.lower()


def test_the_prompt_asks_for_a_short_answer_to_the_question_only():
    """The suggestion that prompted this was a paragraph of editorial prose
    that answered a food question with a whole day. The prompt must not ask
    for length, and must say to answer only what was asked."""
    llm = ScriptedGrill(ITINERARY_MARKER_KEYS)
    grill.start(run_id="run1", seed="Day 1", brief=BRIEF, llm=llm)
    prompt = llm.prompts[0]
    assert "20 to 60" not in prompt
    assert "travel editor" not in prompt
    assert "SHAPE" not in prompt
    assert "10 to 25 words" in prompt
    assert "Answer ONLY the question asked" in prompt
    assert "Never ask them to find" in prompt
    # Examples are not all about food, so the fix is not a food patch.
    assert "museum" in prompt
    assert "Good:" in prompt and "Bad:" in prompt


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


# ---------------------------------------------- interviews on the old topics --

LEGACY_KEYS = (
    "purpose",
    "geography",
    "anchors",
    "slot_intent",
    "rhythm",
    "continuity",
    "change_policy",
    "unknowns",
)


class AttentiveGrill:
    """Asks about the first topic its prompt lists as missing, then agrees.

    `ScriptedGrill` walks a fixed list, which cannot show whether a moved
    interview skips what it already settled. This one reads the prompt.
    """

    def __init__(self) -> None:
        self.prompts: list[str] = []
        self.asked: list[str] = []

    def invoke_json(self, *, prompt, model_name, schema, **kwargs):
        self.prompts.append(prompt)
        section = prompt.split("TOPICS TO SETTLE:")[1].split("Decide the single")[0]
        missing = [
            line[2:].split(":")[0]
            for line in section.splitlines()
            if line.startswith("- ") and line.endswith("still missing")
        ]
        # The list is refreshed after each call, so the topic just answered
        # still reads as missing. A real model sees the answer in the
        # transcript; this one remembers what it asked.
        missing = [topic for topic in missing if topic not in self.asked]
        if not missing:
            return (
                {
                    "done": True,
                    "ask": "",
                    "recommendation": "",
                    "consensus": "A food day in Miraflores.",
                    "markers_covered": list(ITINERARY_MARKER_KEYS),
                    "asks_about": "",
                },
                "raw",
            )
        topic = missing[0]
        self.asked.append(topic)
        return (
            {
                "done": False,
                "ask": f"What about {topic}?",
                "recommendation": f"A plain answer about {topic}.",
                "consensus": "",
                "markers_covered": [],
                "asks_about": topic,
            },
            "raw",
        )


def _legacy_question(index: int, topic: str) -> GrillQuestion:
    return GrillQuestion(
        question_id=f"q{index}",
        topic="next",
        ask=f"Old question {index} about {topic}?",
        recommendation=f"Old suggestion {index}.",
        asks_about=topic,
    )


def _legacy_turns(answered: tuple[str, ...]) -> list[GrillTurn]:
    return [
        GrillTurn(
            question=_legacy_question(index, topic),
            # The first is an accepted suggestion; the rest are their own words.
            answer=f"Old suggestion {index}." if index == 1 else f"My answer {index}.",
        )
        for index, topic in enumerate(answered, start=1)
    ]


def legacy_state(answered: tuple[str, ...], pending: str) -> GrillState:
    """An old interview waiting on its next question."""
    return GrillState(
        run_id="old1",
        seed="Day 1 of 2 in Lima",
        marker_keys=LEGACY_KEYS,
        turns=_legacy_turns(answered),
        status="asking",
        pending=_legacy_question(len(answered) + 1, pending),
        markers_covered=[*answered, "rhythm", "unknowns"],
    )


def legacy_agreed(answered: tuple[str, ...]) -> GrillState:
    """An old interview that agreed, as the saved Lima days did."""
    return GrillState(
        run_id="old1",
        seed="Day 1 of 2 in Lima",
        marker_keys=LEGACY_KEYS,
        turns=_legacy_turns(answered),
        status="agreed",
        consensus="The old eight-part agreement.",
        markers_covered=list(LEGACY_KEYS),
    )


def test_a_pending_old_question_keeps_its_answer_and_moves_to_four_topics():
    before = legacy_state(("purpose", "geography"), pending="continuity")
    llm = AttentiveGrill()
    after = grill.answer(before, "Day two has the museums.", brief=BRIEF, llm=llm)

    # Nothing said is rewritten; the answer to the old question is recorded.
    assert [turn.question for turn in after.turns[:2]] == [
        turn.question for turn in before.turns
    ]
    assert after.turns[2].question == before.pending
    assert after.turns[2].answer == "Day two has the museums."
    assert after.turns[0].accepted_as_drafted
    assert not after.turns[1].accepted_as_drafted

    # purpose + continuity settle angle, geography settles area. Nothing else,
    # and nothing the old interview only claimed (rhythm, unknowns).
    assert after.marker_keys == ITINERARY_MARKER_KEYS
    assert set(after.markers_covered) == {"angle", "area"}
    assert after.status == "asking"
    assert llm.asked == ["stops"]
    topics = llm.prompts[0].split("TOPICS TO SETTLE:")[1].split("Decide")[0]
    for old in LEGACY_KEYS:
        assert f"- {old}:" not in topics


def test_purpose_alone_does_not_settle_what_the_day_is_for():
    """How a day differs from the others is half of `angle`, and `purpose`
    never asked it."""
    before = legacy_state(("purpose",), pending="geography")
    llm = AttentiveGrill()
    after = grill.answer(before, "Miraflores only.", brief=BRIEF, llm=llm)
    assert set(after.markers_covered) == {"area"}
    assert llm.asked == ["angle"]


def test_a_moved_interview_finishes_on_the_four_topics_without_the_old_list():
    before = legacy_state(
        ("purpose", "geography", "anchors", "slot_intent"), pending="rhythm"
    )
    llm = AttentiveGrill()
    state = grill.answer(before, "Slow morning.", brief=BRIEF, llm=llm)
    while state.status == "asking":
        state = grill.answer(state, "Yes.", brief=BRIEF, llm=llm)
    assert state.status == "agreed"
    # Only what the old answers did not settle was asked.
    assert llm.asked == ["angle", "limits"]
    assert len(state.turns) == 7
    GrillState.model_validate(json.loads(state.model_dump_json()))


def test_a_moved_interview_is_not_agreed_on_its_own():
    """Everything carried is still not an agreement: the grill has to say it."""
    before = legacy_state(
        ("purpose", "geography", "slot_intent", "continuity"), pending="change_policy"
    )

    class Silent(AttentiveGrill):
        def invoke_json(self, **kwargs):
            payload, raw = super().invoke_json(**kwargs)
            payload["consensus"] = ""
            if payload["done"]:
                payload.update(ask="Anything else?", recommendation="Nothing else.")
            return payload, raw

    state = grill.answer(before, "Keep the lunch.", brief=BRIEF, llm=Silent())
    assert set(state.markers_covered) == set(ITINERARY_MARKER_KEYS)
    assert state.status == "asking"


def test_reopening_an_old_agreement_moves_it_and_keeps_what_was_answered():
    before = legacy_agreed(("purpose", "geography", "slot_intent", "rhythm"))
    llm = AttentiveGrill()
    after = grill.reopen(before, brief=BRIEF, llm=llm)
    assert after.status == "asking"
    assert after.consensus == ""
    assert after.turns == before.turns
    assert after.marker_keys == ITINERARY_MARKER_KEYS
    # The old agreement covered all eight; reopening carries only answers.
    assert set(after.markers_covered) == {"area", "stops"}
    assert llm.asked == ["angle"]


def test_reopening_a_current_interview_is_the_engines_reopen():
    llm = ScriptedGrill(ITINERARY_MARKER_KEYS)
    state = grill.start(run_id="run1", seed="Day 1", brief=BRIEF, llm=llm)
    while state.status == "asking":
        state = grill.answer(state, "Yes.", brief=BRIEF, llm=llm)
    reopened = grill.reopen(state, brief=BRIEF, llm=AttentiveGrill())
    assert reopened.status == "asking"
    assert reopened.turns == state.turns
    # Every current topic was asked and answered, so all four come back.
    assert set(reopened.markers_covered) == set(ITINERARY_MARKER_KEYS)


def test_a_current_interview_is_left_alone():
    state = legacy_state((), pending="purpose").model_copy(
        update={"marker_keys": ITINERARY_MARKER_KEYS, "markers_covered": ["area"]}
    )
    assert grill.on_current_topics(state) is state


def test_a_moved_interview_still_looks_nothing_up(monkeypatch):
    calls: list[str] = []
    monkeypatch.setattr(grill, "_no_research", lambda query: calls.append(query))
    llm = LookupHungryGrill(ITINERARY_MARKER_KEYS)
    grill.answer(
        legacy_state(("purpose",), pending="geography"), "Yes.", brief=BRIEF, llm=llm
    )
    grill.reopen(legacy_agreed(("purpose",)), brief=BRIEF, llm=llm)
    assert llm.lookups_requested >= 2
    assert calls == []
