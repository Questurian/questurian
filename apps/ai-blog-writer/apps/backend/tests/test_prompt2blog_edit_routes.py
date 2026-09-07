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


def _apply(run_id: str, proposal: EditProposal, reason: str = ""):
    from app.features.prompt2blog.api import runs as runs_api

    return runs_api.apply_edit(
        run_id,
        runs_api.ApplyEditRequest(proposal=proposal, reason=reason),
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
