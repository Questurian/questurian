"""What a section replacement may not do to the document around it.

Each of these was reproduced against the real functions before it was written.
The replacement machinery is the safety boundary the whole post-writing editor
rests on: repair uses it, the section editor uses it, and the style cleanup
uses it. Every hole in it is a hole in all three.
"""

from __future__ import annotations

from app.features.prompt2blog.content.sections import (
    apply_section_replacements,
    segment_article,
)

# Trailing spaces on the `## Keep` line and after "Untouched." are load-bearing:
# two spaces at the end of a Markdown line is a line break, and a replacement
# for a different section has no business removing one.
ARTICLE = (
    "The direct answer.\n\n"
    "## Prices\n\n"
    "A costs $20. B costs $40.\n\n\n"
    "## Keep  \n\n"
    "Untouched.  \n"
)


def _hash_of(content: str, section_id: str) -> str:
    for section in segment_article(content):
        if section.section_id == section_id:
            return section.text_hash
    raise AssertionError(f"no section {section_id}")


def _edit(section_id: str, body: str, **extra: str) -> dict[str, str]:
    return {
        "section_id": section_id,
        "text_hash": _hash_of(ARTICLE, section_id),
        "content": body,
        **extra,
    }


def test_a_replacement_without_a_hash_is_refused():
    """Absence was being read as agreement.

    The staleness check was `if supplied_hash and supplied_hash != current`,
    so a response that simply omitted the field skipped the one check this
    module exists for and landed on whatever the section says now.
    """
    result = apply_section_replacements(
        ARTICLE, [{"section_id": "s1", "content": "New text."}]
    )

    assert result.applied == []
    assert result.content == ARTICLE
    assert result.rejected == [
        {"section_id": "s1", "reason": "no text_hash supplied"}
    ]


def test_an_empty_hash_is_refused_like_a_missing_one():
    result = apply_section_replacements(
        ARTICLE, [_edit("s1", "New text.") | {"text_hash": "   "}]
    )

    assert result.applied == []
    assert result.rejected[0]["reason"] == "no text_hash supplied"


def test_untargeted_bytes_are_identical():
    """Not "equivalent". Identical.

    The old implementation rebuilt the whole document from its parsed
    sections, so every untouched section came back through `strip()` and a
    regenerated `## ` line. The two trailing spaces that make a line break,
    the extra blank line, and the document's final newline were all lost by a
    replacement that never named those sections.
    """
    result = apply_section_replacements(ARTICLE, [_edit("s1", "New text.")])

    assert result.applied == ["s1"]
    opening = ARTICLE.index("## Prices")
    keep = ARTICLE.index("## Keep")
    assert result.content[:opening] == ARTICLE[:opening]
    assert result.content[result.content.index("## Keep") :] == ARTICLE[keep:]
    assert result.content.endswith("Untouched.  \n")


def test_the_gap_after_an_edited_section_is_preserved():
    """The blank lines between sections belong to the document, not the edit."""
    result = apply_section_replacements(ARTICLE, [_edit("s1", "New text.")])

    assert "New text.\n\n\n## Keep" in result.content


def test_a_body_cannot_open_another_section():
    """The probe that started this: `## Injected` inside a replacement body.

    It was accepted, and the document went from three sections to four --
    which renumbers every section after it, so the next edit written against
    `s2` addresses different prose than the one that read it.
    """
    result = apply_section_replacements(
        ARTICLE,
        [_edit("s1", "New text.\n\n## Injected\n\nExtra section.")],
    )

    assert result.applied == []
    assert result.content == ARTICLE
    assert len(segment_article(result.content)) == 3
    assert result.rejected[0]["reason"] == (
        "the replacement body would open another `##` section"
    )


def test_a_body_cannot_open_an_h1():
    result = apply_section_replacements(
        ARTICLE, [_edit("s1", "New text.\n\n# A title\n\nMore.")]
    )

    assert result.applied == []
    assert result.rejected[0]["reason"] == (
        "the replacement body would open an `#` heading"
    )


def test_a_heading_cannot_span_lines():
    result = apply_section_replacements(
        ARTICLE, [_edit("s1", "New text.", heading="Prices\n## Sneak")]
    )

    assert result.applied == []
    assert len(segment_article(result.content)) == 3
    assert result.rejected[0]["reason"] == "a heading cannot span lines"


def test_a_heading_cannot_carry_its_own_marks():
    """`heading` names the text, and the `## ` is added in code.

    A heading of "## Prices" would render as `## ## Prices`, which is not a
    heading at all and silently unaddresses the section.
    """
    result = apply_section_replacements(
        ARTICLE, [_edit("s1", "New text.", heading="## Prices")]
    )

    assert result.applied == []
    assert result.rejected[0]["reason"] == (
        "a heading cannot carry its own `#` marks"
    )


def test_h3_and_lists_are_ordinary_content():
    """The structure rule refuses `##` and `#`. It refuses nothing else."""
    result = apply_section_replacements(
        ARTICLE,
        [_edit("s1", "New text.\n\n### A sub-heading\n\n- one\n- two")],
    )

    assert result.applied == ["s1"]
    assert "### A sub-heading" in result.content
    assert len(segment_article(result.content)) == 3


def test_a_fenced_heading_is_not_document_structure():
    """Sample text that looks like a heading is sample text.

    Both directions matter: `segment_article` must not cut a section at it,
    and the structure check must not refuse a body for containing it.
    """
    fenced = "New text.\n\n```markdown\n## an example heading\n```\n\nAfter."
    result = apply_section_replacements(ARTICLE, [_edit("s1", fenced)])

    assert result.applied == ["s1"]
    assert len(segment_article(result.content)) == 3
    assert "## an example heading" in result.content


def test_duplicate_headings_stay_separately_addressable():
    article = (
        "Opening.\n\n"
        "## Getting there\n\nBy bus.\n\n"
        "## Getting there\n\nBy train.\n"
    )
    sections = segment_article(article)
    assert [section.section_id for section in sections] == ["s0", "s1", "s2"]

    result = apply_section_replacements(
        article,
        [
            {
                "section_id": "s2",
                "text_hash": sections[2].text_hash,
                "content": "By rail.",
            }
        ],
    )

    assert result.applied == ["s2"]
    assert "By bus." in result.content
    assert "By rail." in result.content
    assert "By train." not in result.content
