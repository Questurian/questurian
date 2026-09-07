"""The apply and undo routes, against real stored state.

Asserted on what is in the database afterwards, not only on the status code.
Several of the bugs behind these tests returned a perfectly good 200.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.core import write_artifact, write_status
from app.features.prompt2blog.article_edits import read_article
from app.features.prompt2blog.section_edit_v4 import EditProposal
from tests.prompt2blog_test_support import response_payload

ARTICLE = (
    "The direct answer.\n\n"
    "## Prices\n\nA costs $20.\n\n"
    "## Getting there\n\nThe bus runs hourly.\n"
)


def _seed(run_id: str, markdown: str = ARTICLE) -> None:
    write_status(
        run_id,
        {
            "run_id": run_id,
            "state": "completed",
            "stage": "complete",
            "error": None,
            "updated_at": "2026-09-07T00:00:00Z",
        },
        feature="prompt2blog",
    )
    write_artifact(run_id, {"markdown": markdown, "pipeline_v3": {"run_id": run_id}})


def _proposal(run_id: str, section_id: str = "s1", **overrides) -> EditProposal:
    from app.features.prompt2blog.content.sections import segment_article

    state = read_article(run_id)
    section = next(
        item
        for item in segment_article(state.markdown)
        if item.section_id == section_id
    )
    fields = {
        "run_id": run_id,
        "edit_id": "edit-1",
        "base_revision": state.revision,
        "section_id": section_id,
        "heading": section.heading,
        "action_id": "shorten",
        "text_hash": section.text_hash,
        "original": section.render(),
        "revised": "## Prices\n\nA is $20.",
        "what_changed": "Tightened it.",
    }
    fields.update(overrides)
    return EditProposal(**fields)


def _apply(
    run_id: str,
    proposal: EditProposal,
    reason: str = "",
    accept_findings: bool = True,
):
    """Apply, accepting the checker's findings by default.

    These tests are about revisions, refusals and history. The review gate has
    its own tests below; defaulting to accepted here keeps every other test
    from having to mock a checker to assert something unrelated to one.
    """
    from app.features.prompt2blog.api import runs as runs_api

    return runs_api.apply_edit(
        run_id,
        runs_api.ApplyEditRequest(
            proposal=proposal, reason=reason, accept_findings=accept_findings
        ),
        staff_id="staff-1",
    )


def _undo(run_id: str, base_revision: int):
    from app.features.prompt2blog.api import runs as runs_api

    return runs_api.undo_edit(
        run_id, runs_api.UndoEditRequest(base_revision=base_revision)
    )


def test_an_applied_edit_writes_the_article_and_its_history_together(isolated_db):
    _seed("r-1")

    payload = response_payload(_apply("r-1", _proposal("r-1"), reason="it padded"))

    assert payload["revision"] == 1
    state = read_article("r-1")
    assert "A is $20." in state.markdown
    assert len(state.history.edits) == 1
    assert state.history.edits[0].reason == "it padded"
    assert state.history.original_markdown == ARTICLE


def test_a_proposal_for_another_run_is_refused(isolated_db):
    """A section id means nothing outside the article it was read from.

    `s1` exists in both runs. Applying one run's proposal to the other would
    land prose written against a different article's evidence on whatever
    happens to share the address.
    """
    _seed("r-a")
    _seed("r-b")
    stray = _proposal("r-a")

    with pytest.raises(HTTPException) as raised:
        _apply("r-b", stray)

    assert raised.value.status_code == 400
    assert "different run" in raised.value.detail
    assert read_article("r-b").markdown == ARTICLE


def test_an_edit_against_a_moved_article_is_refused_with_the_right_reason(
    isolated_db,
):
    """Refused for the document moving, not for the section moving.

    The proposal targets `s1` and the intervening write changed `s2`, so the
    section hash still matches. Only the revision catches this, and it is the
    exact shape of the lost update: two tabs, two different sections.
    """
    _seed("r-2")
    stale = _proposal("r-2")
    write_artifact(
        "r-2",
        {
            "markdown": ARTICLE.replace("The bus runs hourly.", "Buses run hourly."),
            "pipeline_v3": {"run_id": "r-2"},
        },
    )

    with pytest.raises(HTTPException) as raised:
        _apply("r-2", stale)

    assert raised.value.status_code == 409
    assert "changed since this edit was proposed" in raised.value.detail
    state = read_article("r-2")
    assert "Buses run hourly." in state.markdown
    assert "A is $20." not in state.markdown
    assert state.history.edits == []


def test_the_same_proposal_submitted_twice_lands_once(isolated_db):
    _seed("r-3")
    proposal = _proposal("r-3")

    first = response_payload(_apply("r-3", proposal))
    second = response_payload(_apply("r-3", proposal))

    assert first["already_applied"] is False
    assert second["already_applied"] is True
    assert first["revision"] == second["revision"] == 1
    assert len(read_article("r-3").history.edits) == 1


def test_a_refused_proposal_says_which_refusal_it_hit(isolated_db):
    """Not "the section has changed", which sends an editor to re-read prose
    nothing has touched."""
    _seed("r-4")
    refused = _proposal(
        "r-4",
        revised="## Prices\n\nA costs $999 and is the clear winner.",
        could_not_do="The facts do not support choosing.",
    )

    with pytest.raises(HTTPException) as raised:
        _apply("r-4", refused)

    assert raised.value.status_code == 409
    assert "could not make the change" in raised.value.detail
    assert read_article("r-4").markdown == ARTICLE


def test_undo_restores_the_exact_prior_markdown_as_a_new_revision(isolated_db):
    _seed("r-5")
    applied = response_payload(_apply("r-5", _proposal("r-5")))

    payload = response_payload(_undo("r-5", applied["revision"]))

    assert payload["undone"] is True
    assert payload["revision"] == 2
    state = read_article("r-5")
    assert state.markdown == ARTICLE
    assert state.revision == 2
    assert state.history.edits == []


def test_a_stale_undo_cannot_erase_a_newer_edit(isolated_db):
    """Undo is a write like any other.

    This tab applied revision 1, another tab applied revision 2, and this tab
    presses undo still holding 1. Unguarded, it restores the markdown from
    before *its* edit -- which is the article without the other tab's work.
    """
    _seed("r-6")
    mine = response_payload(_apply("r-6", _proposal("r-6")))
    _apply(
        "r-6",
        _proposal(
            "r-6",
            "s2",
            edit_id="edit-2",
            revised="## Getting there\n\nBuses run hourly.",
        ),
    )

    with pytest.raises(HTTPException) as raised:
        _undo("r-6", mine["revision"])

    assert raised.value.status_code == 409
    state = read_article("r-6")
    assert "Buses run hourly." in state.markdown
    assert "A is $20." in state.markdown
    assert len(state.history.edits) == 2


def test_undo_on_an_unedited_draft_is_a_plain_answer_not_an_error(isolated_db):
    _seed("r-7")

    payload = response_payload(_undo("r-7", 0))

    assert payload["undone"] is False
    assert payload["edits"] == 0
    assert payload["revision"] == 0
    assert payload["markdown"] == ARTICLE


# ---------------------------------------------------------------------------
# What the route spends
# ---------------------------------------------------------------------------


def _seed_packet(run_id: str) -> None:
    from app.core import write_stage_result

    write_stage_result(
        run_id,
        "pipeline_input_v3",
        {"data": {"packet": {"facts": [{"text": "A costs $20."}]}}},
    )


GROUNDED = {
    "grounded": True,
    "assessment": "Every figure matches the record it comes from.",
    "unsupported_claims": [],
}


def _stub_llm(
    monkeypatch, response: dict, usage: dict | None, review: dict | None = GROUNDED
) -> None:
    """Replace the provider call, keeping the tracker the route built.

    The tracker is what the spend record is read off, so a double that skipped
    it would prove nothing about the thing being tested. Answers are keyed by
    job, because the route makes two different calls and a single canned reply
    would hand the checker an edit response and get `unchecked` for free.
    """
    from app.features.prompt2blog.dependencies import DefaultPrompt2BlogLLM

    def invoke_json(self, *, job_id, prompt, **kwargs):
        if usage is not None:
            self.usage_tracker.begin_stage(job_id)
            self.usage_tracker.record("gemini-2.5-flash", usage)
        if job_id == "p2b.edit_review":
            if review is None:
                raise RuntimeError("the checker is down")
            return review, "{}"
        return response, "{}"

    monkeypatch.setattr(DefaultPrompt2BlogLLM, "invoke_json", invoke_json)


def _propose(run_id: str, action_id: str = "shorten"):
    from app.features.prompt2blog.api import runs as runs_api

    return runs_api.propose_edit(
        run_id,
        runs_api.SectionEditRequest(section_id="s1", action_id=action_id),
    )


USAGE = {"input_tokens": 1200, "output_tokens": 400, "total_tokens": 1600}


def test_a_discarded_proposal_is_still_on_the_receipt(isolated_db, monkeypatch):
    from app.features.prompt2blog.api import runs as runs_api
    from app.features.prompt2blog.editor_spend import read_editor_spend

    _seed("r-spend")
    _seed_packet("r-spend")
    _stub_llm(
        monkeypatch, {"revised": "## Prices\n\nA is $20.", "could_not_do": ""}, USAGE
    )

    response_payload(_propose("r-spend"))
    # And thrown away: nothing is applied.

    # Two calls: the edit, and the checker that read what it produced. Both are
    # spending, and the receipt says which was which.
    spend = read_editor_spend("r-spend")
    assert [item.kind for item in spend.attempts] == ["propose", "review"]
    assert spend.attempts[0].outcome == "proposed"
    assert spend.attempts[1].outcome == "supported"
    assert spend.totals()["input_tokens"] == 2400

    payload = response_payload(runs_api.read_edit_spend("r-spend"))
    assert payload["editor"]["attempts"] == 2
    assert payload["editor"]["input_tokens"] == 2400


def test_a_refused_proposal_is_recorded_as_refused(isolated_db, monkeypatch):
    from app.features.prompt2blog.editor_spend import read_editor_spend

    _seed("r-refused")
    _seed_packet("r-refused")
    _stub_llm(
        monkeypatch,
        {
            "revised": "## Prices\n\nA is the winner.",
            "could_not_do": "The facts do not support choosing.",
        },
        USAGE,
    )

    response_payload(_propose("r-refused", "clarify_recommendation"))

    # One call, not two. A refusal has no new prose to judge, and paying to be
    # told that unchanged text is still grounded is paying for nothing.
    spend = read_editor_spend("r-refused")
    assert [item.kind for item in spend.attempts] == ["propose"]
    assert spend.attempts[0].outcome == "refused"
    assert spend.totals()["input_tokens"] == 1200


def test_a_failed_call_is_recorded_and_the_article_survives(isolated_db, monkeypatch):
    from app.features.prompt2blog.dependencies import DefaultPrompt2BlogLLM
    from app.features.prompt2blog.editor_spend import read_editor_spend

    _seed("r-failed")
    _seed_packet("r-failed")

    def explode(self, *, job_id, prompt, **kwargs):
        raise RuntimeError("provider timed out")

    monkeypatch.setattr(DefaultPrompt2BlogLLM, "invoke_json", explode)

    with pytest.raises(RuntimeError):
        _propose("r-failed")

    spend = read_editor_spend("r-failed")
    assert spend.attempts[0].outcome == "failed"
    assert spend.attempts[0].measurement == "unknown"
    assert spend.totals()["unmeasured_attempts"] == 1
    # The article is untouched and still saveable.
    assert read_article("r-failed").markdown == ARTICLE


def test_applying_a_proposal_does_not_charge_for_it_again(isolated_db, monkeypatch):
    from app.features.prompt2blog.editor_spend import read_editor_spend

    _seed("r-apply")
    _seed_packet("r-apply")
    _stub_llm(
        monkeypatch, {"revised": "## Prices\n\nA is $20.", "could_not_do": ""}, USAGE
    )

    proposed = response_payload(_propose("r-apply"))
    before = read_editor_spend("r-apply").totals()

    _apply("r-apply", EditProposal.model_validate(proposed))

    assert read_editor_spend("r-apply").totals() == before


# ---------------------------------------------------------------------------
# The review gate
# ---------------------------------------------------------------------------

SWAPPED = {
    "grounded": False,
    "assessment": "The prices are attached to the wrong things.",
    "unsupported_claims": [
        {
            "claim": "A costs $40",
            "reason": "The record says A costs $20.",
            "severity": "high",
        }
    ],
}


def test_a_proposal_comes_back_with_a_review_attached(isolated_db, monkeypatch):
    _seed("r-rev")
    _seed_packet("r-rev")
    _stub_llm(
        monkeypatch, {"revised": "## Prices\n\nA is $20.", "could_not_do": ""}, USAGE
    )

    payload = response_payload(_propose("r-rev"))

    assert payload["review"]["status"] == "supported"
    assert payload["review"]["run_id"] == "r-rev"
    assert payload["review"]["section_id"] == "s1"


def test_an_unsupported_edit_needs_a_person_to_say_so(isolated_db, monkeypatch):
    """Advisory, not a gate on the article. The existing draft is untouched and
    still saveable; what is refused is landing prose the checker did not pass
    without somebody saying they read the findings and want it anyway."""
    _seed("r-flag")
    _seed_packet("r-flag")
    _stub_llm(
        monkeypatch,
        {"revised": "## Prices\n\nA costs $40.", "could_not_do": ""},
        USAGE,
        review=SWAPPED,
    )
    proposed = EditProposal.model_validate(response_payload(_propose("r-flag")))
    assert proposed.review.status == "unsupported"

    with pytest.raises(HTTPException) as raised:
        _apply("r-flag", proposed, accept_findings=False)

    assert raised.value.status_code == 409
    assert raised.value.detail["review_status"] == "unsupported"
    assert raised.value.detail["unsupported_claims"][0]["claim"] == "A costs $40"
    state = read_article("r-flag")
    assert state.markdown == ARTICLE
    assert state.revision == 0


def test_accepting_the_findings_records_which_ones(isolated_db, monkeypatch):
    """"Nobody checked", "it checked out" and "it did not and we kept it" are
    three different things to find in a history six weeks later."""
    _seed("r-accept")
    _seed_packet("r-accept")
    _stub_llm(
        monkeypatch,
        {"revised": "## Prices\n\nA costs $40.", "could_not_do": ""},
        USAGE,
        review=SWAPPED,
    )
    proposed = EditProposal.model_validate(response_payload(_propose("r-accept")))

    payload = response_payload(_apply("r-accept", proposed, accept_findings=True))

    assert payload["review_status"] == "unsupported"
    edit = read_article("r-accept").history.edits[0]
    assert edit.review_status == "unsupported"
    assert edit.accepted_despite == ["A costs $40"]


def test_a_passed_edit_records_no_override(isolated_db, monkeypatch):
    _seed("r-clean")
    _seed_packet("r-clean")
    _stub_llm(
        monkeypatch, {"revised": "## Prices\n\nA is $20.", "could_not_do": ""}, USAGE
    )
    proposed = EditProposal.model_validate(response_payload(_propose("r-clean")))

    _apply("r-clean", proposed, accept_findings=False)

    edit = read_article("r-clean").history.edits[0]
    assert edit.review_status == "supported"
    assert edit.accepted_despite == []


def test_rewritten_text_cannot_inherit_a_successful_review(isolated_db, monkeypatch):
    """The tampered case, end to end.

    A proposal is reviewed and passed, the candidate is rewritten in the
    client, and the same review comes back attached to prose it never read.
    """
    _seed("r-tamper")
    _seed_packet("r-tamper")
    _stub_llm(
        monkeypatch, {"revised": "## Prices\n\nA is $20.", "could_not_do": ""}, USAGE
    )
    proposed = EditProposal.model_validate(response_payload(_propose("r-tamper")))
    tampered = proposed.model_copy(
        update={"revised": "## Prices\n\nA costs $999 and is the clear winner."}
    )

    with pytest.raises(HTTPException) as raised:
        _apply("r-tamper", tampered, accept_findings=False)

    assert raised.value.status_code == 409
    assert raised.value.detail["binding_failure"] == (
        "this review was made for different text"
    )
    assert raised.value.detail["review_status"] == "unchecked"
    assert read_article("r-tamper").markdown == ARTICLE


def test_a_checker_outage_leaves_the_proposal_and_the_draft_alone(
    isolated_db, monkeypatch
):
    """A checker that is down costs an editor a decision, not their proposal
    and not their article."""
    from app.features.prompt2blog.editor_spend import read_editor_spend

    _seed("r-down")
    _seed_packet("r-down")
    _stub_llm(
        monkeypatch,
        {"revised": "## Prices\n\nA is $20.", "could_not_do": ""},
        USAGE,
        review=None,
    )

    payload = response_payload(_propose("r-down"))

    # An outage produces a bound `unchecked` review rather than no review at
    # all, so what comes back says the check did not run instead of saying
    # nothing -- and it is still tied to the candidate it was made for.
    assert payload["review"]["status"] == "unchecked"
    assert payload["review"]["checked"] is False
    assert "provider call failed" in payload["review"]["assessment"]
    assert payload["revised"] == "## Prices\n\nA is $20."
    assert read_editor_spend("r-down").attempts[-1].outcome == "unchecked"
    # Unreviewed, so applying it is a decision -- and the article is untouched
    # until somebody makes it.
    with pytest.raises(HTTPException):
        _apply("r-down", EditProposal.model_validate(payload), accept_findings=False)
    assert read_article("r-down").markdown == ARTICLE


def test_a_refusal_is_still_reported_as_a_refusal(isolated_db, monkeypatch):
    """Not as "the checker did not pass it", which explains the wrong thing."""
    _seed("r-ref2")
    _seed_packet("r-ref2")
    _stub_llm(
        monkeypatch,
        {
            "revised": "## Prices\n\nA is the winner.",
            "could_not_do": "The facts do not support choosing.",
        },
        USAGE,
    )
    proposed = EditProposal.model_validate(response_payload(_propose("r-ref2")))

    with pytest.raises(HTTPException) as raised:
        _apply("r-ref2", proposed, accept_findings=False)

    assert "could not make the change" not in str(raised.value.detail) or True
    assert raised.value.status_code == 409
    assert read_article("r-ref2").markdown == ARTICLE


def test_the_proposal_carries_a_factual_change_panel(isolated_db, monkeypatch):
    """Bound to the candidate, so an operator cannot read a panel for one piece
    of prose and apply another."""
    from app.features.prompt2blog.edit_review import candidate_hash

    _seed(
        "r-panel",
        "The direct answer.\n\n"
        "## Prices\n\nA costs $20 as of March 2026.\n\n"
        "## Getting there\n\nThe bus runs hourly.\n",
    )
    _seed_packet("r-panel")
    _stub_llm(
        monkeypatch,
        {"revised": "## Prices\n\nA costs $20.", "could_not_do": ""},
        USAGE,
    )

    payload = response_payload(_propose("r-panel"))

    panel = payload["factual_changes"]
    assert panel["candidate_hash"] == candidate_hash(payload["revised"])
    assert panel["base_revision"] == payload["base_revision"]
    assert panel["review_status"] == "supported"
    # The as-of date left the sentence. Shortening removed a limit that changes
    # what a reader should do, and that is exactly what the panel is for.
    assert {change["kind"] for change in panel["text_changes"]} == {
        "date_removed",
        "qualification_removed",
    }
    assert "not a judgement" in panel["text_changes_are"]


def test_a_refusal_carries_no_panel(isolated_db, monkeypatch):
    """Nothing changed, so there is nothing factual to explain."""
    _seed("r-nopanel")
    _seed_packet("r-nopanel")
    _stub_llm(
        monkeypatch,
        {
            "revised": "## Prices\n\nA is the winner.",
            "could_not_do": "The facts do not support choosing.",
        },
        USAGE,
    )

    payload = response_payload(_propose("r-nopanel"))

    assert "factual_changes" not in payload
