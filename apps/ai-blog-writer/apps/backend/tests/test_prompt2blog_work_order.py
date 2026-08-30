"""The research plan, and the cut the operator gets to make.

v3 offered three direction cards, which is a menu after you have already
ordered. This replaces it with a decision that changes cost, focus and length:
the questions in plain English, strike two, add one.
"""

from __future__ import annotations

from typing import Any

import pytest
from pydantic import ValidationError

from app.features.prompt2blog.contracts_v4 import (
    ArticleBrief,
    BriefMaterial,
    BriefReader,
)
from app.features.prompt2blog.grill_v4 import GrillDependencies
from app.features.prompt2blog.work_order_v4 import (
    build_work_order,
    build_work_order_prompt,
    cut_work_order,
    work_order_stage_record,
)


class FakeLLM:
    def __init__(self, response: dict[str, Any]):
        self.response = response
        self.prompts: list[str] = []

    def invoke_json(self, *, prompt: str, **_kwargs) -> tuple[dict[str, Any], str]:
        self.prompts.append(prompt)
        return self.response, "{}"


def _brief(**overrides) -> ArticleBrief:
    payload: dict[str, Any] = dict(
        brief_fingerprint="bf-1",
        seed="Lima is no longer simply the stopover before Machu Picchu",
        location="Lima, Peru",
        form_id="destination-guide",
        topic_module_ids=["food-drink"],
        reader=BriefReader(primary_reader="layover traveller", tags=["first-time-visitor"]),
        reader_question="Is Lima worth two extra nights?",
        outcome="book two extra nights on a layover",
        spine="food, with a cheap-beats-famous argument",
        must_name=["Surquillo market"],
        material=[BriefMaterial(kind="firsthand", statement="mostly ate, four days")],
        fails_if="reads like a tourist board",
    )
    payload.update(overrides)
    return ArticleBrief(**payload)


def _payload(**overrides) -> dict[str, Any]:
    payload = {
        "primary_subject": "Lima",
        "scope_mode": "single_subject",
        "references": [{"name": "Lima", "role": "primary_subject"}],
        "premise": [
            {"assumption_id": "a1", "statement": "Market stall prices are published."}
        ],
        "requirements": [
            {
                "requirement_id": "r1",
                "question": "What do Surquillo market stalls charge for ceviche?",
                "kind": "load_bearing",
                "assumption_ids": ["a1"],
            },
            {
                "requirement_id": "r2",
                "question": "What do the tasting menus charge?",
                "kind": "load_bearing",
            },
            {
                "requirement_id": "r3",
                "question": "What is Huaca Pucllana like after dark?",
                "kind": "texture",
            },
        ],
    }
    payload.update(overrides)
    return payload


def _deps(payload: dict[str, Any]) -> GrillDependencies:
    return GrillDependencies(llm=FakeLLM(payload), research=lambda _s: ("", [], None))


def test_the_brief_becomes_separately_checkable_questions():
    work_order = build_work_order(_brief(), _deps(_payload()))

    assert work_order.primary_subject == "Lima"
    assert [item.requirement_id for item in work_order.requirements] == ["r1", "r2", "r3"]
    assert work_order.brief_fingerprint == "bf-1"


def test_requirements_declare_what_missing_them_costs():
    work_order = build_work_order(_brief(), _deps(_payload()))

    kinds = {item.requirement_id: item.kind for item in work_order.requirements}
    assert kinds == {"r1": "load_bearing", "r2": "load_bearing", "r3": "texture"}


def test_a_requirement_with_no_kind_is_dropped_rather_than_guessed():
    # Guessing would put a texture question on the blocking path, or a
    # load-bearing one off it. Both are worse than one fewer question.
    payload = _payload()
    payload["requirements"][1].pop("kind")

    work_order = build_work_order(_brief(), _deps(payload))

    assert [item.requirement_id for item in work_order.requirements] == ["r1", "r3"]


def test_the_prompt_asks_for_texture_rather_than_only_proof():
    """The Lima dossier was excellent as verification and contained nothing
    anyone would enjoy. All three questions existed to prove the premise, so
    all three answers proved it."""
    prompt = build_work_order_prompt(_brief())
    flat = " ".join(prompt.split())

    assert "Ask for texture" in flat
    assert "nothing a reader would enjoy is a real gap" in flat


