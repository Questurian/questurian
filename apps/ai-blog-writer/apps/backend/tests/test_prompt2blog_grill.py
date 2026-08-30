"""The five rules the grill exists to keep.

The audited Lima run passed every measure v3 owned and was unreadable, because
nothing in the flow ever asked what the article was for. These pin the
questions the grill must ask, and the ones it must not.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.features.prompt2blog.contracts_v4 import GrillQuestion, GrillState
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
            {"done": True, "consensus": "A first-timer's guide for someone with a Lima layover."},
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
            {"done": True, "consensus": "", **_question(question_id="q2")},
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
            {"done": True, "consensus": "Settled."},
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
            {"done": True, "consensus": "Settled."},
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

    deps = _deps([{"done": False}, {"done": True, "consensus": ""}])

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
    assert "every reply carries `ask`, `recommendation` and `consensus`" in flat
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

    assert set(NEXT_TURN_SCHEMA["required"]) == {"done", "ask", "recommendation", "consensus"}
    assert all(
        spec.get("type") in {"string", "boolean"}
        for spec in NEXT_TURN_SCHEMA["properties"].values()
    )
