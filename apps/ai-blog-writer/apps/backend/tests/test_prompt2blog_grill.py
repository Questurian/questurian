"""The five rules the grill exists to keep.

The audited Lima run passed every measure v3 owned and was unreadable, because
nothing in the flow ever asked what the article was for. These pin the
questions the grill must ask, and the ones it must not.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.features.prompt2blog.contracts_v4 import MARKER_KEYS, GrillQuestion, GrillState
from app.features.prompt2blog.grill_v4 import (
    GrillDependencies,
    advance_grill,
    answer_grill,
    build_next_turn_prompt,
    grill_stage_record,
    reopen_grill,
    research_seed,
    start_grill,
)

from app.features.prompt2blog.config import P2B_V4_GRILL_MAX_LOOKUPS

SEED = "Lima is no longer simply the stopover before Machu Picchu"


class FakeLLM:
    def __init__(self, responses: list[dict[str, Any]]):
        self.responses = list(responses)
        self.prompts: list[str] = []

    def invoke_json(self, *, prompt: str, **_kwargs) -> tuple[dict[str, Any], str]:
        self.prompts.append(prompt)
        return self.responses.pop(0), "{}"


def _question(**overrides) -> dict[str, Any]:
    """The flat shape the schema asks for and models actually produce."""
    payload = {
        "question_id": "q1",
        "topic": "what should this do for the reader",
        "ask": "Do you want a guide, or do you want to make the case?",
        "recommendation": "My recommendation: a first-timer's guide with a point of view.",
    }
    payload.update(overrides)
    return payload


def _done(consensus: str = "A first-timer's guide for someone with a Lima layover.", **overrides) -> dict[str, Any]:
    """A reply that agrees, with every brief marker covered.

    Agreement needs both halves now: a summary the operator can read, and a
    brief that can actually be filled (ADR 0033).
    """
    payload: dict[str, Any] = {
        "done": True,
        "consensus": consensus,
        "markers_covered": list(MARKER_KEYS),
    }
    payload.update(overrides)
    return payload


def _deps(responses: list[dict[str, Any]], digest: str = "Lima has a food reputation.") -> GrillDependencies:
    return GrillDependencies(
        llm=FakeLLM(responses),
        research=lambda _seed: (digest, ["https://example.pe/lima"], 900),
    )


def test_the_grill_looks_things_up_before_it_asks_anything():
    # G2. This is what keeps the grill short -- not a question limit. A grill
    # that asks what it could have looked up is a form with extra steps.
    deps = _deps([{"done": False, **_question()}])

    state = start_grill("run-1", SEED, deps)

    assert state.research_digest == "Lima has a food reputation."
    assert "Lima has a food reputation." in deps.llm.prompts[0]
    assert "never ask about anything in here" in deps.llm.prompts[0].lower()


def test_research_failure_leaves_the_grill_working_but_ungrounded():
    """An ungrounded grill asks more questions. That beats no article."""

    def _explode(_seed: str):
        raise RuntimeError("no credentials on this box")

    deps = GrillDependencies(llm=FakeLLM([]), research=_explode)

    assert research_seed(deps, SEED) == ("", [], None)


def test_every_question_carries_a_recommended_answer():
    # G1. Nobody faces a blank: correcting is easy where composing is not.
    state = start_grill("run-1", SEED, _deps([{"done": False, **_question()}]))

    assert state.pending is not None
    assert state.pending.recommendation.startswith("My recommendation:")


def test_a_question_without_a_recommendation_is_refused_rather_than_shown():
    """A blank box is the thing this replaces.

    A question with no proposal attached is exactly the form field the grill
    exists to remove, so it is rejected rather than rendered.
    """
    # Twice, because one unusable reply is now retried rather than fatal.
    deps = _deps(
        [
            {"done": False, **_question(recommendation="")},
            {"done": False, **_question(recommendation="")},
        ]
    )

    from app.features.prompt2blog.grill_v4 import GrillUnusableResponse

    with pytest.raises(GrillUnusableResponse):
        start_grill("run-1", SEED, deps)


def test_the_grill_asks_one_question_at_a_time_shaped_by_the_last():
    # G3. The second prompt has to contain the first answer, or the questions
    # are a fixed list wearing a conversation's clothes.
    deps = _deps(
        [
            {"done": False, **_question()},
            {"done": False, **_question(question_id="q2", ask="Who is reading it?")},
        ]
    )

    state = start_grill("run-1", SEED, deps)
    state = answer_grill(state, "yeah guide. but I want it to feel like a bit of a pitch", deps)

    assert len(state.turns) == 1
    assert "feel like a bit of a pitch" in deps.llm.prompts[1]
    assert state.pending is not None
    assert state.pending.ask == "Who is reading it?"


def test_the_answer_is_kept_exactly_as_it_was_typed():
    # First-hand material is excused from fact-checking by design, so a
    # paraphrase of it is an unverifiable claim nothing downstream can catch.
    typed = "I was there 4 days last year. mostly ate. the ceviche place in Surquillo market was better than any of the fancy ones"
    deps = _deps(
        [
            {"done": False, **_question()},
            {"done": False, **_question(question_id="q2")},
        ]
    )

    state = answer_grill(start_grill("run-1", SEED, deps), typed, deps)

    assert state.turns[0].answer == typed


def test_the_grill_pushes_back_when_an_answer_contradicts_the_seed():
    # G4. It does not just collect the answer; it makes the conflict resolve.
    deps = _deps(
        [
            {"done": False, **_question()},
            {
                "done": False,
                "question": _question(
                    question_id="q2",
                    pushback='Your line said "destination"; a food argument is one thing, not a place.',
                ),
            },
        ]
    )

    state = answer_grill(start_grill("run-1", SEED, deps), "food, mostly", deps)

    assert state.pending is not None
    assert "destination" in state.pending.pushback


def test_the_grill_stops_at_agreement_rather_than_at_a_count():
    # G5. A rich first answer might need two questions; someone contradicting
    # themselves gets eight.
    deps = _deps(
        [
            {"done": False, **_question()},
            _done(),
        ]
    )

    state = answer_grill(start_grill("run-1", SEED, deps), "guide, with a pitch", deps)

    assert state.status == "agreed"
    assert state.pending is None
    assert state.consensus.startswith("A first-timer's guide")


def test_claiming_to_be_done_without_saying_what_was_agreed_is_not_agreement():
    """Agreement the operator cannot read is not agreement.

    The played-back summary is the whole stop condition, so a `done` with no
    consensus asks again rather than inventing one.
    """
    deps = _deps(
        [
            {"done": False, **_question()},
            _done(consensus="", **_question(question_id="q2")),
        ]
    )

    state = answer_grill(start_grill("run-1", SEED, deps), "guide", deps)

    assert state.status == "asking"
    assert state.pending is not None


def test_location_is_extracted_rather_than_typed_into_a_box():
    deps = _deps([{"done": False, **_question(), "location": "Lima, Peru"}])

    assert start_grill("run-1", SEED, deps).location == "Lima, Peru"


def test_an_ambiguous_line_leaves_the_location_for_a_question():
    deps = _deps([{"done": False, **_question(), "location": ""}])

    assert start_grill("run-1", "a weekend in the valley", deps).location == ""


def test_an_agreed_grill_will_not_take_another_answer():
    deps = _deps(
        [
            {"done": False, **_question()},
            _done("Settled."),
        ]
    )
    state = answer_grill(start_grill("run-1", SEED, deps), "guide", deps)

    with pytest.raises(ValueError, match="not waiting for an answer"):
        answer_grill(state, "actually, wait", deps)


def test_reopening_keeps_what_was_learned_and_drops_the_agreement():
    """The single exit from every dead end.

    A refuted premise, a thin dossier, or a brief the operator no longer wants
    all come back here. Throwing away the transcript would make them start
    over; keeping the agreement would make reopening pointless.
    """
    deps = _deps(
        [
            {"done": False, **_question()},
            _done("Settled."),
            {"done": False, **_question(question_id="q3", ask="What changed?")},
        ]
    )
    agreed = answer_grill(start_grill("run-1", SEED, deps), "guide", deps)

    reopened = reopen_grill(agreed, deps)

    assert reopened.status == "asking"
    assert reopened.consensus == ""
    assert len(reopened.turns) == 1, "the transcript survived"
    assert "guide" in deps.llm.prompts[-1]


def test_an_empty_answer_is_refused():
    deps = _deps([{"done": False, **_question()}])
    state = start_grill("run-1", SEED, deps)

    with pytest.raises(ValueError, match="cannot be empty"):
        answer_grill(state, "   ", deps)


def test_the_stage_record_is_readable_on_its_own():
    """Stage rows upsert, and the grill repeats by design.

    Each turn rewrites the row, so the row has to carry the whole transcript
    rather than a delta -- per-turn tokens live in the ledger under this
    stage's attempts.
    """
    deps = _deps(
        [
            {"done": False, **_question()},
            {"done": False, **_question(question_id="q2")},
        ]
    )
    state = answer_grill(start_grill("run-1", SEED, deps), "guide, with a pitch", deps)

    record = grill_stage_record(state)

    assert record["turns_asked"] == 1
    assert record["transcript"][0]["answer"] == "guide, with a pitch"
    assert record["transcript"][0]["recommendation"].startswith("My recommendation:")
    assert record["research"]["grounded"] is True
    assert record["pending"]["ask"] == _question()["ask"]


def test_a_state_that_is_asking_must_have_something_to_ask():
    with pytest.raises(ValueError, match="must have a pending question"):
        GrillState(run_id="r", seed=SEED, status="asking", pending=None)


def test_an_agreed_state_must_carry_what_it_agreed():
    with pytest.raises(ValueError, match="must have played back"):
        GrillState(run_id="r", seed=SEED, status="agreed", consensus="")


def test_the_prompt_forbids_asking_for_credentials():
    # "What have you got" is a question about material. "Are you qualified" is
    # a question that turns writers away.
    prompt = build_next_turn_prompt(
        GrillState(
            run_id="r",
            seed=SEED,
            status="asking",
            pending=GrillQuestion(
                question_id="q1", topic="t", ask="a", recommendation="r"
            ),
        )
    )

    assert "never about credentials" in prompt.lower()
    assert "what they HAVE" in prompt


def test_the_recommendation_is_written_as_the_operator_not_about_them():
    """The recommendation is the operator's answer, not advice about it.

    Live run cac73671 (2026-08-30 16:42Z) came back with "I'm guessing you
    recently spent some time there and want to build the piece around your own
    firsthand experiences". That text is loaded straight into the answer box
    and sent with one click, so accepting it records the operator saying "I'm
    guessing you..." about their own trip -- and the brief may then quote it
    back as verbatim first-hand material, which is excused from fact-checking
    by design.
    """
    prompt = build_next_turn_prompt(
        GrillState(
            run_id="r",
            seed=SEED,
            status="asking",
            pending=GrillQuestion(
                question_id="q1", topic="t", ask="a", recommendation="r"
            ),
        )
    )
    flat = " ".join(prompt.split())

    assert "STATE THE ANSWER, NOT A SENTENCE ABOUT WHO HOLDS IT" in flat
    assert "I'm guessing you" in flat, "the failing shape has to be shown, not described"
    assert 'No "you", no "I"' in flat


def test_the_recommendation_may_not_invent_the_operator_s_life():
    """Writing their answer in first person was the first fix, and it was
    wrong in one specific way: for a question only they can answer, "write it
    as them" means inventing a trip they may never have taken.

    An invented experience they accept becomes first-hand material, and
    first-hand material is exempt from fact-checking by design -- so nothing
    downstream can catch it.
    """
    prompt = build_next_turn_prompt(
        GrillState(
            run_id="r",
            seed=SEED,
            status="asking",
            pending=GrillQuestion(
                question_id="q1", topic="t", ask="a", recommendation="r"
            ),
        )
    )
    flat = " ".join(prompt.split())

    assert "NEVER INVENT A FACT ABOUT THEIR LIFE" in flat
    assert "research-led case" in flat
    assert "Nothing first-hand" in flat


def test_the_recommendation_is_asked_for_real_judgment_not_a_hedge():
    prompt = build_next_turn_prompt(
        GrillState(
            run_id="r",
            seed=SEED,
            status="asking",
            pending=GrillQuestion(
                question_id="q1", topic="t", ask="a", recommendation="r"
            ),
        )
    )
    flat = " ".join(prompt.split())

    assert "MAKE IT YOUR REAL JUDGMENT" in flat
    assert "strongly enough to argue with" in flat


def test_the_prompt_refuses_two_questions_joined_by_and():
    """G3 is one question at a time, and the model was packing two.

    Every live grill so far asked double-barrelled questions -- "what angle
    AND who is it for" -- then declared agreement after two turns, so four
    things were asked and two were answered.
    """
    prompt = build_next_turn_prompt(
        GrillState(
            run_id="r",
            seed=SEED,
            status="asking",
            pending=GrillQuestion(
                question_id="q1", topic="t", ask="a", recommendation="r"
            ),
        )
    )
    flat = " ".join(prompt.split())

    assert "Ask about ONE thing" in flat
    assert 'joining two questions with "and", you are asking two' in flat


# --- the grill can see its own half now (ADR 0033) -------------------------


def test_the_replayed_conversation_carries_the_grill_s_own_draft():
    """It used to be handed the question and the answer, and nothing else.

    With its own draft missing from the replay it could not tell an answer the
    operator wrote from its own sentence coming back.
    """
    deps = _deps([{"done": False, **_question()}, {"done": False, **_question(question_id="q2")}])
    state = answer_grill(start_grill("run-1", SEED, deps), "guide, with a pitch", deps)

    replayed = deps.llm.prompts[-1]

    assert "You asked: Do you want a guide" in replayed
    assert "You drafted this answer for them: My recommendation:" in replayed
    assert "They wrote, in their own words: guide, with a pitch" in replayed
    assert state.pending is not None


def test_an_accepted_draft_is_shown_back_as_the_grill_s_own_words():
    """Run 1b441532 (2026-08-30 15:40Z) agreed after two turns on its own
    guesses, because an accepted draft was indistinguishable from an answer.
    """
    draft = _question()["recommendation"]
    deps = _deps([{"done": False, **_question()}, {"done": False, **_question(question_id="q2")}])

    # The screen pre-fills the box with the draft; one click sends it back.
    answer_grill(start_grill("run-1", SEED, deps), draft, deps)

    replayed = deps.llm.prompts[-1]

    assert "They sent your draft back untouched" in replayed
    assert "YOUR words, not theirs" in replayed
    assert "They wrote, in their own words" not in replayed


def test_whitespace_does_not_disguise_an_accepted_draft():
    draft = _question()["recommendation"]
    deps = _deps([{"done": False, **_question()}, {"done": False, **_question(question_id="q2")}])

    answer_grill(start_grill("run-1", SEED, deps), f"  {draft}\n", deps)

    assert "They sent your draft back untouched" in deps.llm.prompts[-1]


# --- the stop condition is the brief, not a feeling ------------------------


def test_agreement_needs_every_marker_not_just_a_summary():
    """Two turns and a confident summary is not a finished interview.

    The grill stops when the brief can be filled, so a `done` that leaves the
    brief short asks again instead.
    """
    deps = _deps(
        [
            {"done": False, **_question()},
            _done(markers_covered=["form", "reader"], **_question(question_id="q2")),
            _done(),
        ]
    )

    state = answer_grill(start_grill("run-1", SEED, deps), "guide", deps)
    assert state.status == "asking", "it is short four markers"

    settled = answer_grill(state, "for a first-timer on a layover", deps)
    assert settled.status == "agreed"


def test_the_grill_is_told_which_markers_are_still_missing():
    deps = _deps([{"done": False, **_question(), "markers_covered": ["form"]}])
    state = start_grill("run-1", SEED, deps)

    deps.llm.responses.append({"done": False, **_question(question_id="q2")})
    answer_grill(state, "a guide", deps)

    replayed = deps.llm.prompts[-1]
    assert "form: the kind of article — COVERED" in replayed
    assert "fails_if: what would make it a failure — still missing" in replayed


def test_marker_progress_is_visible_on_the_run():
    deps = _deps([{"done": False, **_question(), "markers_covered": ["form", "reader"]}])

    record = grill_stage_record(start_grill("run-1", SEED, deps))

    assert record["markers_covered"] == ["form", "reader"]
    assert "fails_if" in record["markers_missing"]


def test_an_invented_marker_does_not_count_and_does_not_break_anything():
    # Generous with shape, strict about the six that matter.
    deps = _deps([{"done": False, **_question(), "markers_covered": ["form", "vibe"]}])

    assert start_grill("run-1", SEED, deps).markers_covered == ["form"]


def test_the_grill_and_the_brief_ask_for_the_same_six_things():
    """A grill that stops one marker short of the brief is a run that dies at
    the handoff having already paid for the interview.
    """
    from app.features.prompt2blog.brief_v4 import REQUIRED_BRIEF_FIELDS
    from app.features.prompt2blog.contracts_v4 import BRIEF_MARKERS

    assert [field for _, field, _ in BRIEF_MARKERS] == [
        field for field, _ in REQUIRED_BRIEF_FIELDS
    ]


# --- the livelock run a9959013 hit (2026-08-30 19:29Z) ---------------------


def test_answering_a_marker_settles_it_even_when_the_grill_will_not_say_so():
    """Six turns, four of them the same question about failure.

    Every answer was an accepted draft, and the grill had been told an
    accepted draft is weak evidence -- so it refused to credit its own
    question, the checklist never shrank, and it asked again. Progress cannot
    be an opinion the grill is free to withhold.
    """
    deps = _deps(
        [
            {"done": False, **_question(asks_about="fails_if")},
            # It asks again and still claims nothing is covered.
            {"done": False, **_question(question_id="q2"), "markers_covered": []},
        ]
    )

    state = answer_grill(
        start_grill("run-1", SEED, deps),
        "It fails if it reads like a top 10 list.",
        deps,
    )

    assert "fails_if" in state.markers_covered


def test_accepting_a_draft_still_settles_the_marker():
    # Accepting is answering: they read it and put their name to it.
    draft = _question()["recommendation"]
    deps = _deps(
        [
            {"done": False, **_question(asks_about="reader")},
            {"done": False, **_question(question_id="q2"), "markers_covered": []},
        ]
    )

    state = answer_grill(start_grill("run-1", SEED, deps), draft, deps)

    assert "reader" in state.markers_covered


def test_a_question_still_pending_has_not_settled_anything():
    # Asked is not answered. Otherwise the grill could clear the whole
    # checklist by naming markers it never got a reply about.
    deps = _deps([{"done": False, **_question(asks_about="fails_if"), "markers_covered": []}])

    assert start_grill("run-1", SEED, deps).markers_covered == []


def test_an_invented_marker_on_a_question_is_not_carried():
    deps = _deps([{"done": False, **_question(asks_about="vibe"), "markers_covered": []}])

    assert start_grill("run-1", SEED, deps).pending.asks_about == ""


def test_the_prompt_forbids_asking_about_the_same_marker_twice():
    prompt = build_next_turn_prompt(
        GrillState(
            run_id="r",
            seed=SEED,
            status="asking",
            pending=GrillQuestion(
                question_id="q1", topic="t", ask="a", recommendation="r"
            ),
        )
    )
    flat = " ".join(prompt.split())

    assert "NEVER ask about a marker twice" in flat
    assert "Accepting your draft IS answering" in flat


# --- what the first real run hit ------------------------------------------


def test_a_reply_with_no_question_and_no_consensus_is_retried_once():
    """The first real run died here.

    The schema required only `done`, so `{"done": false}` with nothing else was
    schema-valid and useless -- and one unusable reply ended the run before it
    had started.
    """
    deps = _deps([{"done": False}, {"done": False, **_question()}])

    state = start_grill("run-1", SEED, deps)

    assert state.pending is not None
    assert len(deps.llm.prompts) == 2, "it should have asked again"


def test_two_unusable_replies_carry_what_came_back():
    """A failure with no evidence is the worst kind.

    The first one left no stage row and no log line, so the one moment that
    most needed explaining was the one with nothing to look at.
    """
    from app.features.prompt2blog.grill_v4 import GrillUnusableResponse

    deps = _deps([{"done": False}, _done(consensus="")])

    with pytest.raises(GrillUnusableResponse) as error:
        start_grill("run-1", SEED, deps)

    assert error.value.raw, "the raw reply has to travel with the failure"


def test_the_schema_demands_what_the_code_demands():
    # A schema that permits what the code refuses is a schema that was not
    # written down properly.
    from app.features.prompt2blog.grill_v4 import NEXT_TURN_SCHEMA

    assert set(NEXT_TURN_SCHEMA["required"]) == {
        "done",
        "ask",
        "recommendation",
        "consensus",
        "markers_covered",
        "asks_about",
    }


def test_the_prompt_says_to_return_both_and_leave_one_empty():
    prompt = build_next_turn_prompt(
        GrillState(
            run_id="r",
            seed=SEED,
            status="asking",
            pending=GrillQuestion(
                question_id="q1", topic="t", ask="a", recommendation="r"
            ),
        )
    )
    flat = " ".join(prompt.split())

    # The rule still holds; it just lives with the output shape rather than in
    # the list of rules about how to interview well.
    assert (
        "every reply carries `ask`, `recommendation`, `consensus`, `markers_covered` "
        "and `asks_about`" in flat
    )
    assert "leave `consensus` empty" in flat


def test_the_format_rule_is_not_mixed_into_the_interviewing_rules():
    """A formatting instruction in the list of rules about how to interview
    well taxes every question with bookkeeping.

    Adding "always return both fields, leave one empty" to that list visibly
    weakened the recommendations on the next live run: the model was juggling
    an empty-string chore alongside deciding what to ask.
    """
    prompt = build_next_turn_prompt(
        GrillState(
            run_id="r",
            seed=SEED,
            status="asking",
            pending=GrillQuestion(
                question_id="q1", topic="t", ask="a", recommendation="r"
            ),
        )
    )

    shape = prompt.index("Output shape")
    rules = prompt.index("Now the part that matters")
    assert shape < rules, "the mechanical part comes first and is done with"
    assert "ALWAYS return both" not in prompt


def test_the_grill_runs_on_its_own_named_model():
    """One line to change, and not the pipeline default.

    The grill decides what the article is and every later stage inherits that,
    across about six calls -- the cheapest place in the pipeline to spend on a
    better model.
    """
    from app.features.prompt2blog.config import (
        P2B_V4_GRILL_MODEL,
        P2B_V4_GRILL_TEMPERATURE,
    )
    from app.features.prompt2blog.pricing import VERTEX_TOKEN_RATES

    assert P2B_V4_GRILL_MODEL in VERTEX_TOKEN_RATES, "an unpriced model hides its cost"
    # Judgement, not extraction. A low temperature proposes the safe question
    # rather than the useful one.
    assert P2B_V4_GRILL_TEMPERATURE >= 0.5


def test_a_good_question_is_not_refused_for_its_shape():
    """This cost two live runs.

    The model returned `question` as the question string with `recommendation`
    beside it at the top level, while the schema wanted them nested. The words
    were right both times and were thrown away over punctuation.
    """
    as_the_model_sent_it = {
        "done": False,
        "question": "What will be the main focus of your article?",
        "recommendation": "A personal guide focusing on Lima's food culture.",
        "location": "Lima, Peru",
    }
    deps = _deps([as_the_model_sent_it])

    state = start_grill("run-1", SEED, deps)

    assert state.pending is not None
    assert state.pending.ask == "What will be the main focus of your article?"
    assert state.pending.recommendation.startswith("A personal guide")
    assert state.location == "Lima, Peru"


def test_the_nested_shape_still_works():
    # An earlier schema asked for this, and some models will keep producing it.
    deps = _deps(
        [
            {
                "done": False,
                "question": {
                    "question_id": "q1",
                    "topic": "focus",
                    "ask": "Guide, or the case?",
                    "recommendation": "A guide with a point of view.",
                },
            }
        ]
    )

    state = start_grill("run-1", SEED, deps)

    assert state.pending is not None
    assert state.pending.ask == "Guide, or the case?"


def test_the_schema_has_nothing_left_to_nest():
    # A flat object has no structure to get wrong.
    from app.features.prompt2blog.grill_v4 import NEXT_TURN_SCHEMA

    assert set(NEXT_TURN_SCHEMA["required"]) == {
        "done",
        "ask",
        "recommendation",
        "consensus",
        "markers_covered",
        "asks_about",
    }
    assert all(
        spec.get("type") in {"string", "boolean", "array"}
        for spec in NEXT_TURN_SCHEMA["properties"].values()
    )


# --- looking something up mid-interview (G2, after turn one) ---------------


class CountingResearch:
    """A research callable that remembers what it was asked."""

    def __init__(self, digest: str = "The Ayacucho tram runs through it.") -> None:
        self.queries: list[str] = []
        self.digest = digest

    def __call__(self, query: str):
        self.queries.append(query)
        return self.digest, ["https://example.co/tram"], 400


def _lookup(query: str) -> dict[str, Any]:
    """The move: say what you need to know and nothing else."""
    return {"done": False, "lookup": query, "ask": "", "recommendation": ""}


def _grill_with(responses, research=None):
    research = research or CountingResearch()
    deps = GrillDependencies(llm=FakeLLM(responses), research=research)
    return deps, research


def test_the_grill_can_look_something_up_part_way_through():
    """It used to research the seed once and then go blind.

    By the fourth turn the conversation may have narrowed to one neighbourhood
    while the grill is still working from the general city briefing. G2 is what
    keeps the grill short, so a grill that cannot look up where the
    conversation went is pushed back into asking -- the form-with-extra-steps
    failure the interview replaced.
    """
    deps, research = _grill_with(
        [_lookup("Buenos Aires neighbourhood Medellin"), {"done": False, **_question()}]
    )

    state = start_grill("run-1", SEED, deps)

    assert research.queries[1:] == ["Buenos Aires neighbourhood Medellin"]
    assert state.lookups == ["Buenos Aires neighbourhood Medellin"]
    # It asks its question with the answer in hand, not on the next turn.
    assert state.pending is not None
    assert state.status == "asking"


def test_what_it_looked_up_reaches_the_next_call_and_the_state():
    deps, _research = _grill_with(
        [_lookup("Ayacucho tram"), {"done": False, **_question()}]
    )

    state = start_grill("run-1", SEED, deps)

    assert "Looked up mid-interview: Ayacucho tram" in state.research_digest
    assert "The Ayacucho tram runs through it." in state.research_digest
    # The second call is the one that has to see it; the first is what asked.
    assert "The Ayacucho tram runs through it." in deps.llm.prompts[1]
    assert "https://example.co/tram" in state.research_source_urls


def _spends_the_budget() -> list[dict[str, Any]]:
    """Every lookup the budget allows, then one more asked for beside a
    question -- which is what a model does once the prompt tells it the
    budget is gone."""
    return [
        *[_lookup(f"thing {index}") for index in range(P2B_V4_GRILL_MAX_LOOKUPS)],
        {"done": False, "lookup": "one more please", **_question()},
    ]


def test_the_lookups_are_bounded():
    """The grill stops at agreement, not at a count, so it has no upper bound
    on turns by construction -- and would have none on searches either."""
    deps, research = _grill_with(_spends_the_budget())

    state = start_grill("run-1", SEED, deps)

    assert len(state.lookups) == P2B_V4_GRILL_MAX_LOOKUPS
    assert "one more please" not in state.lookups
    # The seed lookup, plus the budget. Not one more.
    assert len(research.queries) == P2B_V4_GRILL_MAX_LOOKUPS + 1
    # The refused lookup does not cost the turn: the question beside it is used.
    assert state.pending is not None


def test_the_prompt_says_how_many_lookups_are_left():
    """Otherwise the model asks for one it cannot have, every turn, forever."""
    deps, _research = _grill_with(_spends_the_budget())

    start_grill("run-1", SEED, deps)

    assert f"{P2B_V4_GRILL_MAX_LOOKUPS} more time(s)" in deps.llm.prompts[0]
    assert "budget is spent" in deps.llm.prompts[-1]


def test_a_retry_does_not_buy_the_lookups_again():
    """Found by the bounded test above, and it was a real overspend.

    `advance_grill` retries once on an unusable reply. It used to re-enter with
    the state it was given, so every lookup the first attempt had already paid
    for was bought again: six searches against a budget of three. The state now
    travels on the failure.
    """
    deps, research = _grill_with(
        [
            # First attempt: spends the budget, then returns something that is
            # neither a question nor a consensus.
            *[_lookup(f"thing {index}") for index in range(P2B_V4_GRILL_MAX_LOOKUPS)],
            {"done": False, "ask": "", "recommendation": ""},
            # Second attempt: asks again, and must be refused. The question
            # rides beside it, which is what the prompt now tells it to do.
            {"done": False, "lookup": "sneaking one in", **_question()},
        ]
    )

    state = start_grill("run-1", SEED, deps)

    assert len(state.lookups) == P2B_V4_GRILL_MAX_LOOKUPS
    assert "sneaking one in" not in state.lookups
    assert len(research.queries) == P2B_V4_GRILL_MAX_LOOKUPS + 1


def test_a_failed_lookup_still_costs_its_budget():
    """A free retry is a loop. The run has no question limit to stop it."""

    class Broken(CountingResearch):
        def __call__(self, query: str):
            self.queries.append(query)
            raise RuntimeError("no network")

    research = Broken()
    deps = GrillDependencies(
        llm=FakeLLM([_lookup("something"), {"done": False, **_question()}]),
        research=research,
    )

    state = start_grill("run-1", SEED, deps)

    assert state.lookups == ["something"]
    assert "Nothing came back for this." in state.research_digest
    assert state.pending is not None


def test_a_lookup_is_not_read_as_a_question():
    """The model is saying "I need to know this first", not answering."""
    deps, _research = _grill_with(
        [
            {**_lookup("something"), "ask": "junk", "recommendation": "junk"},
            {"done": False, **_question()},
        ]
    )

    state = start_grill("run-1", SEED, deps)

    assert state.pending is not None
    assert state.pending.ask != "junk"


def test_a_grill_that_is_done_does_not_look_anything_up_first():
    """Agreement is the end of the interview, not a reason to spend."""
    deps, research = _grill_with([{**_done(), "lookup": "one more thing"}])

    state = start_grill("run-1", SEED, deps)

    assert state.status == "agreed"
    assert state.lookups == []
    assert len(research.queries) == 1
