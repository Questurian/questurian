"""Improvement 03: what the rest of the article already said.

A section edit is shown its own section, the brief and the frozen facts, and
nothing else. That is what keeps it from rewriting prose nobody asked about --
and it is also why it will happily explain the price range a second time,
having no way to know the opening already did.

The report says to start with the outline plus exact excerpts before adding
summarisation, and that is what this is. A generated summary would be a fifth
thing that can be wrong, arriving in the same prompt as the evidence and
looking exactly like it. So the test that matters most here is the last one: a
mistaken memory cannot become evidence.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.features.prompt2blog.article_memory import (
    MAX_DECISIONS,
    build_article_memory,
)
from app.features.prompt2blog.dependencies import PipelineDependencies
from app.features.prompt2blog.section_edit_v4 import propose_section_edit

ARTICLE = """Two extra nights in Lima are worth it, and the reason is the food.
The range runs from $8 at a market stall to $95 for a tasting menu.

## Where to eat

Go to Surquillo market for ceviche. Central is the tasting menu everyone names,
and it is worth booking if that is what you came for.

## What it costs

Surquillo market sits at the cheap end. Budget $8 a head and you will eat well.

## If you do not eat meat

Stick to Surquillo market; the stalls do more with vegetables than Central
does."""

OUTLINE: dict[str, Any] = {
    "direct_answer_focus": "Whether two extra nights are worth it.",
    "takeaway_focus": "What decides it for a layover traveller.",
    "sections": [
        {
            "heading": "Where to eat",
            "reader_payoff": "Which place to book tonight.",
        },
        {"heading": "What it costs", "purpose": "Establish the price range."},
    ],
}


def _memory(content: str = ARTICLE, outline: dict[str, Any] | None = OUTLINE):
    return build_article_memory(content, outline)


# ---------------------------------------------------------------------------
# Built from what is already written down
# ---------------------------------------------------------------------------


def test_the_thesis_is_the_opening_quoted_not_described():
    """An excerpt can be badly chosen; it cannot say something the article does not."""
    memory = _memory()
    assert memory.thesis.startswith("Two extra nights in Lima are worth it")
    assert "$8" in memory.thesis


def test_the_plan_supplies_what_the_opening_and_close_were_for():
    memory = _memory()
    assert memory.planned_answer == "Whether two extra nights are worth it."
    assert memory.planned_close == "What decides it for a layover traveller."


def test_a_section_purpose_is_read_under_either_name():
    """`reader_payoff` after improvement 01; `purpose` before it.

    Reading only the new one would silently lose every section purpose on runs
    planned under the old.
    """
    payoffs = {section["heading"]: section["payoff"] for section in _memory().sections}
    assert payoffs["Where to eat"] == "Which place to book tonight."
    assert payoffs["What it costs"] == "Establish the price range."


def test_a_section_the_plan_never_described_says_so():
    payoffs = {section["heading"]: section["payoff"] for section in _memory().sections}
    assert payoffs["If you do not eat meat"] == "(the plan did not say)"


def test_a_run_whose_plan_was_rejected_still_has_a_memory():
    memory = build_article_memory(ARTICLE, None)
    assert memory.thesis
    assert len(memory.sections) == 4
    assert memory.planned_answer == ""


def test_an_excerpt_is_never_a_sentence_cut_in_half():
    """A truncated sentence in a prompt reads as a fact stated incompletely."""
    memory = _memory()
    for section in memory.sections:
        if section["opening_line"]:
            assert section["opening_line"].rstrip().endswith((".", "!", "?"))


# ---------------------------------------------------------------------------
# The two repetitions it exists to prevent
# ---------------------------------------------------------------------------


def test_a_name_the_article_uses_twice_is_recorded_as_introduced():
    """Introducing a place the piece already introduced is the first one."""
    assert "Surquillo" in " ".join(_memory().named_things)


def test_a_name_used_once_is_not_the_articles_vocabulary():
    """Two sections naming the same place is what makes it vocabulary.

    A passing mention is not something a later edit has to avoid
    re-introducing, and listing every capitalised word would drown the ones
    that matter.
    """
    once = ARTICLE.replace("than Central\ndoes", "than the tasting menus\ndo")
    memory = build_article_memory(once, None)

    assert any(thing.startswith("Surquillo") for thing in memory.named_things)
    assert not any(thing.startswith("Central") for thing in memory.named_things)


def test_what_the_article_already_tells_the_reader_to_do_is_quoted():
    """The second repetition: contradicting a recommendation already made."""
    sentences = [decision["sentence"] for decision in _memory().decisions]
    assert any("Go to Surquillo market" in sentence for sentence in sentences)
    assert any("Stick to Surquillo market" in sentence for sentence in sentences)


def test_a_recommendation_is_quoted_where_it_sits():
    """Quoted rather than summarised.

    "The conclusion recommends the vegetarian option" is a claim about the
    article. The sentence itself is the article.
    """
    vegetarian = next(
        decision
        for decision in _memory().decisions
        if "Stick to Surquillo" in decision["sentence"]
    )
    assert vegetarian["heading"] == "If you do not eat meat"


def test_a_piece_that_recommends_in_every_line_does_not_send_all_of_them():
    crowded = "## Everything\n\n" + " ".join(
        f"Go to place {index}." for index in range(30)
    )
    assert len(build_article_memory(crowded, None).decisions) == MAX_DECISIONS


# ---------------------------------------------------------------------------
# What the edit is actually handed
# ---------------------------------------------------------------------------


def test_the_edited_section_is_left_out_of_its_own_memory():
    """It is already shown that section in full.

    Including it twice invites a model to treat the excerpt as the thing to
    preserve rather than the prose in front of it.
    """
    rendered = _memory().for_prompt(excluding="s1")
    assert "Where to eat" not in rendered
    assert "What it costs" in rendered


def test_the_other_sections_arrive_with_what_each_is_for():
    rendered = _memory().for_prompt(excluding="s1")
    assert "What it costs — Establish the price range." in rendered


def test_an_empty_opening_block_is_not_reported_as_a_section():
    """`segment_article` always makes one so a draft can begin on a heading.

    An empty one is scaffolding, and listing it tells an edit about a part of
    the piece that does not exist.
    """
    memory = build_article_memory("## Only\n\nOne section here.", None)

    assert [section["heading"] for section in memory.sections] == ["Only"]
    assert memory.for_prompt(excluding="s1").strip() == ""


# ---------------------------------------------------------------------------
# A mistaken memory cannot become evidence
# ---------------------------------------------------------------------------


@dataclass
class FakeLLM:
    json_response: dict[str, Any] = field(default_factory=dict)
    prompts: list[str] = field(default_factory=list)

    def invoke_json(self, *, prompt: str, **_kwargs) -> tuple[dict[str, Any], str]:
        self.prompts.append(prompt)
        return dict(self.json_response), "{}"


PACKET: dict[str, Any] = {
    "facts": [
        {
            "claim_id": "c1",
            "text": "Stall ceviche in Surquillo market is priced around $8.",
            "confidence": "high",
        }
    ],
    "notes": [],
    "supplied_material": [],
}


def _propose(revised: str, content: str = ARTICLE):
    llm = FakeLLM(json_response={"revised": revised})
    proposal = propose_section_edit(
        run_id="r1",
        content=content,
        section_id="s1",
        action_id="clarify_recommendation",
        brief={"seed": "Where to eat in Lima"},
        packet=PACKET,
        dependencies=PipelineDependencies(llm=llm),
        outline=OUTLINE,
    )
    return proposal, llm.prompts[0]


def test_the_memory_reaches_the_edit_labelled_as_navigation():
    _proposal, prompt = _propose("x")
    assert "navigation, not evidence" in prompt
    assert "a number that appears only here is a number you may not use" in prompt.replace(
        "\n", " "
    )


def test_the_memory_tells_the_edit_what_the_article_already_decided():
    _proposal, prompt = _propose("x")
    assert "Stick to Surquillo market" in prompt
    assert "already tells the reader to do" in prompt


def test_a_figure_that_reached_the_edit_only_through_the_memory_is_still_flagged():
    """The guard the report asks for, stated as a test.

    $95 is in the article's opening and in no chosen fact. It travels in the
    memory, so a model could pick it up from there -- and the deterministic
    check deliberately does not consult the memory, so writing it into a
    section that did not have it is flagged exactly as inventing it would be.
    """
    proposal, prompt = _propose(
        "## Where to eat\n\nGo to Surquillo market; the tasting menus are $95."
    )
    assert "$95" in prompt  # it did travel, in the memory
    assert proposal.introduced_figures == ["$95"]


def test_a_figure_the_packet_carries_is_not_flagged():
    proposal, _prompt = _propose(
        "## Where to eat\n\nGo to Surquillo market; stalls are about $8."
    )
    assert proposal.introduced_figures == []


def test_the_memory_is_rebuilt_from_the_draft_as_it_is_now():
    """So an edit accepted a minute ago is part of what the next one is told.

    Free and deterministic, which is why it is rebuilt every time rather than
    cached and left to go stale.
    """
    edited = ARTICLE.replace(
        "Stick to Surquillo market", "Book Central and ask for the vegetable menu"
    )
    _proposal, prompt = _propose("x", content=edited)
    assert "Book Central and ask for the vegetable menu" in prompt
    assert "Stick to Surquillo market" not in prompt
