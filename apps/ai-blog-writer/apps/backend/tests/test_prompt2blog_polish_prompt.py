"""The prompt the operator carries to a flagship model, with the article.

The run already knows everything wrong with what it wrote. All of it was
recorded where nobody read it.
"""

from __future__ import annotations

from app.features.prompt2blog.contracts_v4 import (
    ArticleBrief,
    BriefMaterial,
    BriefReader,
)
from app.features.prompt2blog.polish_v4 import build_polish_prompt

BRIEF = ArticleBrief(
    brief_fingerprint="bf-1",
    seed="Lima is no longer simply the stopover before Cusco",
    location="Lima",
    form_id="curated-list-best-of",
    reader=BriefReader(primary_reader="First timers with three days"),
    reader_question="Is Lima worth days away from Cusco?",
    outcome="Extend the transit into a two or three day stay",
    spine="Lima is a destination in its own right",
    must_name=["Lima", "Cusco"],
    material=[BriefMaterial(kind="research", statement="ive been twice")],
    fails_if="It reads like a generic city guide",
)

METERED = {
    "sentence_count": 75,
    "sentence_widest_band_share": 0.57,
    "sentences_over_25_words": 1,
}


def _prompt(**overrides) -> str:
    kwargs = dict(
        brief=BRIEF,
        article_markdown="## A heading\n\nSome prose.",
        title="Lima is no longer simply the stopover before Cusco",
        constraint_checks=METERED,
        readiness_blockers=[],
    )
    kwargs.update(overrides)
    return build_polish_prompt(**kwargs)


def test_it_carries_the_brief_and_not_only_the_complaints():
    """Told only "the sentences are too uniform", a model smooths the prose and
    quietly drifts the piece."""
    prompt = _prompt()

    assert "First timers with three days" in prompt
    assert "Is Lima worth days away from Cusco?" in prompt
    assert "Lima is a destination in its own right" in prompt


def test_the_fails_if_line_is_named_as_the_test():
    prompt = _prompt()

    assert "IT FAILS IF: It reads like a generic city guide" in prompt
    assert "That last line is the test" in prompt


def test_the_measured_spread_becomes_an_instruction_with_its_numbers():
    prompt = _prompt()

    assert "57% of the 75 sentences sit within five words" in prompt
    assert "1 run past 25 words" in prompt
    assert "Join related facts into longer sentences" in prompt
    assert "Do not cut anything to do it" in prompt


def test_varied_prose_is_not_complained_about():
    prompt = _prompt(
        constraint_checks={
            "sentence_count": 75,
            "sentence_widest_band_share": 0.28,
            "sentences_over_25_words": 9,
        }
    )

    assert "too uniform" not in prompt
    assert "Nothing measurable is wrong with it" in prompt


def test_the_bans_a_chatbot_would_break_by_accident_are_stated():
    """Asked to improve rhythm, a model reaches for an em dash within a
    sentence or two. Saying so is cheaper than reading the result."""
    prompt = _prompt()

    assert "No em dashes" in prompt
    assert "No hyphenated compounds" in prompt
    assert "em dashes now read as a sign of AI writing" in prompt


def test_it_forbids_inventing_anything_to_fix_the_prose():
    prompt = _prompt()

    assert "Invent nothing" in prompt
    assert "Keep every fact, figure and proper noun exactly as it is" in prompt


def test_readiness_blockers_and_audit_problems_join_the_list():
    prompt = _prompt(
        readiness_blockers=["It is forty one words long."],
        audit_problems=["The third section repeats the second."],
    )

    assert "2. It is forty one words long." in prompt
    assert "3. The third section repeats the second." in prompt


def test_the_article_travels_with_it_so_one_paste_is_enough():
    prompt = _prompt(article_markdown="## The elevation contrast\n\nCusco sits high.")

    assert "## The elevation contrast" in prompt
    assert "Cusco sits high." in prompt


def test_it_asks_for_the_article_back_and_nothing_else():
    prompt = _prompt()

    assert "Return the complete edited article as markdown, and nothing else" in prompt
    assert "no list of edits" in prompt


def test_a_length_miss_says_which_way_it_missed():
    prompt = _prompt(
        constraint_checks={
            **METERED,
            "target_word_count_met": False,
            "word_count_direction": "under",
            "word_count_delta": -180,
        }
    )

    assert "180 words under the agreed length" in prompt
    assert "never by inventing facts" in prompt
