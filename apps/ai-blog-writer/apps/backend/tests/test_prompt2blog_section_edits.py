"""Findings 06 and 03: repair changes what it named, and can reach the facts.

06 was an unenforced boundary. Repair regenerated the whole article and was
asked in prose to return untouched sections "word for word"; the code measured
which ones moved and recorded the answer. A pass asked to fix one paragraph
could rewrite the opening, and keep-best would retain it whenever the auditor
liked the score.

03 was the other half: repair could not see the facts a person chose for this
article, so a revision like "support the comparison" was unanswerable whenever
the first draft happened to leave the fact out.
"""

from __future__ import annotations

from app.features.prompt2blog.content.sections import (
    apply_section_replacements,
    locate_claims,
    render_article,
    section_manifest,
    segment_article,
)

ARTICLE = """The short answer is that the airport taxi is worth it before 6am.

## Getting there

The rail link runs every twenty minutes.

## What it costs

A fare is about USD 9 as of March 2026.

## Getting there

The bus takes an hour longer."""


def _edit(section_id: str, content: str, **extra):
    section = next(
        item for item in segment_article(ARTICLE) if item.section_id == section_id
    )
    return {
        "section_id": section_id,
        "text_hash": section.text_hash,
        "content": content,
        **extra,
    }


def test_the_opening_block_is_addressable():
    sections = segment_article(ARTICLE)

    assert sections[0].section_id == "s0"
    assert sections[0].heading == ""
    assert "worth it before 6am" in sections[0].body


def test_two_sections_sharing_a_heading_get_different_ids():
    """A heading-keyed address would merge these and let one edit hit both."""
    sections = segment_article(ARTICLE)
    repeated = [item for item in sections if item.heading == "Getting there"]

    assert len(repeated) == 2
    assert repeated[0].section_id != repeated[1].section_id
    assert repeated[0].text_hash != repeated[1].text_hash


def test_a_round_trip_with_no_edits_returns_the_same_document():
    assert render_article(segment_article(ARTICLE)) == ARTICLE.strip()


def test_only_the_named_section_changes():
    result = apply_section_replacements(
        ARTICLE, [_edit("s2", "A fare is about USD 9 as of March 2026, one way.")]
    )

    assert result.applied == ["s2"]
    assert result.rejected == []
    # Everything else is the original bytes, not a promise that it is.
    before = segment_article(ARTICLE)
    after = segment_article(result.content)
    for index in (0, 1, 3):
        assert after[index].body == before[index].body
        assert after[index].heading == before[index].heading


def test_an_unknown_id_is_refused():
    result = apply_section_replacements(
        ARTICLE, [{"section_id": "s99", "content": "Invented section."}]
    )

    assert result.applied == []
    assert result.content == ARTICLE
    assert result.rejected[0]["reason"] == "unknown section id"


def test_naming_the_same_section_twice_refuses_both_edits():
    """An ambiguous response does not get to apply half of itself.

    Keeping the first and refusing the second looked like the conservative
    choice and is not: a response that named the same paragraph twice does not
    know what it wants there, and whichever of the two arrived first is not
    evidence about which one it meant.
    """
    result = apply_section_replacements(
        ARTICLE,
        [_edit("s1", "First rewrite."), _edit("s1", "Second rewrite.")],
    )

    assert result.applied == []
    assert result.content == ARTICLE
    assert [item["reason"] for item in result.rejected] == [
        "named more than once",
        "named more than once",
    ]


def test_a_stale_hash_is_refused():
    """An edit written against an older draft never lands on newer prose."""
    result = apply_section_replacements(
        ARTICLE,
        [
            {
                "section_id": "s1",
                "text_hash": "deadbeef1234",
                "content": "Rewritten from a draft that no longer exists.",
            }
        ],
    )

    assert result.applied == []
    assert result.content == ARTICLE
    assert "stale text_hash" in result.rejected[0]["reason"]


def test_an_empty_body_is_refused_rather_than_deleting_a_section():
    result = apply_section_replacements(ARTICLE, [_edit("s1", "   ")])

    assert result.applied == []
    assert "## Getting there" in result.content
    assert result.rejected[0]["reason"] == "empty replacement body"


def test_the_opening_cannot_grow_a_heading():
    result = apply_section_replacements(
        ARTICLE, [_edit("s0", "New opening.", heading="Introduction")]
    )

    assert result.applied == []
    assert result.rejected[0]["reason"] == "the opening block cannot take a heading"


def test_a_response_that_is_not_a_list_leaves_the_draft_alone():
    result = apply_section_replacements(ARTICLE, {"section_id": "s1"})

    assert result.content == ARTICLE
    assert result.changed is False


def test_a_heading_may_be_changed_with_its_section():
    result = apply_section_replacements(
        ARTICLE, [_edit("s2", "About USD 9.", heading="What the fare costs")]
    )

    assert "## What the fare costs" in result.content
    assert "## What it costs" not in result.content


def test_the_manifest_gives_the_model_an_id_and_a_hash_for_each_section():
    manifest = section_manifest(segment_article(ARTICLE))

    assert "(opening — no heading)" in manifest
    for section in segment_article(ARTICLE):
        assert f"- {section.section_id} [{section.text_hash}]" in manifest


def test_flagged_claims_are_pointed_at_the_section_they_sit_in():
    located = locate_claims(
        segment_article(ARTICLE),
        [
            {"claim": "A fare is about USD 9 as of March 2026.", "severity": "high"},
            {"claim": "Nothing in the draft says this.", "severity": "high"},
        ],
    )

    assert located == {"s2": ["A fare is about USD 9 as of March 2026."]}
