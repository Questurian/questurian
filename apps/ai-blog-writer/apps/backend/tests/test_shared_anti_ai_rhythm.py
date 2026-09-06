"""The rhythm rule, and why it never fired.

Run 90b3f9bc (2026-08-31) produced an article averaging 11.3 words a sentence,
57% of them inside a five word band, one of seventy five past 25 words. The
rhythm rule was in the prompt the whole time. Its trigger read "if three
sentences in a row are 15-25 words", and only ten sentences in the article ever
reached 15, so the condition was never met once.

It was written to catch clustering at medium length. This article clustered
short. The rule watched one wall of a room with two doors.
"""

from __future__ import annotations

from app.shared.prompts.anti_ai_tells import (
    ANTI_AI_TELLS_BLURB,
    ANTI_AI_TELLS_FULL,
)


def _flat(text: str) -> str:
    return " ".join(text.split())


def test_the_rule_catches_clustering_at_any_length():
    rules = _flat(ANTI_AI_TELLS_FULL)

    assert "Clustering at ANY length is the failure" in rules
    assert "between 9 and 14 words" in rules, "name the band this article hit"
    assert "at least one sentence under 8 words and at least one over 25" in rules


def test_the_old_trigger_that_never_fired_is_gone():
    assert "If three sentences in a row are 15-25 words" not in _flat(ANTI_AI_TELLS_FULL)


def test_the_rule_says_where_length_comes_from():
    """Telling a model to vary length while every device for a long sentence is
    banned or unmentioned is telling it to run with its laces tied."""
    rules = _flat(ANTI_AI_TELLS_FULL)

    assert "Length comes from subordination" in rules
    assert "because, which, while, after, so that" in rules


def test_the_aside_rule_offers_subordination_before_splitting():
    """Its only escape was "two shorter sentences", and the model generalised
    the one option it was given into a house style."""
    rules = _flat(ANTI_AI_TELLS_FULL)

    assert "one sentence with a subordinate clause" in rules
    assert "Splitting is the last resort, not the house style" in rules


def test_long_sentences_are_explicitly_not_banned():
    rules = _flat(ANTI_AI_TELLS_FULL)

    assert "None of this bans long sentences" in rules
    assert "commas joining clauses are correct and wanted" in rules


def test_the_em_dash_ban_and_the_hyphen_budget_are_untouched():
    """Deliberate, and not the cause of the flatness.

    The em dash ban is a defence against reading as AI generated, which is a
    correct call about how readers judge text in 2026. A future session reading
    "we fixed the rhythm" must not helpfully unban it.

    The compound rule is a budget rather than a ban, and that is also
    deliberate: the blanket version scored a perfect zero across 26 stored
    articles while the compounds it was aimed at walked past it, and it cost
    the Lima chifa article the word "stir-fried". Do not restore the ban, and
    do not remove the ration either.
    """
    for rules in (_flat(ANTI_AI_TELLS_FULL), _flat(ANTI_AI_TELLS_BLURB)):
        assert "No em dashes, and no substitutes for them" in rules
        assert "Ration hyphenated compounds" in rules
        assert "one per 200 words" in rules
        assert "It is a budget and not a ban" in rules


def test_the_aside_fix_reaches_the_blurb_pipeline_too():
    # `_NO_DASH_SUBSTITUTION` is shared. Rule text is shared deliberately
    # (ADR 0032); only the enforcement pass diverges.
    assert "one sentence with a subordinate clause" in _flat(ANTI_AI_TELLS_BLURB)