def test_the_prompt_does_not_ask_for_what_the_writer_already_has():
    prompt = build_work_order_prompt(_brief())

    assert "mostly ate, four days" in prompt
    assert "Do not write a question whose answer the writer already has" in " ".join(
        prompt.split()
    )


def test_the_prompt_carries_the_spine_and_the_failure_line():
    prompt = build_work_order_prompt(_brief())

    assert "food, with a cheap-beats-famous argument" in prompt
    assert "reads like a tourist board" in prompt


def test_striking_a_texture_question_says_it_costs_a_detail():
    brief = _brief()
    work_order = build_work_order(brief, _deps(_payload()))

    outcome = cut_work_order(work_order, brief, struck_ids=["r3"])

    assert len(outcome.work_order.requirements) == 2
    assert len(outcome.warnings) == 1
    assert "a detail, not an argument" in outcome.warnings[0]


def test_striking_a_load_bearing_question_says_what_the_piece_can_no_longer_claim():
    """Said once, then obeyed.

    The operator should not have to already know which questions are
    load-bearing in order to cut safely, and the system does know.
    """
    brief = _brief()
    work_order = build_work_order(brief, _deps(_payload()))

    outcome = cut_work_order(work_order, brief, struck_ids=["r1"])

    assert [item.requirement_id for item in outcome.work_order.requirements] == ["r2", "r3"]
    assert "cannot claim" in outcome.warnings[0]
    assert brief.spine in outcome.warnings[0]


def test_the_cut_obeys_rather_than_refusing():
    # A decision that cannot be wrong is not a decision. This is the whole
    # reason the direction cards were replaced with something real.
    brief = _brief()
    work_order = build_work_order(brief, _deps(_payload()))

    outcome = cut_work_order(work_order, brief, struck_ids=["r1", "r3"])

    assert [item.requirement_id for item in outcome.work_order.requirements] == ["r2"]
    assert len(outcome.warnings) == 2


def test_a_cut_that_leaves_nothing_load_bearing_is_refused():
    """All texture is not an article, it is a mood."""
    brief = _brief()
    work_order = build_work_order(brief, _deps(_payload()))

    with pytest.raises(ValidationError, match="load-bearing"):
        cut_work_order(work_order, brief, struck_ids=["r1", "r2"])


def test_an_added_question_joins_the_plan_as_load_bearing():
    # Nobody adds a question to be decorative.
    brief = _brief()
    work_order = build_work_order(brief, _deps(_payload()))

    outcome = cut_work_order(
        work_order,
        brief,
        struck_ids=[],
        added_questions=["How late does the market actually stay open?"],
    )

    added = outcome.work_order.requirements[-1]
    assert added.kind == "load_bearing"
    assert added.question == "How late does the market actually stay open?"


def test_striking_something_that_is_not_there_is_an_error_not_a_silent_no_op():
    brief = _brief()
    work_order = build_work_order(brief, _deps(_payload()))

    with pytest.raises(ValueError, match="No such requirement"):
        cut_work_order(work_order, brief, struck_ids=["r9"])


def test_a_premise_nothing_rests_on_any_more_is_dropped():
    # Its only question is gone, so it is no longer an assumption this run
    # depends on -- and leaving it would fail the contract's dependency check.
    brief = _brief()
    work_order = build_work_order(brief, _deps(_payload()))

    outcome = cut_work_order(work_order, brief, struck_ids=["r1"])

    assert outcome.work_order.premise == []


def test_the_cut_changes_the_fingerprint():
    brief = _brief()
    work_order = build_work_order(brief, _deps(_payload()))

    outcome = cut_work_order(work_order, brief, struck_ids=["r3"])

    assert outcome.work_order.work_order_fingerprint != work_order.work_order_fingerprint
    assert outcome.work_order.brief_fingerprint == brief.brief_fingerprint


def test_the_stage_record_keeps_why_the_plan_is_the_size_it_is():
    brief = _brief()
    outcome = cut_work_order(
        build_work_order(brief, _deps(_payload())), brief, struck_ids=["r3"]
    )

    record = work_order_stage_record(outcome.work_order, outcome.warnings)

    assert record["load_bearing_count"] == 2
    assert record["texture_count"] == 0
    # A thin article later is often explained by a cut made here.
    assert record["cut_warnings"] == outcome.warnings
