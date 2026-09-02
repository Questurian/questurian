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
from app.features.prompt2blog.contracts_v4 import MARKER_KEYS
from app.features.prompt2blog.intake_v4 import _stage_data
from app.features.prompt2blog.brief_v4 import BRIEF_STAGE
from app.features.prompt2blog.grill_v4 import GRILL_STAGE, GrillDependencies
from app.features.prompt2blog.intake_v4 import (
    IntakeServices,
    do_research,
    writing_request,
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
from app.features.prompt2blog.research_v4 import (
    RESEARCH_STAGE,
    ResearchDependencies,
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


AGREED = {
    "done": True,
    "consensus": "A guide for a Lima layover.",
    "location": "Lima, Peru",
    # Agreement needs the brief to be fillable, not just readable (ADR 0033).
    "markers_covered": list(MARKER_KEYS),
}

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


# --- research, and the hand-off to writing --------------------------------

EVIDENCE = {
    "sources": [
        {
            "source_id": "s1",
            "title": "Market price survey",
            "publisher": "Peru Retail",
            "url": "https://example.pe/prices",
            "retrieved_at": "2026-08-01",
            "source_type": "reporting",
            "material_type": "web",
            "notes": ["Stall ceviche is far below the tasting menus."],
        }
    ],
    "claims": [
        {
            "claim_id": "c1",
            "text": "Market ceviche is a fraction of the tasting-menu price.",
            "source_ids": ["s1"],
            "requirement_ids": ["r1"],
            "confidence": "high",
        },
        {
            "claim_id": "c2",
            "text": "The site is floodlit into the evening.",
            "source_ids": ["s1"],
            "requirement_ids": ["r3"],
            "confidence": "medium",
        },
        {
            "claim_id": "c3",
            "text": "Tasting menus run several times the stall price.",
            "source_ids": ["s1"],
            "requirement_ids": ["r2"],
            "confidence": "high",
        },
    ],
    "requirements": [
        {"requirement_id": "r1", "status": "supported", "claim_ids": ["c1"]},
        {"requirement_id": "r2", "status": "supported", "claim_ids": ["c3"]},
        {"requirement_id": "r3", "status": "supported", "claim_ids": ["c2"]},
    ],
}


class StructureLLM:
    def __init__(self, payload):
        self.payload = payload

    def invoke_json(self, **_kwargs):
        return self.payload, "{}"


def _with_research(services: IntakeServices, payload=None) -> IntakeServices:
    services.research = ResearchDependencies(
        gather=lambda _prompt, _model: ("Notes.", ["https://example.pe/a"], 800),
        structure_llm=StructureLLM(payload or EVIDENCE),
    )
    return services


def _to_work_order(services: IntakeServices) -> str:
    run_id = _to_agreement(services)
    approve_brief(run_id, services)
    plan_research(run_id, services)
    return run_id


def test_the_gathered_notes_are_kept_so_a_retry_does_not_re_buy_them(isolated_db):
    """Ten sequential web searches, then one structuring call.

    A structuring failure used to buy the searches again; run 90b3f9bc paid
    for them twice in one evening.
    """
    calls: list[str] = []
    services = _with_research(
        _services([{"done": False, "question": _question()}, AGREED, BRIEF_PAYLOAD, WORK_ORDER_PAYLOAD])
    )
    services.research.gather = lambda prompt, _model: (
        calls.append(prompt) or ("Notes.", ["https://example.pe/a"], 800)
    )
    run_id = _to_work_order(services)

    do_research(run_id, services)
    first = len(calls)
    assert first == 3, "one grounded pass per question"

    do_research(run_id, services)

    assert len(calls) == first, "the second pass reused the kept notes"


def test_recutting_the_plan_throws_the_kept_notes_away(isolated_db):
    """A re-cut plan asks different questions, and old notes are not answers
    to them."""
    calls: list[str] = []
    services = _with_research(
        _services([{"done": False, "question": _question()}, AGREED, BRIEF_PAYLOAD, WORK_ORDER_PAYLOAD])
    )
    services.research.gather = lambda prompt, _model: (
        calls.append(prompt) or ("Notes.", ["https://example.pe/a"], 800)
    )
    run_id = _to_work_order(services)
    do_research(run_id, services)

    apply_cut(run_id, services, struck_ids=["r3"])
    do_research(run_id, services)

    assert len(calls) > 3, "the cut plan was researched again"


def test_research_runs_and_says_whether_the_piece_can_be_written(isolated_db):
    services = _with_research(
        _services([{"done": False, "question": _question()}, AGREED, BRIEF_PAYLOAD, WORK_ORDER_PAYLOAD])
    )
    run_id = _to_work_order(services)

    verdict = do_research(run_id, services)

    assert verdict.can_write is True
    assert _stage_data(run_id, RESEARCH_STAGE)["coverage"]["can_write"] is True


def test_a_blocked_run_still_records_why(isolated_db):
    """A run that stopped should be able to say why without re-running anything."""
    thin = {
        **EVIDENCE,
        "claims": [EVIDENCE["claims"][0], EVIDENCE["claims"][2]],
        "requirements": [
            {"requirement_id": "r1", "status": "supported", "claim_ids": ["c1"]},
            {"requirement_id": "r2", "status": "supported", "claim_ids": ["c3"]},
            {"requirement_id": "r3", "status": "missing", "gap": "Not looked for."},
        ],
    }
    services = _with_research(
        _services([{"done": False, "question": _question()}, AGREED, BRIEF_PAYLOAD, WORK_ORDER_PAYLOAD]),
        thin,
    )
    run_id = _to_work_order(services)

    verdict = do_research(run_id, services)

    assert verdict.can_write is False
    assert verdict.reason == "nothing_worth_reading"
    assert _stage_data(run_id, RESEARCH_STAGE)["coverage"]["findings"]


def test_the_writing_request_is_assembled_from_what_intake_settled(isolated_db):
    services = _with_research(
        _services([{"done": False, "question": _question()}, AGREED, BRIEF_PAYLOAD, WORK_ORDER_PAYLOAD])
    )
    run_id = _to_work_order(services)
    do_research(run_id, services)

    request = writing_request(run_id)

    assert request.schema_version == 4
    assert request.brief.brief_fingerprint == request.work_order.brief_fingerprint
    assert (
        request.evidence_package.work_order_fingerprint
        == request.work_order.work_order_fingerprint
    )


def test_a_blocked_run_cannot_be_handed_to_the_writer(isolated_db):
    """The gate is decided once. This is the same decision enforced at the
    hand-off, not a second opinion."""
    thin = {
        **EVIDENCE,
        "claims": [EVIDENCE["claims"][0], EVIDENCE["claims"][2]],
        "requirements": [
            {"requirement_id": "r1", "status": "supported", "claim_ids": ["c1"]},
            {"requirement_id": "r2", "status": "supported", "claim_ids": ["c3"]},
            {"requirement_id": "r3", "status": "missing", "gap": "Not looked for."},
        ],
    }
    services = _with_research(
        _services([{"done": False, "question": _question()}, AGREED, BRIEF_PAYLOAD, WORK_ORDER_PAYLOAD]),
        thin,
    )
    run_id = _to_work_order(services)
    do_research(run_id, services)

    with pytest.raises(ValueError, match="cannot be written yet"):
        writing_request(run_id)


def test_recutting_the_plan_discards_the_research_that_answered_the_old_one(isolated_db):
    services = _with_research(
        _services([{"done": False, "question": _question()}, AGREED, BRIEF_PAYLOAD, WORK_ORDER_PAYLOAD])
    )
    run_id = _to_work_order(services)
    do_research(run_id, services)

    apply_cut(run_id, services, struck_ids=["r3"])

    # Research answered the questions that were there before the cut, so
    # leaving it would attach answers to a plan that no longer asks them.
    assert read_stage_result(run_id, RESEARCH_STAGE) is None


# --- an obligation research proved cannot be met ---------------------------
#
# Run b29d66b4 asked for the shortlist to be cross-checked against "Lima's
# municipal ranking of cevicherias". Research settled it: it does not exist.
# `must_name` still carried it, the article named it anyway, and
# `must_include_covered` scored true.


def _brief_with(*names: str) -> dict[str, Any]:
    return {**BRIEF_PAYLOAD, "must_name": list(names)}


def _run_with_brief(isolated, *names: str) -> tuple[str, IntakeServices]:
    services = _services(
        [{"done": False, "question": _question()}, AGREED, _brief_with(*names)]
    )
    run_id = _to_agreement(services)
    approve_brief(run_id, services)
    return run_id, services


def test_a_struck_must_name_leaves_the_brief(isolated_db):
    from app.features.prompt2blog.intake_v4 import _strike_must_name

    run_id, services = _run_with_brief(
        isolated_db, "Surquillo market", "the municipal ranking of cevicherias"
    )

    struck = _strike_must_name(
        run_id, services, ["the municipal ranking of cevicherias"]
    )

    assert struck.must_name == ["Surquillo market"]
    assert load_brief(run_id).must_name == ["Surquillo market"]


def test_striking_keeps_the_fingerprint_that_binds_the_work_order(isolated_db):
    """The fingerprint binds the work order and the evidence to the brief they
    were derived from. Re-deriving it on an operator edit would break both
    bindings; `omit_requirement` makes the same choice when it trims a work
    order."""
    from app.features.prompt2blog.intake_v4 import _strike_must_name

    run_id, services = _run_with_brief(
        isolated_db, "Surquillo market", "the municipal ranking of cevicherias"
    )
    before = load_brief(run_id).brief_fingerprint

    struck = _strike_must_name(
        run_id, services, ["the municipal ranking of cevicherias"]
    )

    assert struck.brief_fingerprint == before


def test_striking_a_name_that_is_not_there_is_refused(isolated_db):
    from app.features.prompt2blog.gate_v4 import GateAnswerRefused
    from app.features.prompt2blog.intake_v4 import _strike_must_name

    run_id, services = _run_with_brief(isolated_db, "Surquillo market")

    with pytest.raises(GateAnswerRefused, match="must-name"):
        _strike_must_name(run_id, services, ["something else entirely"])


def test_the_strike_is_recorded_on_the_run(isolated_db):
    from app.features.prompt2blog.intake_v4 import _strike_must_name

    run_id, services = _run_with_brief(
        isolated_db, "Surquillo market", "the municipal ranking of cevicherias"
    )

    _strike_must_name(run_id, services, ["the municipal ranking of cevicherias"])

    assert _stage_data(run_id, BRIEF_STAGE)["struck_must_name"] == [
        "the municipal ranking of cevicherias"
    ]


def test_the_brief_writer_is_told_one_name_per_entry(isolated_db):
    """b29d66b4's brief recorded three names in one string, so coverage was
    measured against a blob and one missing name could not be told from
    three."""
    from app.features.prompt2blog.brief_v4 import build_brief_prompt
    from app.features.prompt2blog.intake_v4 import _load_grill

    services = _services([{"done": False, "question": _question()}, AGREED])
    run_id = _to_agreement(services)

    prompt = build_brief_prompt(_load_grill(run_id))

    assert "one name per entry" in prompt
