"""Approve a brief, get an assignment, and pay nothing for it.

The step ADR 0036 put where "Plan the research" used to be. Its properties are
that it costs nothing, that the exact text is kept on the run, and that it
cannot go on looking current after the brief it was built from has changed.

Driven against the real store like the rest of intake, because "it works inside
one request" is not the property that matters for a step whose whole job is to
survive being read back.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.features.prompt2blog.contracts_v4 import MARKER_KEYS
from app.features.prompt2blog.grill_v4 import GrillDependencies
from app.features.prompt2blog.intake_v4 import (
    IntakeServices,
    _stage_data,
    answer_intake,
    approve_brief,
    begin_intake,
    generate_prompt,
    intake_state,
    load_writer_prompt,
    reopen_intake,
)
from app.features.prompt2blog.run_recorder import RunRecorder
from app.features.prompt2blog.writer_prompt import PROMPT_STAGE

SEED = "Lima is no longer simply the stopover before Machu Picchu"
FIRSTHAND = "I was there 4 days last year. mostly ate."

AGREED = {
    "done": True,
    "consensus": "A guide for a Lima layover.",
    "location": "Lima, Peru",
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

OTHER_BRIEF_PAYLOAD = {**BRIEF_PAYLOAD, "spine": "markets, and why the famous list is stale"}


class ScriptedLLM:
    """Answers in the order intake asks, and counts what it was asked."""

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


def _services(responses: list[dict[str, Any]]) -> IntakeServices:
    return IntakeServices(
        dependencies=GrillDependencies(
            llm=ScriptedLLM(responses),
            research=lambda _seed: ("Lima has a food reputation.", ["https://x.pe"], 900),
        ),
        recorder=RunRecorder(),
    )


def _to_approved_brief(services: IntakeServices) -> str:
    run_id = begin_intake(SEED, services).run_id
    answer_intake(run_id, FIRSTHAND, services)
    approve_brief(run_id, services)
    return run_id


def test_generating_the_prompt_asks_no_model(isolated_db):
    """The one step here that spends nothing.

    Asserted by counting calls rather than by reading the code, because the
    cheap way to break this is for something downstream to start consulting a
    model to pick a length or a form label.
    """
    services = _services([{"done": False, "question": _question()}, AGREED, BRIEF_PAYLOAD])
    run_id = _to_approved_brief(services)
    before = len(services.dependencies.llm.prompts)

    generate_prompt(run_id, services)

    assert len(services.dependencies.llm.prompts) == before


def test_the_exact_text_is_kept_on_the_run(isolated_db):
    """Not a summary. A receipt that paraphrases cannot say what was asked for."""
    services = _services([{"done": False, "question": _question()}, AGREED, BRIEF_PAYLOAD])
    run_id = _to_approved_brief(services)

    prompt = generate_prompt(run_id, services)

    assert _stage_data(run_id, PROMPT_STAGE)["text"] == prompt.text
    assert load_writer_prompt(run_id).prompt_fingerprint == prompt.prompt_fingerprint


def test_the_brief_reaches_the_prompt_intact(isolated_db):
    services = _services([{"done": False, "question": _question()}, AGREED, BRIEF_PAYLOAD])
    run_id = _to_approved_brief(services)

    text = generate_prompt(run_id, services).text

    assert "Is Lima worth two extra nights?" in text
    assert "Surquillo market" in text
    assert FIRSTHAND in text
    # The readable form name, not the id the operator never chose by that name.
    assert "Destination Guide" in text or "Destination guide" in text


def test_labels_travel_without_their_rulebooks(isolated_db):
    """A topic module ships 100-250 words of instruction. Only its name goes."""
    services = _services([{"done": False, "question": _question()}, AGREED, BRIEF_PAYLOAD])
    run_id = _to_approved_brief(services)

    text = generate_prompt(run_id, services).text

    assert "Covers Food and drink" in text
    assert "Reader is a First-time visitor" in text
    # The module's own rule text stays in the data file where it lives.
    assert "Preferred sources" not in text
    assert "Aggregated reviews" not in text


def test_pressing_it_twice_is_not_two_assignments(isolated_db):
    services = _services([{"done": False, "question": _question()}, AGREED, BRIEF_PAYLOAD])
    run_id = _to_approved_brief(services)

    first = generate_prompt(run_id, services)
    second = generate_prompt(run_id, services)

    assert first.prompt_fingerprint == second.prompt_fingerprint
    assert first.text == second.text


def test_the_run_reports_the_prompt_step(isolated_db):
    services = _services([{"done": False, "question": _question()}, AGREED, BRIEF_PAYLOAD])
    run_id = _to_approved_brief(services)

    assert intake_state(run_id)["step"] == "brief"
    generate_prompt(run_id, services)
    state = intake_state(run_id)

    assert state["step"] == "prompt"
    assert state["writer_prompt"]["target_word_count"] > 0
    assert state["writer_prompt"]["text"]


def test_a_prompt_built_from_a_replaced_brief_stops_being_shown(isolated_db):
    """The failure this exists to stop: a stale assignment looking current.

    Going back into the grill discards the brief, so a prompt frozen from the
    old one describes an article nobody agreed to. It stays stored as history
    and stops counting as progress.
    """
    services = _services(
        [
            {"done": False, "question": _question()},
            AGREED,
            BRIEF_PAYLOAD,
            {"done": False, "question": _question(question_id="q2")},
            AGREED,
            OTHER_BRIEF_PAYLOAD,
        ]
    )
    run_id = _to_approved_brief(services)
    stale = generate_prompt(run_id, services)

    reopen_intake(run_id, services)
    answer_intake(run_id, "markets, then", services)
    approve_brief(run_id, services)
    state = intake_state(run_id)

    assert state["step"] == "brief"
    assert state["writer_prompt"] is None

    fresh = generate_prompt(run_id, services)
    assert fresh.prompt_fingerprint != stale.prompt_fingerprint
    assert intake_state(run_id)["step"] == "prompt"


def test_there_is_nothing_to_generate_before_a_brief(isolated_db):
    services = _services([{"done": False, "question": _question()}])
    run_id = begin_intake(SEED, services).run_id

    with pytest.raises(LookupError, match="No brief approved"):
        generate_prompt(run_id, services)


def test_a_run_with_no_prompt_says_so_rather_than_guessing(isolated_db):
    services = _services([{"done": False, "question": _question()}])
    run_id = begin_intake(SEED, services).run_id

    assert load_writer_prompt(run_id) is None
