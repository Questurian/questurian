"""One writing attempt, and the three ways a run can lose an article.

Two clicks must not buy two articles. A reload must not start a third. A retry
must not delete the draft the last attempt made. Those are the properties; the
writing itself is one call and is tested next door.

Driven against the real store, because every one of these failures is about
what survives being read back.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.features.claude_connection.cli_writer import (
    FAULT_QUOTA_EXHAUSTED,
    ClaudeCliWriterError,
)
from app.features.prompt2blog.contracts_v4 import MARKER_KEYS
from app.features.prompt2blog.generation_v5 import (
    GenerationAlreadyRunning,
    finished_draft,
    generation_state,
    latest_draft,
    run_attempt,
)
from app.features.prompt2blog.grill_v4 import GrillDependencies
from app.features.prompt2blog.intake_v4 import (
    IntakeServices,
    answer_intake,
    approve_brief,
    begin_intake,
    generate_prompt,
    intake_state,
    reopen_intake,
    start_generation,
)
from app.features.prompt2blog.generation_v5 import NothingToWriteFrom
from app.features.prompt2blog.run_recorder import RunRecorder
from app.features.prompt2blog.storage import get_all_completed_articles

SEED = "Lima is no longer simply the stopover before Machu Picchu"
FIRSTHAND = "I was there 4 days last year. mostly ate."

ARTICLE = """# Two nights in Lima

Body of the article.

## Research note

