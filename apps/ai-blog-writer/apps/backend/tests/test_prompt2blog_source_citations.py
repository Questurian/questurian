from __future__ import annotations

from app.features.prompt2blog.content.editorial_blocks import (
    _sanitize_editorial_augmentation,
)
from app.features.prompt2blog.content.source_citations import (
    count_residual_source_mentions,
    strip_source_citations,
)
from app.features.prompt2blog.quality import _sanitize_rewrite

# Taken verbatim from run 58766c27, which shipped thirteen of these.
LEAKED = (
    "A comfortable monthly budget runs between US$1,300 and US$1,600, "
    "according to Source 1. Furnished apartments typically rent for US$800 "
    "to US$1,200 per month (Source 2). Lima sits only 0.4% higher than its "
    "Colombian counterpart (Source 4)."
)


def test_the_citations_that_actually_shipped_are_removed():
    cleaned, removed = strip_source_citations(LEAKED)

    assert removed == 3
    assert count_residual_source_mentions(cleaned) == 0
    assert cleaned == (
        "A comfortable monthly budget runs between US$1,300 and US$1,600. "
        "Furnished apartments typically rent for US$800 to US$1,200 per "
        "month. Lima sits only 0.4% higher than its Colombian counterpart."
    )


def test_bracketed_citations_go_in_every_shape():
    for text in (
        "Trains are frequent (Source 1).",
        "Trains are frequent [Source 1].",
        "Trains are frequent (Sources 2, 3).",
        "Trains are frequent (see source 8).",
        "Trains are frequent (Source 1 and Source 2).",
    ):
        cleaned, removed = strip_source_citations(text)
        assert removed == 1, text
        assert cleaned == "Trains are frequent.", text


def test_an_attribution_clause_leaves_a_readable_sentence():
    # Deleting the clause and nothing else would leave the sentence starting
    # on a lowercase word, which reads worse than the citation did.
    cleaned, removed = strip_source_citations(
        "According to Source 2, the temple opens at nine."
    )

    assert removed == 1
    assert cleaned == "The temple opens at nine."

    cleaned, _removed = strip_source_citations(
        "Trains run late. As Source 3 notes, the last one leaves at 23:40."
    )
    assert cleaned == "Trains run late. The last one leaves at 23:40."


def test_echoed_scaffolding_lines_are_removed():
    cleaned, removed = strip_source_citations(
        "## Getting Around\n\nSource 1:\n\nTrains are frequent."
    )

    assert removed == 1
    assert cleaned == "## Getting Around\n\nTrains are frequent."


def test_ordinary_prose_about_sources_survives():
    # "The source of the river" is not a citation, and neither is a named
    # publication. Only numbered references go.
    for text in (
        "The source of the Kamo river is north of the city.",
        "Reuters reported the change in March.",
        "Check the official source before booking.",
    ):
        cleaned, removed = strip_source_citations(text)
        assert removed == 0, text
        assert cleaned == text, text


def test_compose_output_is_stripped_before_it_reaches_the_article():
    rewrite = _sanitize_rewrite(
        {
            "improved_title": "Living in Lima (Source 1)",
            "improved_content": LEAKED,
        },
        fallback_title="Lima",
        fallback_content="fallback",
    )

    assert rewrite["improved_title"] == "Living in Lima"
    assert count_residual_source_mentions(rewrite["improved_content"]) == 0
    assert rewrite["source_citations_removed"] == 4


def test_augmentation_cannot_reintroduce_citations():
    # Augmentation regenerates the whole article, so it can put back what
    # compose had stripped.
    augmentation = _sanitize_editorial_augmentation(
        {
            "augmented_content": "## Costs\n\nRent is US$800 (Source 2).",
            "components_added": [],
        },
        fallback_content="## Costs\n\nRent is US$800.",
    )

    assert "Source 2" not in augmentation["augmented_content"]
    assert augmentation["source_citations_removed"] == 1
