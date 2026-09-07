"""Which sections a repair pass is allowed to touch.

The claim-id screen refused an edit citing a fact outside the packet and
nothing else. Scope lived entirely in the prompt, so an edit to a paragraph no
revision mentioned was applied whenever its id was real and its hash current.
"""

from __future__ import annotations

from app.features.prompt2blog.content.sections import segment_article
from app.features.prompt2blog.stages.v3.repair_targets import (
    resolve_repair_targets,
    screen_against_targets,
    targets_block,
)

ARTICLE = (
    "The direct answer to the question.\n\n"
    "## Where to stay\n\n"
    "Barranco suits a first visit. Miraflores is safer after dark.\n\n"
    "## Getting around\n\n"
    "The Metropolitano runs north to south and costs 3.50 soles.\n"
)
SECTIONS = segment_article(ARTICLE)


def test_a_quoted_revision_targets_the_section_it_quotes():
    targets = resolve_repair_targets(
        sections=SECTIONS,
        required_revisions=['Cut the claim that "Miraflores is safer after dark".'],
        flagged={},
    )

    assert targets.scope == "targeted"
    assert targets.allowed == frozenset({"s1"})
    assert targets.unresolved == []


def test_a_revision_naming_a_heading_targets_that_section():
    targets = resolve_repair_targets(
        sections=SECTIONS,
        required_revisions=["Getting around never says how long the ride takes."],
        flagged={},
    )

    assert targets.allowed == frozenset({"s2"})


def test_a_flagged_claim_makes_its_section_a_target():
    """The grounding policy is to delete the assertion, and this is where."""
    targets = resolve_repair_targets(
        sections=SECTIONS,
        required_revisions=[],
        flagged={"s2": ["costs 3.50 soles"]},
    )

    assert targets.allowed == frozenset({"s2"})
    assert targets.scope == "targeted"


def test_an_edit_outside_the_targets_is_refused():
    """Valid id, valid hash, valid claim ids -- and still not this pass's job."""
    targets = resolve_repair_targets(
        sections=SECTIONS,
        required_revisions=['Cut the claim that "Miraflores is safer after dark".'],
        flagged={},
    )

    kept, rejected = screen_against_targets(
        [
            {"section_id": "s1", "content": "Barranco suits a first visit."},
            {"section_id": "s0", "content": "A brand new opening."},
        ],
        targets,
    )

    assert [item["section_id"] for item in kept] == ["s1"]
    assert rejected == [
        {
            "section_id": "s0",
            "reason": "outside the sections this repair was for (targeted)",
        }
    ]


def test_a_length_revision_covers_the_whole_draft():
    """Passed in by the caller, which computed it, rather than pattern-matched."""
    length = "Length: the draft is 1903 words. Cut about 360 words."
    targets = resolve_repair_targets(
        sections=SECTIONS,
        required_revisions=[length, "Tighten the opening."],
        flagged={},
        article_wide=[length],
    )

    assert targets.scope == "article_wide"
    assert targets.allowed == frozenset({"s0", "s1", "s2"})
    kept, rejected = screen_against_targets(
        [{"section_id": "s0", "content": "Shorter."}], targets
    )
    assert len(kept) == 1
    assert rejected == []


def test_a_revision_nobody_can_locate_is_recorded_not_hidden():
    """Deliberately permissive, and deliberately loud about it.

    An audit can raise a real problem with the whole draft that no quote and
    no heading will locate. Refusing those would leave repair only ever fixing
    the easy half, so the pass is allowed to proceed -- but it is recorded as
    `unresolved`, so it is never afterwards describable as targeted.
    """
    targets = resolve_repair_targets(
        sections=SECTIONS,
        required_revisions=["The article never answers what the reader came for."],
        flagged={},
    )

    assert targets.scope == "unresolved"
    assert targets.allowed == frozenset({"s0", "s1", "s2"})
    assert targets.unresolved == [
        "The article never answers what the reader came for."
    ]
    assert targets.as_dict()["unresolved_revisions"] == targets.unresolved


def test_an_unresolved_revision_beside_a_located_one_does_not_widen_scope():
    targets = resolve_repair_targets(
        sections=SECTIONS,
        required_revisions=[
            'Cut the claim that "Miraflores is safer after dark".',
            "The piece reads flat.",
        ],
        flagged={},
    )

    assert targets.scope == "targeted"
    assert targets.allowed == frozenset({"s1"})
    assert targets.unresolved == ["The piece reads flat."]


def test_the_prompt_is_told_the_same_list_the_screen_enforces():
    targets = resolve_repair_targets(
        sections=SECTIONS,
        required_revisions=['Cut the claim that "Miraflores is safer after dark".'],
        flagged={},
    )

    block = targets_block(targets, SECTIONS)
    assert block == "- s1 Where to stay"
