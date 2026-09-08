"""One read of one draft, and what has to survive being read back.

Detection only, so the properties are about bookkeeping rather than about
edits: two clicks must not buy two reads, a failed read must not fail the run
that already has a good article on it, a read of a draft that has since been
rewritten must stop counting as current, and the operator's verdict on a
finding must never overwrite what the model said.

Driven against the real store, because every one of those is about what is
still true after a reload.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.core import read_status
from app.features.claude_connection.cli_writer import (
    FAULT_QUOTA_EXHAUSTED,
    ClaudeCliWriterError,
)
from app.features.prompt2blog.contracts_v4 import MARKER_KEYS
from app.features.prompt2blog.generation_v5 import run_attempt
from app.features.prompt2blog.grill_v4 import GrillDependencies
from app.features.prompt2blog.intake_v4 import (
    IntakeServices,
    answer_intake,
    approve_brief,
    begin_intake,
    generate_prompt,
    intake_state,
    start_generation,
    start_review,
)
from app.features.prompt2blog.review_v5 import (
    NothingToReview,
    ReviewAlreadyRunning,
    UnknownFinding,
    UnknownVerdict,
    finished_review,
    latest_review,
    mark_finding,
    review_state,
    run_review,
)
from app.features.prompt2blog.run_recorder import RunRecorder

SEED = "Lima is no longer simply the stopover before Machu Picchu"
FIRSTHAND = "I was there 4 days last year. mostly ate."

ARTICLE = """# Two nights in Lima

Body of the article.

## Research note

- https://example.pe
"""

REWRITTEN = ARTICLE.replace("Body of the article.", "A different body entirely.")

REVIEW = """### FINDING
LABEL: Asserts a fare it hedged
SEVERITY: serious
QUOTE: Body of the article.
PROBLEM: It says the fare is settled two paragraphs after saying it is not.
The reader cannot tell which sentence to believe.

### FINDING
LABEL: Narrates its own sourcing
SEVERITY: notable
QUOTE: WHOLE ARTICLE
PROBLEM: It reports what it could and could not confirm. That is the writer
talking to the editor, not to the reader.

### VERDICT
Solid on the food, shaky on the fares. The faults are local, not structural.
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


class ScriptedLLM:
    def __init__(self, responses: list[dict[str, Any]]):
        self.responses = list(responses)

    def invoke_json(self, *, prompt: str, **_kwargs) -> tuple[dict[str, Any], str]:
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


def _services() -> IntakeServices:
    return IntakeServices(
        dependencies=GrillDependencies(
            llm=ScriptedLLM(
                [{"done": False, "question": _question()}, AGREED, BRIEF_PAYLOAD]
            ),
            research=lambda _seed: ("Lima has a food reputation.", ["https://x.pe"], 900),
        ),
        recorder=RunRecorder(),
    )


def _replier(text: str, **overrides):
    calls: list[dict] = []

    def call(*, prompt: str, model_name: str | None = None):
        calls.append({"prompt": prompt, "model_name": model_name})
        return {
            "text": text,
            "modelName": "claude-opus-5-20260101",
            "effort": "high",
            "costUsd": 0.66,
            "usage": {"outputTokens": 2_100},
            "elapsedSeconds": 190.0,
            "turns": 8,
            "toolDenials": [],
            **overrides,
        }

    call.calls = calls  # type: ignore[attr-defined]
    return call


def _status(run_id: str) -> tuple[str, str]:
    """The run's own state and stage, which a read must leave alone."""
    row = read_status(run_id)
    return row["state"], row["stage"]


def _explodes(error: Exception):
    def call(**_kwargs):
        raise error

    return call


def _written(article: str = ARTICLE) -> tuple[str, IntakeServices]:
    """A run with one finished article on it, ready to be read."""
    services = _services()
    run_id = begin_intake(SEED, services).run_id
    answer_intake(run_id, FIRSTHAND, services)
    approve_brief(run_id, services)
    generate_prompt(run_id, services)
    attempt_id, prompt = start_generation(run_id, services)
    run_attempt(run_id, attempt_id, prompt, _replier(article), services.recorder)
    return run_id, services


def _read(run_id: str, services: IntakeServices, writer) -> None:
    review_id, brief, draft = start_review(run_id, services)
    run_review(
        run_id,
        review_id,
        brief,
        draft["article_markdown"],
        draft["research_note"],
        draft["content_hash"],
        writer,
        services.recorder,
    )


# --- not buying the same read twice -----------------------------------------


def test_a_second_click_is_refused_while_the_first_is_reading(isolated_db):
    """The claim is written before anything is spent, not after."""
    run_id, services = _written()

    start_review(run_id, services)

    with pytest.raises(ReviewAlreadyRunning):
        start_review(run_id, services)


def test_there_is_nothing_to_read_before_an_article_exists(isolated_db):
    services = _services()
    run_id = begin_intake(SEED, services).run_id
    answer_intake(run_id, FIRSTHAND, services)
    approve_brief(run_id, services)

    with pytest.raises(NothingToReview):
        start_review(run_id, services)


def test_reading_the_state_starts_nothing(isolated_db):
    """The page polls this every few seconds while a draft is being read."""
    run_id, services = _written()
    writer = _replier(REVIEW)
    _read(run_id, services, writer)

    for _ in range(5):
        review_state(run_id, None)
        intake_state(run_id)

    assert len(writer.calls) == 1


# --- what one read produces --------------------------------------------------


def test_the_findings_come_back_worst_first(isolated_db):
    run_id, services = _written()
    _read(run_id, services, _replier(REVIEW))

    findings = finished_review(run_id)["findings"]
    assert [item["severity"] for item in findings] == ["serious", "notable"]
    assert findings[0]["label"] == "Asserts a fare it hedged"
    assert findings[1]["whole_article"] is True


