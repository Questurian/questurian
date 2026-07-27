"""The length profiles and the paragraph gate have to agree.

Each length profile declares a `paragraph_length` band in its frontmatter and
that string is the only thing _build_constraint_checks routes on. When the
declared band and the gate's band disagree, the gate fails prose that followed
the instruction it was given -- and a failed check buys a full repair rewrite.
"""

from __future__ import annotations

import re

from app.features.prompt2blog.config import PROMPT2BLOG_LENGTHS_DIR
from app.features.prompt2blog.options import _read_markdown_option_files
from app.features.prompt2blog.quality import _build_constraint_checks

SHIPPED_LENGTH_IDS = {"long", "medium", "short"}


def _lengths() -> list[dict]:
    return _read_markdown_option_files(PROMPT2BLOG_LENGTHS_DIR)


def _declared_band(paragraph_length: str) -> tuple[int, int]:
    low, high = re.search(r"(\d+)\D+(\d+)", paragraph_length).groups()
    return int(low), int(high)


def _article(sentences_per_paragraph: int, paragraphs: int = 6) -> str:
    body = " ".join(
        f"Sentence {index} carries a concrete detail."
        for index in range(sentences_per_paragraph)
    )
    return "\n\n".join(f"## Section {index}\n\n{body}" for index in range(paragraphs))


def _paragraph_check(content: str, paragraph_length: str) -> bool:
    return _build_constraint_checks(
        "A Title",
        content,
        {"formatting": {"paragraph_length": paragraph_length, "target_word_count": 0}},
    )["paragraph_length_met"]


def test_every_shipped_length_id_still_resolves():
    assert {length["id"] for length in _lengths()} == SHIPPED_LENGTH_IDS


def test_exactly_one_length_is_flagged_default():
    assert [length["id"] for length in _lengths() if length["default"]] == ["medium"]


def test_gate_accepts_prose_written_to_each_declared_band():
    # The bug this locks: `long` declared 5-8 sentences per paragraph while the
    # gate required an unbounded `>= 5.0`, so the profile's own instruction to
    # keep structure scannable could not be satisfied without failing.
    for length in _lengths():
        paragraph_length = length["paragraph_length"]
        low, high = _declared_band(paragraph_length)
        for sentences in range(low, high + 1):
            assert _paragraph_check(_article(sentences), paragraph_length), (
                f"{length['id']} rejects {sentences} sentences per paragraph, "
                f"inside its own declared band {paragraph_length}"
            )


def test_gate_still_rejects_paragraphs_far_outside_the_declared_band():
    for length in _lengths():
        paragraph_length = length["paragraph_length"]
        _, high = _declared_band(paragraph_length)

        assert not _paragraph_check(_article(high + 6), paragraph_length), (
            f"{length['id']} accepts wall-of-text paragraphs"
        )


def test_long_profile_does_not_ask_for_wall_of_text_paragraphs():
    long_profile = next(item for item in _lengths() if item["id"] == "long")
    _, high = _declared_band(long_profile["paragraph_length"])

    assert high <= 6
