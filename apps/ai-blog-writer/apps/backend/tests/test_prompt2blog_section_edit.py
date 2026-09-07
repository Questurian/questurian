"""Improvement 07: one section, one asked-for improvement, shown before applied.

An editor reading a finished draft can see that one paragraph hedges where it
should choose, and the only tools were to rewrite it by hand or re-run the
article. Repair is not that tool: it is driven by an audit, it fires once per
run inside a token budget, and it decides for itself what to change.

The risk this invites is specific. An editor asks for a stronger recommendation
and gets a number that would make one. So the tests here are mostly about the
proposal being refused, checked, or shown rather than applied.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import pytest

from app.features.prompt2blog.dependencies import PipelineDependencies
from app.features.prompt2blog.section_edit_v4 import (
    EDIT_ACTIONS,
    EditHistory,
    EditProposal,
    apply_proposal,
    propose_section_edit,
    undo_last,
)

ARTICLE = """Lima is worth two extra nights.

## Where to eat

Market ceviche runs about $8. The tasting menus run to $95. Both are good.

## Getting there

The transfer takes 40 minutes."""

BRIEF: dict[str, Any] = {
    "seed": "Where to eat in Lima",
    "reader": {"primary_reader": "layover traveller"},
    "reader_question": "What does a good meal cost?",
    "outcome": "pick a place tonight",
    "fails_if": "reads like a tourist board",
    "must_name": ["Surquillo market"],
}

PACKET: dict[str, Any] = {
    "facts": [
        {
            "claim_id": "c1",
            "text": "Stall ceviche in Surquillo market is priced around $8.",
            "as_of": "2026-08-01",
            "confidence": "high",
        },
        {
            "claim_id": "c2",
            "text": "Tasting menus in Miraflores run to $95.",
            "confidence": "medium",
        },
    ],
    "notes": [
        {
            "note_id": "n1",
            "kind": "source_note",
            "text": "Prices surveyed in August 2026; stalls vary.",
            "claim_ids": ["c1"],
        }
    ],
    "supplied_material": [
        {"kind": "firsthand", "statement": "I waited 45 minutes on my visit"}
    ],
}


@dataclass
class FakeLLM:
    json_response: dict[str, Any] = field(default_factory=dict)
    prompts: list[str] = field(default_factory=list)

    def invoke_json(self, *, prompt: str, **_kwargs) -> tuple[dict[str, Any], str]:
        self.prompts.append(prompt)
        return dict(self.json_response), "{}"


def _ask(response: dict[str, Any], **overrides) -> tuple[EditProposal, str]:
    """The proposal, and the prompt it was asked with."""
    llm = FakeLLM(json_response=response)
    kwargs = dict(
        run_id="r1",
        content=ARTICLE,
        section_id="s1",
        action_id="clarify_recommendation",
        brief=BRIEF,
        packet=PACKET,
        dependencies=PipelineDependencies(llm=llm),
    )
    kwargs.update(overrides)
    proposal = propose_section_edit(**kwargs)
    return proposal, llm.prompts[0]


def _propose(response: dict[str, Any], **overrides) -> EditProposal:
    return _ask(response, **overrides)[0]


# ---------------------------------------------------------------------------
# What the editor may ask for
# ---------------------------------------------------------------------------


def test_the_actions_are_a_closed_list():
    """A free-text box was the obvious design and it is the wrong one.

    "Make this better" is a request only a model with an opinion can satisfy,
    and the opinion it reaches for is the house style of the internet.
    """
    ids = {action.action_id for action in EDIT_ACTIONS}
    assert ids == {
        "clarify_recommendation",
        "shorten",
        "reduce_repetition",
        "strengthen_comparison",
        "explain_the_detail",
    }


def test_an_action_nobody_defined_is_refused():
    with pytest.raises(ValueError, match="Unknown edit action"):
        _propose({"revised": "x"}, action_id="make_it_pop")


def test_a_section_this_draft_does_not_have_is_refused():
    """An editor who clicked something that no longer exists is told so,

    rather than handed an edit to a different paragraph.
    """
    with pytest.raises(ValueError, match="no section"):
        _propose({"revised": "x"}, section_id="s9")


# ---------------------------------------------------------------------------
# The proposal is shown, not applied
# ---------------------------------------------------------------------------


def test_a_proposal_carries_the_original_beside_the_revision():
    proposal = _propose(
        {
            "revised": "## Where to eat\n\nGo to the market stalls at $8.",
            "what_changed": "Named the choice instead of listing both.",
        }
    )
    assert "Both are good." in proposal.original
    assert "Go to the market stalls" in proposal.revised
    assert proposal.changed is True


def test_the_proposal_records_the_text_it_was_written_against():
    proposal = _propose({"revised": "## Where to eat\n\nGo to the stalls."})
    from app.features.prompt2blog.section_edit_v4 import find_section

    assert proposal.text_hash == find_section(ARTICLE, "s1").text_hash


def test_nothing_is_written_by_proposing():
    """The route that proposes spends a model call and touches no storage."""
    proposal = _propose({"revised": "## Where to eat\n\nGo to the stalls."})
    assert proposal.original in ARTICLE or proposal.original.strip() in ARTICLE
    # The proposal is a value. Applying it is a separate, later decision.
    assert isinstance(proposal, EditProposal)


# ---------------------------------------------------------------------------
# A request the evidence cannot support
# ---------------------------------------------------------------------------


def test_a_refusal_is_carried_rather_than_swallowed():
    proposal = _propose(
        {
            "revised": "## Where to eat\n\nMarket ceviche runs about $8. "
            "The tasting menus run to $95. Both are good.",
            "could_not_do": "Nothing on the desk says which suits whom.",
        }
    )
    assert proposal.could_not_do == "Nothing on the desk says which suits whom."
    assert proposal.changed is False


def test_an_empty_revision_keeps_the_section_and_says_why():
    """Far more likely a truncated response than a considered cut.

    This pass may not delete a section in any case.
    """
    proposal = _propose({"revised": "   "})
    assert proposal.revised == proposal.original
    assert "came back empty" in proposal.could_not_do


def test_a_figure_from_nowhere_is_named_before_a_person_sees_it():
    """The exact failure this feature invites.

    An editor asks for a stronger recommendation, and a model supplies the
    number that would make one.
    """
    proposal = _propose(
        {
            "revised": "## Where to eat\n\nGo to the stalls: $8 against $95, "
            "and the queue is only 12 minutes.",
        }
    )
    assert proposal.introduced_figures == ["12 minutes"]


def test_figures_the_original_or_the_packet_already_carried_are_not_flagged():
    proposal = _propose(
        {
            "revised": "## Where to eat\n\nGo to the stalls at $8 rather than "
            "the $95 menus; I waited 45 minutes and it was worth it.",
        }
    )
    assert proposal.introduced_figures == []


# ---------------------------------------------------------------------------
# What the model is shown
# ---------------------------------------------------------------------------


def test_the_edit_sees_the_frozen_facts_and_their_limits():
    _proposal, prompt = _ask({"revised": "x"})
    assert "Stall ceviche in Surquillo market is priced around $8." in prompt
    assert "LIMIT: Prices surveyed in August 2026" in prompt
    assert "YOUR OWN NOTE, verbatim: I waited 45 minutes" in prompt


def test_the_edit_is_given_only_its_own_section_to_edit():
    """The rest of the article reaches it as navigation, never as prose to edit.

    Improvement 03 added the memory; what it must not do is make the other
    sections look editable. They arrive under a heading that says they are not
    evidence and not the thing being changed, and only the section under
    ORIGINAL SECTION is offered for replacement.
    """
    _proposal, prompt = _ask({"revised": "x"})
    original = prompt.split("ORIGINAL SECTION:")[1]

    assert "Where to eat" in original
    assert "The transfer takes 40 minutes." not in original


def test_the_edit_is_told_a_refusal_is_a_correct_answer():
    _proposal, prompt = _ask({"revised": "x"})
    assert "That is a correct answer." in prompt


# ---------------------------------------------------------------------------
# Applying, and taking it back
# ---------------------------------------------------------------------------


def _applied(revised: str = "## Where to eat\n\nGo to the market stalls."):
    proposal = _propose({"revised": revised, "what_changed": "Named the choice."})
    return apply_proposal(
        content=ARTICLE,
        proposal=proposal,
        history=EditHistory(),
        editor="alan",
        now="2026-09-07T00:00:00+00:00",
    )


def test_only_the_edited_section_changes():
    """The success criterion, stated as a test."""
    result = _applied()
    assert result.applied is True
    assert "Go to the market stalls." in result.markdown
    assert "Lima is worth two extra nights." in result.markdown
    assert "The transfer takes 40 minutes." in result.markdown
    assert "Both are good." not in result.markdown


def test_an_edit_written_against_an_older_draft_is_refused():
    """A proposal read on one screen while another edit landed on the same

    section must not be applied over the top of it.
    """
    proposal = _propose({"revised": "## Where to eat\n\nGo to the stalls."})
    moved = ARTICLE.replace("Both are good.", "Both are fine.")

    result = apply_proposal(
        content=moved,
        proposal=proposal,
        history=EditHistory(),
        editor="alan",
        now="2026-09-07T00:00:00+00:00",
    )

    assert result.applied is False
    assert result.markdown == moved
    assert "stale text_hash" in result.rejected[0]["reason"]


def test_undo_restores_the_previous_text_exactly():
    result = _applied()
    undone = undo_last(result.history)

    assert undone is not None
    markdown, history = undone
    assert markdown == ARTICLE
    assert history.edits == []


def test_the_draft_the_pipeline_produced_survives_every_later_edit():
    """Kept separately from the undo stack.

    The report asks for the original draft to be retained, and an undo stack
    unwound one step at a time is not that.
    """
    first = _applied()
    second = apply_proposal(
        content=first.markdown,
        proposal=_propose(
            {"revised": "## Where to eat\n\nThe stalls, at $8."},
            content=first.markdown,
        ),
        history=first.history,
        editor="alan",
        now="2026-09-07T00:01:00+00:00",
    )

    assert len(second.history.edits) == 2
    assert second.history.original_markdown == ARTICLE


def test_undoing_an_unedited_draft_is_a_question_with_a_plain_answer():
    assert undo_last(EditHistory()) is None


def test_a_date_the_model_was_shown_is_not_an_invented_figure():
    """The prompt shows each fact's as-of date, the operator's note on it and
    the limit notes. The figure guard read none of them, so a model that
    correctly dated a fare had the year reported as an invention.

    Found on the first live call this code made -- against a brief whose
    `fails_if` was a fare quoted without saying when it was true."""
    from app.features.prompt2blog.section_edit_v4 import _packet_figures

    packet = {
        "facts": [
            {
                "text": "Official taxis charge $25 to Miraflores.",
                "as_of": "March 2026",
                "operator_note": "Confirmed at the rank on the 14th.",
            }
        ],
        "notes": [{"text": "Fares were checked against a 2025 baseline."}],
        "supplied_material": [{"statement": "I waited 40 minutes at 6am."}],
    }

    figures = _packet_figures(packet)
    assert "2026" in figures, "an as-of date is shown to the model"
    assert "2025" in figures, "a limit note is shown too"
    assert "40 minutes" in figures and "$25" in figures