def test_the_read_is_filed_against_the_draft_it_read(isolated_db):
    """Which article this is about, so a later rewrite can be noticed."""
    run_id, services = _written()
    _read(run_id, services, _replier(REVIEW))

    draft_version = intake_state(run_id)["review"]["reviewed_draft_version"]
    assert draft_version.startswith("dv-")
    assert finished_review(run_id)["draft_version"] == draft_version


def test_a_clean_read_is_a_result_and_not_a_failure(isolated_db):
    """An editor that believes it must find something always will."""
    run_id, services = _written()
    _read(
        run_id,
        services,
        _replier("### VERDICT\nNothing wrong with this one."),
    )

    state = intake_state(run_id)["review"]
    assert state["state"] == "succeeded"
    assert state["has_review"] is True
    assert state["finding_count"] == 0


# --- a read is not the run ---------------------------------------------------


def test_a_failed_read_does_not_fail_the_run(isolated_db):
    """The article is untouched and still staged. What failed is a look at it."""
    run_id, services = _written()
    before = _status(run_id)

    _read(
        run_id,
        services,
        _explodes(ClaudeCliWriterError("no allowance left", kind=FAULT_QUOTA_EXHAUSTED)),
    )

    assert _status(run_id) == before
    state = intake_state(run_id)["review"]
    assert state["state"] == "failed"
    assert state["failure"] == "quota_exhausted"
    assert "no allowance left" in (state["message"] or "") or "allowance" in state["message"]


def test_a_finished_read_leaves_the_run_as_it_found_it(isolated_db):
    run_id, services = _written()
    before = _status(run_id)

    _read(run_id, services, _replier(REVIEW))

    assert _status(run_id) == before


def test_a_refusal_is_kept_where_a_person_can_read_it(isolated_db):
    """The words were paid for."""
    run_id, services = _written()

    _read(run_id, services, _replier("I will not review this."))

    state = intake_state(run_id)["review"]
    assert state["state"] == "failed"
    assert state["failure"] == "unusable_response"
    assert "I will not review this." in (state["raw"] or "")


def test_a_failed_read_keeps_the_last_good_one(isolated_db):
    """A retry that dies must not take the findings with it."""
    run_id, services = _written()
    _read(run_id, services, _replier(REVIEW))

    _read(run_id, services, _explodes(RuntimeError("boom")))

    state = intake_state(run_id)["review"]
    assert state["state"] == "failed"
    assert state["has_review"] is True
    assert state["finding_count"] == 2
    assert len(finished_review(run_id)["findings"]) == 2


# --- a read of an article that has since been rewritten ----------------------


def test_a_read_of_a_replaced_draft_reports_itself_stale(isolated_db):
    """Not wrong -- simply not about what is on screen.

    Its quotes point at paragraphs that no longer exist, so showing it as
    current would hang findings on text nobody can find.
    """
    run_id, services = _written()
    _read(run_id, services, _replier(REVIEW))
    assert intake_state(run_id)["review"]["stale"] is False

    attempt_id, prompt = start_generation(run_id, services)
    run_attempt(run_id, attempt_id, prompt, _replier(REWRITTEN), services.recorder)

    state = intake_state(run_id)["review"]
    assert state["stale"] is True
    # Kept, not deleted. It is the honest record of a read somebody paid for.
    assert state["has_review"] is True
    assert state["finding_count"] == 2


# --- the operator's verdict --------------------------------------------------


def test_a_verdict_sits_beside_the_finding_and_never_over_it(isolated_db):
    run_id, services = _written()
    _read(run_id, services, _replier(REVIEW))
    review_id = latest_review(run_id)["review_id"]

    mark_finding(run_id, review_id, "f2", "not_a_fault", services.recorder)

    findings = {item["finding_id"]: item for item in finished_review(run_id)["findings"]}
    assert findings["f2"]["verdict"] == "not_a_fault"
    assert findings["f2"]["problem"].startswith("It reports what it could")
    assert findings["f2"]["label"] == "Narrates its own sourcing"
    assert "verdict" not in findings["f1"]


def test_a_verdict_can_be_taken_back(isolated_db):
    """Undecided is the absence of an answer, not a third opinion."""
    run_id, services = _written()
    _read(run_id, services, _replier(REVIEW))
    review_id = latest_review(run_id)["review_id"]

    mark_finding(run_id, review_id, "f1", "agreed", services.recorder)
    mark_finding(run_id, review_id, "f1", None, services.recorder)

    findings = {item["finding_id"]: item for item in finished_review(run_id)["findings"]}
    assert "verdict" not in findings["f1"]


def test_an_unrecognised_verdict_writes_nothing(isolated_db):
    run_id, services = _written()
    _read(run_id, services, _replier(REVIEW))
    review_id = latest_review(run_id)["review_id"]

    with pytest.raises(UnknownVerdict):
        mark_finding(run_id, review_id, "f1", "sort of", services.recorder)

    findings = finished_review(run_id)["findings"]
    assert all("verdict" not in item for item in findings)


def test_marking_a_finding_that_is_not_there_writes_nothing(isolated_db):
    run_id, services = _written()
    _read(run_id, services, _replier(REVIEW))
    review_id = latest_review(run_id)["review_id"]

    with pytest.raises(UnknownFinding):
        mark_finding(run_id, review_id, "f99", "agreed", services.recorder)


# --- what the receipt says ---------------------------------------------------


def test_the_read_reports_what_it_cost_and_what_answered(isolated_db):
    run_id, services = _written()
    _read(run_id, services, _replier(REVIEW))

    state = intake_state(run_id)["review"]
    assert state["served_model"] == "claude-opus-5-20260101"
    assert state["cost_usd"] == 0.66
    assert state["turns"] == 8
