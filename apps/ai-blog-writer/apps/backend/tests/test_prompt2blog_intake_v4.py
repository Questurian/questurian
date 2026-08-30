"""Intake end to end, against the real database.

A run begins at the seed, so everything the grill learns has to survive the
page being closed. These drive the four intake stages through storage rather
than in memory, because "it works within one request" is not the property that
matters here.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.core import read_stage_result
from app.features.prompt2blog.intake_v4 import _stage_data
from app.features.prompt2blog.brief_v4 import BRIEF_STAGE
from app.features.prompt2blog.grill_v4 import GRILL_STAGE, GrillDependencies
from app.features.prompt2blog.intake_v4 import (
    IntakeServices,
    answer_intake,
    apply_cut,
    approve_brief,
    begin_intake,
    intake_state,
    load_brief,
    load_work_order,
    plan_research,
    reopen_intake,
)
from app.features.prompt2blog.run_recorder import RunRecorder
from app.features.prompt2blog.work_order_v4 import WORK_ORDER_STAGE

SEED = "Lima is no longer simply the stopover before Machu Picchu"
FIRSTHAND = "I was there 4 days last year. mostly ate."


class ScriptedLLM:
    """Answers in the order the intake asks, so a whole flow can be driven."""

    def __init__(self, responses: list[dict[str, Any]]):
        self.responses = list(responses)
        self.prompts: list[str] = []

    def invoke_json(self, *, prompt: str, **_kwargs) -> tuple[dict[str, Any], str]:
        self.prompts.append(prompt)
        return self.responses.pop(0), "{}"


def _question(**overrides) -> dict[str, Any]:
    payload = {
        "question_id": "q1",
        "topic": "what this should do",
        "ask": "Guide, or make the case?",
        "recommendation": "My recommendation: a guide with a point of view.",
    }
    payload.update(overrides)
    return payload


AGREED = {"done": True, "consensus": "A guide for a Lima layover.", "location": "Lima, Peru"}

BRIEF_PAYLOAD = {
    "form_id": "destination-guide",
    "topic_module_ids": ["food-drink"],
    "primary_reader": "layover traveller",
    "reader_tags": ["first-time-visitor"],
    "reader_question": "Is Lima worth two extra nights?",
    "outcome": "book two extra nights",
    "spine": "food, cheap beats famous",
    "must_name": ["Surquillo market"],
    "fails_if": "reads like a tourist board",
    "material": [{"kind": "firsthand", "quoted_answer": FIRSTHAND}],
}

WORK_ORDER_PAYLOAD = {
    "primary_subject": "Lima",
    "scope_mode": "single_subject",
    "references": [{"name": "Lima", "role": "primary_subject"}],
    "premise": [],
    "requirements": [
        {"requirement_id": "r1", "question": "What do stalls charge?", "kind": "load_bearing"},
        {"requirement_id": "r2", "question": "What do tasting menus charge?", "kind": "load_bearing"},
        {"requirement_id": "r3", "question": "What is the site like at night?", "kind": "texture"},
    ],
}


def _services(responses: list[dict[str, Any]]) -> IntakeServices:
    return IntakeServices(
        dependencies=GrillDependencies(
            llm=ScriptedLLM(responses),
            research=lambda _seed: ("Lima has a food reputation.", ["https://x.pe"], 900),
        ),
        recorder=RunRecorder(),
    )


def _to_agreement(services: IntakeServices) -> str:
    state = begin_intake(SEED, services)
    answer_intake(state.run_id, FIRSTHAND, services)
    return state.run_id


def test_a_typed_line_becomes_a_run_and_a_first_question(isolated_db):
    services = _services([{"done": False, "question": _question()}])

    state = begin_intake(SEED, services)

    assert state.run_id
    assert state.pending is not None
    assert state.pending.recommendation.startswith("My recommendation:")


def test_an_empty_seed_is_refused(isolated_db):
    with pytest.raises(ValueError, match="Say what you want to write about"):
        begin_intake("   ", _services([]))


def test_the_grill_survives_the_page_being_closed(isolated_db):
    """Nothing is held between calls.

    The whole reason a run starts at the seed is that the browser is not where
    this lives -- an abandoned grill has to be resumable.
    """
    services = _services(
        [{"done": False, "question": _question()}, {"done": False, "question": _question(question_id="q2")}]
    )
    run_id = begin_intake(SEED, services).run_id

    # A second call reads everything back out of storage.
    resumed = answer_intake(run_id, "guide, with a pitch", services)

    assert len(resumed.turns) == 1
    assert resumed.turns[0].answer == "guide, with a pitch"


def test_every_turn_is_recorded_on_the_run(isolated_db):
    services = _services([{"done": False, "question": _question()}, AGREED])
    run_id = _to_agreement(services)

    row = _stage_data(run_id, GRILL_STAGE)

    assert row["status"] == "agreed"
    assert row["turns_asked"] == 1
    assert row["research"]["grounded"] is True


def test_the_brief_and_work_order_persist_and_bind(isolated_db):
    services = _services(
        [{"done": False, "question": _question()}, AGREED, BRIEF_PAYLOAD, WORK_ORDER_PAYLOAD]
    )
    run_id = _to_agreement(services)

    brief = approve_brief(run_id, services)
    work_order = plan_research(run_id, services)

    assert load_brief(run_id).brief_fingerprint == brief.brief_fingerprint
    assert load_work_order(run_id).work_order_fingerprint == work_order.work_order_fingerprint
    # The binding the v3 fingerprint could not express, because one id did both
    # jobs: this work order answers this brief.
    assert work_order.brief_fingerprint == brief.brief_fingerprint


def test_a_brief_cannot_be_read_before_it_exists(isolated_db):
    services = _services([{"done": False, "question": _question()}])
    run_id = begin_intake(SEED, services).run_id

    with pytest.raises(LookupError, match="No brief approved"):
        load_brief(run_id)


def test_the_cut_is_applied_and_kept(isolated_db):
    services = _services(
        [{"done": False, "question": _question()}, AGREED, BRIEF_PAYLOAD, WORK_ORDER_PAYLOAD]
    )
    run_id = _to_agreement(services)
    approve_brief(run_id, services)
    plan_research(run_id, services)

    outcome = apply_cut(run_id, services, struck_ids=["r3"])

    assert [item.requirement_id for item in load_work_order(run_id).requirements] == ["r1", "r2"]
    assert _stage_data(run_id, WORK_ORDER_STAGE)["cut_warnings"] == outcome.warnings


def test_reopening_the_grill_discards_what_depended_on_the_old_brief(isolated_db):
    """Research that answered the old spine is not research for the new one.

    Leaving the brief and the work order in place would let a changed vision
    inherit a plan built for the vision it replaced -- and it would look
    current, which is worse than being absent.
    """
    services = _services(
        [
            {"done": False, "question": _question()},
            AGREED,
            BRIEF_PAYLOAD,
            WORK_ORDER_PAYLOAD,
            {"done": False, "question": _question(question_id="q9", ask="What changed?")},
        ]
    )
    run_id = _to_agreement(services)
    approve_brief(run_id, services)
    plan_research(run_id, services)

    reopened = reopen_intake(run_id, services)

    assert reopened.status == "asking"
    assert read_stage_result(run_id, BRIEF_STAGE) is None
    assert read_stage_result(run_id, WORK_ORDER_STAGE) is None
    # What was learned survives; only what depended on the agreement is gone.
    assert len(reopened.turns) == 1


def test_the_state_endpoint_says_where_a_reloaded_page_stands(isolated_db):
    services = _services(
        [{"done": False, "question": _question()}, AGREED, BRIEF_PAYLOAD, WORK_ORDER_PAYLOAD]
    )
    run_id = _to_agreement(services)

    assert intake_state(run_id)["step"] == "grill"

    approve_brief(run_id, services)
    assert intake_state(run_id)["step"] == "brief"

    plan_research(run_id, services)
    state = intake_state(run_id)
    assert state["step"] == "work_order"
    assert state["work_order"]["load_bearing_count"] == 2
    # The stored state is machinery, not something a page should read.
    assert "state" not in state["work_order"]


def test_the_transcript_is_readable_from_the_state(isolated_db):
    services = _services([{"done": False, "question": _question()}, AGREED])
    run_id = _to_agreement(services)

    grill = intake_state(run_id)["grill"]

    assert grill["status"] == "agreed"
    assert grill["turns"][0]["answer"] == FIRSTHAND
    assert grill["consensus"] == "A guide for a Lima layover."
