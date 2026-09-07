"""A refusal is an unchanged proposal, on both sides of the wire.

The probe: a response carrying both `could_not_do` ("Cannot support this") and
changed prose containing a $999 that appears nowhere in the packet. The screen
offered it as an ordinary proposal, because the only thing enabling "Use this"
was that the text differed from the original, and applying it worked.
"""

from __future__ import annotations

from typing import Any

from app.features.prompt2blog.content.sections import segment_article
from app.features.prompt2blog.section_edit_v4 import (
    EditHistory,
    EditProposal,
    apply_proposal,
    propose_section_edit,
)

ARTICLE = (
    "The direct answer.\n\n"
    "## Prices\n\n"
    "A costs $20. B costs $40.\n"
)
BRIEF = {"seed": "What to pay", "reader": {"primary_reader": "A first visitor"}}
PACKET = {"facts": [{"text": "A costs $20."}, {"text": "B costs $40."}]}


class _FakeLLM:
    """A checkerless stand-in. Real model quality is not what these assert."""

    def __init__(self, response: dict[str, Any]) -> None:
        self.response = response
        self.calls = 0

    def invoke_json(self, **_kwargs: Any) -> tuple[dict[str, Any], str]:
        self.calls += 1
        return self.response, "{}"


class _FakeDependencies:
    def __init__(self, llm: _FakeLLM) -> None:
        self.llm = llm


def _propose(response: dict[str, Any]) -> EditProposal:
    return propose_section_edit(
        run_id="run-1",
        content=ARTICLE,
        section_id="s1",
        action_id="clarify_recommendation",
        brief=BRIEF,
        packet=PACKET,
        dependencies=_FakeDependencies(_FakeLLM(response)),
    )


def _section_hash(section_id: str = "s1") -> str:
    return next(
        section.text_hash
        for section in segment_article(ARTICLE)
        if section.section_id == section_id
    )


def test_a_refusal_carrying_changed_text_comes_back_unchanged():
    proposal = _propose(
        {
            "revised": "## Prices\n\nA costs $999 and is the clear winner.",
            "could_not_do": "The facts do not support choosing between them.",
            "what_changed": "Named a winner.",
        }
    )

    assert proposal.could_not_do == (
        "The facts do not support choosing between them."
    )
    assert proposal.revised.strip() == proposal.original.strip()
    assert proposal.changed is False
    assert "$999" not in proposal.revised


def test_an_ordinary_edit_is_untouched_by_the_invariant():
    proposal = _propose(
        {
            "revised": "## Prices\n\nA costs $20; B costs $40.",
            "could_not_do": "",
            "what_changed": "Joined two sentences.",
        }
    )

    assert proposal.changed is True
    assert proposal.could_not_do == ""


def test_a_warning_only_proposal_is_still_offered():
    """Advisory and refused are different, and stay different.

    An introduced figure is something a person may look at, decide they know
    where it came from, and keep. A refusal is not.
    """
    proposal = _propose(
        {
            "revised": "## Prices\n\nA costs $20. B costs $40. Budget $75 a day.",
            "could_not_do": "",
            "what_changed": "Added a daily budget.",
        }
    )

    assert proposal.introduced_figures == ["$75"]
    assert proposal.changed is True
    assert proposal.could_not_do == ""


def test_a_tampered_refusal_cannot_be_applied_directly():
    """The client is not where this invariant lives.

    A proposal reaches the apply route as a request body, so the normalisation
    done when it was proposed proves nothing about the object that comes back.
    """
    tampered = EditProposal(
        run_id="run-1",
        section_id="s1",
        heading="Prices",
        action_id="clarify_recommendation",
        text_hash=_section_hash(),
        original="## Prices\n\nA costs $20. B costs $40.",
        revised="## Prices\n\nA costs $999 and is the clear winner.",
        could_not_do="The facts do not support choosing between them.",
        introduced_figures=["$999"],
    )

    result = apply_proposal(
        content=ARTICLE,
        proposal=tampered,
        history=EditHistory(),
        editor="staff-1",
        now="2026-09-07T00:00:00Z",
    )

    assert result.applied is False
    assert result.markdown == ARTICLE
    assert result.history.edits == []
    assert result.rejected[0]["reason"] == (
        "this proposal says it could not make the change and changes the text "
        "as well"
    )


def test_a_no_op_proposal_makes_no_history():
    """Pattern learning reads accepted edits, and counts them.

    A no-op filed as an accepted edit is a correction that never happened,
    counting towards a threshold that decides whether the voice file changes.
    """
    unchanged = EditProposal(
        run_id="run-1",
        section_id="s1",
        heading="Prices",
        action_id="shorten",
        text_hash=_section_hash(),
        original="## Prices\n\nA costs $20. B costs $40.",
        revised="## Prices\n\nA costs $20. B costs $40.",
    )

    result = apply_proposal(
        content=ARTICLE,
        proposal=unchanged,
        history=EditHistory(),
        editor="staff-1",
        now="2026-09-07T00:00:00Z",
    )

    assert result.applied is False
    assert result.markdown == ARTICLE
    assert result.history.edits == []
    assert result.rejected[0]["reason"] == "this proposal does not change the section"


def test_a_real_edit_still_applies_and_is_recorded():
    proposal = EditProposal(
        run_id="run-1",
        section_id="s1",
        heading="Prices",
        action_id="shorten",
        text_hash=_section_hash(),
        original="## Prices\n\nA costs $20. B costs $40.",
        revised="## Prices\n\nA costs $20; B costs $40.",
        what_changed="Joined two sentences.",
    )

    result = apply_proposal(
        content=ARTICLE,
        proposal=proposal,
        history=EditHistory(),
        editor="staff-1",
        now="2026-09-07T00:00:00Z",
    )

    assert result.applied is True
    assert "A costs $20; B costs $40." in result.markdown
    assert result.history.original_markdown == ARTICLE
    assert len(result.history.edits) == 1