- https://example.pe
"""

AGREED = {
    "done": True,
    "consensus": "A guide for a Lima layover.",
    "location": "Lima, Peru",
    "markers_covered": list(MARKER_KEYS),
}

BRIEF_PAYLOAD = {
    "form_id": "destination-guide",
    "topic_module_ids": [],
    "primary_reader": "layover traveller",
    "reader_tags": [],
    "reader_question": "Is Lima worth two extra nights?",
    "outcome": "book two extra nights",
    "spine": "food, cheap beats famous",
    "must_name": ["Surquillo market"],
    "fails_if": "reads like a tourist board",
    "material": [{"kind": "firsthand", "quoted_answer": FIRSTHAND}],
}

OTHER_BRIEF = {**BRIEF_PAYLOAD, "spine": "markets, and why the famous list is stale"}


class ScriptedLLM:
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
        "recommendation": "My recommendation: a guide.",
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


def _intake(extra: list[dict[str, Any]] | None = None) -> IntakeServices:
    return _services(
        [{"done": False, "question": _question()}, AGREED, BRIEF_PAYLOAD] + (extra or [])
    )


def _to_prompt(services: IntakeServices) -> str:
    run_id = begin_intake(SEED, services).run_id
    answer_intake(run_id, FIRSTHAND, services)
    approve_brief(run_id, services)
    generate_prompt(run_id, services)
    return run_id


def _writer(text: str = ARTICLE, **overrides):
    calls: list[dict] = []

    def call(*, prompt: str, model_name: str | None = None):
        calls.append({"prompt": prompt, "model_name": model_name})
        return {
            "text": text,
            "modelName": "claude-opus-5-20260101",
            "effort": "high",
            "costUsd": 0.42,
            "usage": {"outputTokens": 3_100},
            "elapsedSeconds": 512.4,
            "turns": 14,
            "toolDenials": [],
            **overrides,
        }

    call.calls = calls  # type: ignore[attr-defined]
    return call


def _explodes(error: Exception):
    def call(**_kwargs):
        raise error

    return call


def _write(run_id: str, services: IntakeServices, writer) -> None:
    attempt_id, prompt = start_generation(run_id, services)
    run_attempt(run_id, attempt_id, prompt, writer, services.recorder)


# --- not buying the same article twice --------------------------------------


def test_a_second_click_is_refused_while_the_first_is_writing(isolated_db):
    """The claim is written before anything is spent, not after.

    An attempt that exists only in the background task's memory until it
    finishes cannot refuse anything, and the request it fails to refuse is a
    whole second article.
    """
    services = _intake()
    run_id = _to_prompt(services)

    start_generation(run_id, services)

    with pytest.raises(GenerationAlreadyRunning):
        start_generation(run_id, services)


def test_reading_the_state_starts_nothing(isolated_db):
    """The page polls this every few seconds while an article is written."""
    services = _intake()
    run_id = _to_prompt(services)
    writer = _writer()
    _write(run_id, services, writer)

    for _ in range(5):
        generation_state(run_id)
        intake_state(run_id)

    assert len(writer.calls) == 1


def test_writing_needs_a_prompt(isolated_db):
    services = _intake()
    run_id = begin_intake(SEED, services).run_id
    answer_intake(run_id, FIRSTHAND, services)
    approve_brief(run_id, services)

    with pytest.raises(NothingToWriteFrom, match="no prompt"):
        start_generation(run_id, services)


def test_going_back_to_the_grill_takes_the_prompt_with_it(isolated_db):
    """The prompt described the old brief, so it goes when the brief does."""
    services = _intake(
        [{"done": False, "question": _question(question_id="q2")}, AGREED, OTHER_BRIEF]
    )
    run_id = _to_prompt(services)

    reopen_intake(run_id, services)
    answer_intake(run_id, "markets, then", services)
    approve_brief(run_id, services)

    with pytest.raises(NothingToWriteFrom, match="no prompt"):
        start_generation(run_id, services)


def test_a_prompt_from_a_replaced_brief_is_refused_rather_than_used(isolated_db):
    """Re-approving the brief in place leaves the old prompt sitting there.

    It is a real assignment somebody read and approved. It is simply not the
    one this run agreed to any more, and writing from it would produce an
    article matching no brief on the run.
    """
    services = _intake([OTHER_BRIEF])
    run_id = _to_prompt(services)

    approve_brief(run_id, services)

    with pytest.raises(NothingToWriteFrom, match="brief changed"):
        start_generation(run_id, services)


# --- what a finished attempt leaves behind ----------------------------------


def test_the_article_is_saved_and_readable(isolated_db):
    services = _intake()
    run_id = _to_prompt(services)

    _write(run_id, services, _writer())
    draft = finished_draft(run_id)

    assert draft["headline"] == "Two nights in Lima"
    assert "Body of the article." in draft["article_markdown"]
    assert "https://example.pe" in draft["research_note"]


def test_the_note_is_not_saved_as_body_text(isolated_db):
    """Published as prose it would be a list of URLs and admissions."""
    services = _intake()
    run_id = _to_prompt(services)

    _write(run_id, services, _writer())

    assert "https://" not in finished_draft(run_id)["article_markdown"]


def test_the_raw_reply_is_preserved(isolated_db):
    """A parser that turns out to be wrong must not be the only copy."""
    services = _intake()
    run_id = _to_prompt(services)

    _write(run_id, services, _writer())

    assert finished_draft(run_id)["raw"].startswith("# Two nights in Lima")


def test_the_receipt_says_what_ran_and_what_it_cost(isolated_db):
    services = _intake()
    run_id = _to_prompt(services)

    _write(run_id, services, _writer())
    state = generation_state(run_id)

    assert state["state"] == "succeeded"
    assert state["requested_model"] == "claude-opus-5-high"
    assert state["served_model"] == "claude-opus-5-20260101"
    assert state["cost_usd"] == 0.42
    assert state["elapsed_seconds"] == 512.4
    # "One writer" is not "one billable call", and the receipt says so.
    assert state["turns"] == 14


def test_the_run_reports_generation_rather_than_a_graph_run(isolated_db):
    """A finished v5 run shares the "complete" status stage with a graph run.

    Without the guard it would satisfy the graph whitelist and be described as
    an article with no title and no word count -- which is what it looks like
    when read through a finalize row that does not exist.
    """
    services = _intake()
    run_id = _to_prompt(services)

    _write(run_id, services, _writer())
    state = intake_state(run_id)

    assert state["writing"] is None
    assert state["generation"]["state"] == "succeeded"
    assert state["generation"]["headline"] == "Two nights in Lima"


# --- failing without losing anything ----------------------------------------


def test_an_exhausted_account_is_named_as_such(isolated_db):
    """Not "something went wrong". A retry cannot succeed, and saying so is
    the difference between one wasted click and a run that keeps paying."""
    services = _intake()
    run_id = _to_prompt(services)

    _write(
        run_id,
        services,
        _explodes(ClaudeCliWriterError("out of allowance", kind=FAULT_QUOTA_EXHAUSTED)),
    )
    state = generation_state(run_id)

    assert state["state"] == "failed"
    assert state["failure"] == FAULT_QUOTA_EXHAUSTED
    assert "no allowance left" in state["message"]


def test_a_refusal_is_kept_where_it_can_be_read(isolated_db):
    """Claude answered and the answer was not an article. It was still paid for."""
    services = _intake()
    run_id = _to_prompt(services)

    _write(run_id, services, _writer(text="## Research note\n\n- only a note"))
    state = generation_state(run_id)

    assert state["failure"] == "unusable_response"
    assert "only a note" in state["raw"]


def test_a_refusal_never_becomes_the_article(isolated_db):
    services = _intake()
    run_id = _to_prompt(services)

    _write(run_id, services, _writer(text="## Research note\n\n- only a note"))

    with pytest.raises(LookupError):
        finished_draft(run_id)


def test_a_failed_retry_leaves_the_good_draft_alone(isolated_db):
    """The reason attempts accumulate instead of overwriting.

    The case where a retry is wanted is exactly the case where the previous
    draft is worth keeping to compare against.
    """
    services = _intake()
    run_id = _to_prompt(services)
    _write(run_id, services, _writer())

    _write(run_id, services, _explodes(ClaudeCliWriterError("down")))

    assert finished_draft(run_id)["headline"] == "Two nights in Lima"
    assert generation_state(run_id)["state"] == "failed"
    assert generation_state(run_id)["has_draft"] is True


def test_a_second_attempt_replaces_which_draft_is_current(isolated_db):
    services = _intake()
    run_id = _to_prompt(services)
    _write(run_id, services, _writer())

    _write(run_id, services, _writer(text="# A better headline\n\nBetter body.\n"))

    assert latest_draft(run_id)["headline"] == "A better headline"
    assert generation_state(run_id)["attempts"] == 2


def test_a_failure_frees_the_run_for_another_attempt(isolated_db):
    """A stuck claim after a crash would be unrecoverable without a database."""
    services = _intake()
    run_id = _to_prompt(services)
    _write(run_id, services, _explodes(ClaudeCliWriterError("down")))

    _write(run_id, services, _writer())

    assert finished_draft(run_id)["headline"] == "Two nights in Lima"


def test_the_article_reaches_the_saved_articles_list(isolated_db):
    """A generated article that cannot be staged is an article nobody can use.

    Saved Articles joins `runs` to `outputs`, so an attempt that only wrote its
    own stage row would leave the finished piece invisible to every screen
    except the one that produced it.
    """
    services = _intake()
    run_id = _to_prompt(services)

    _write(run_id, services, _writer())
    listed = [item for item in get_all_completed_articles() if item["run_id"] == run_id]

    assert len(listed) == 1
    assert listed[0]["title"] == "Two nights in Lima"
    assert listed[0]["article_type"] == "Destination Guide"


def test_the_research_note_is_not_staged_as_body_text(isolated_db):
    services = _intake()
    run_id = _to_prompt(services)

    _write(run_id, services, _writer())
    listed = next(
        item for item in get_all_completed_articles() if item["run_id"] == run_id
    )

    assert "https://example.pe" not in listed["markdown"]
    assert "Body of the article." in listed["markdown"]


def test_a_draft_carries_a_version_id(isolated_db):
    """The later editor applies changes against a version.

    A result returned for an older one has to be refusable rather than merged
    blind over somebody's newer edit.
    """
    services = _intake()
    run_id = _to_prompt(services)

    _write(run_id, services, _writer())

    assert finished_draft(run_id)["content_hash"].startswith("dv-")
