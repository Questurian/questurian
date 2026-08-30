"""Repair changes what the auditor named, and nothing else.

To trim forty words the Lima run regenerated all 1,041 -- 11,119 output tokens
at 47 cents, nearly half the run. The keep-best net that caught the worse
result afterwards is not the bug; needing one was.
"""

from __future__ import annotations

from app.features.prompt2blog.content.markdown import (
    sections_changed,
    split_markdown_sections,
)
from app.features.prompt2blog.policies import is_better_quality

ARTICLE = """An opening paragraph that sets things up.

## What Lima costs now

Stall ceviche runs a fraction of the tasting menus.

## Where to stay

Miraflores is flat, which matters more than it sounds like it should.
"""


def test_an_article_splits_into_its_sections():
    sections = split_markdown_sections(ARTICLE)

    assert set(sections) == {"", "What Lima costs now", "Where to stay"}
    # The opening is not a section and is the easiest thing to lose in a round
    # trip, so it is kept under the empty key rather than dropped.
    assert sections[""].startswith("An opening paragraph")


def test_nothing_changed_reports_nothing_touched():
    assert sections_changed(ARTICLE, ARTICLE) == []


def test_a_rewritten_section_is_named():
    edited = ARTICLE.replace(
        "Stall ceviche runs a fraction of the tasting menus.",
        "Stall ceviche runs about a fifth of the tasting menus.",
    )

    assert sections_changed(ARTICLE, edited) == ["What Lima costs now"]


def test_collateral_damage_is_visible():
    """The whole reason for scoping repair.

    A pass asked to fix one section that also rewrites another has damaged
    working prose, and that has to be readable off the run rather than
    discovered by someone re-reading the article.
    """
    edited = ARTICLE.replace("Miraflores is flat", "Miraflores is quite flat")

    assert sections_changed(ARTICLE, edited) == ["Where to stay"]


def test_a_lost_section_counts_as_a_change():
    truncated = ARTICLE.split("## Where to stay")[0]

    assert "Where to stay" in sections_changed(ARTICLE, truncated)


# --- keep-best can see distance (#432, A15) -------------------------------


def _draft(score: int, delta: int) -> dict:
    return {
        "audit_complete": True,
        "overall_score": score,
        "guideline_coverage_score": score,
        "groundedness": {"checked": True, "grounded": True, "high_severity_count": 0},
        "constraint_checks": {"word_count_delta": delta},
    }


def test_the_closer_draft_wins_a_tie():
    """Repair got the draft to four words over; the original was forty-one
    over. The comparison could not tell those apart, called it a tie, and the
    settle node restored the worse one."""
    repaired = _draft(score=8, delta=4)
    original = _draft(score=8, delta=41)

    assert is_better_quality(repaired, original) is True
    assert is_better_quality(original, repaired) is False


def test_length_never_outranks_the_auditor():
    # Last on purpose. A draft that wins for being the right size while being
    # worse to read is the failure this ordering exists to prevent.
    right_size_worse = _draft(score=6, delta=0)
    better_but_longer = _draft(score=9, delta=41)

    assert is_better_quality(right_size_worse, better_but_longer) is False
