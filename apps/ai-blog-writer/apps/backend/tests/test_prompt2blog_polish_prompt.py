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
    # The instruction that follows the numbers is covered by the joining tests
    # below; what this one holds is that the measurement reaches the prompt as
    # a sentence with its own figures in it.
    assert "The sentences are too uniform." in prompt
    assert "cutting content is never the fix" in prompt


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


# --- how to lengthen a sentence, not only what it cannot use ---------------


def test_the_uniformity_fix_names_joining_and_rules_out_splitting():
    """Told "vary the rhythm" and "no dashes" in one breath, a model has one
    tool left: the full stop.

    A version of the Medellin article came back from an outside model with 65
    sentences where the pipeline wrote 54, a spread of 5.0 where the pipeline
    had 7.7, and zero sentences over 25 words where the pipeline had six. Every
    cut landed on a subordinate clause.
    """
    prompt = _prompt()

    assert "joining, never by splitting" in prompt
    assert "Length comes from subordination." in prompt
    # The connectives, named. "Join related facts" alone leaves the model to
    # work out how, and splitting is the easier guess.
    for word in ("because", "which", "while", "after", "so that"):
        assert word in prompt


def test_it_says_a_split_makes_the_measurement_worse():
    """The instruction and the measurement have to agree.

    Cutting a long sentence in two raises the sentence count and narrows the
    spread, so a model doing what it was asked would move the number the wrong
    way and think it had complied.
    """
    prompt = _prompt()

    assert "makes this measurement worse" in prompt


def test_the_dash_ban_says_what_to_reach_for_instead():
    """A ban with no replacement is why the full stop won.

    `anti_ai_tells.py` had the same trap until `2bd89fb1`: the only escape it
    offered from an aside was "split it", and the model generalised that one
    option into a house style.
    """
    prompt = _prompt()

    assert "not a reason to reach for a full stop" in prompt
    assert "subordinate clause, not two sentences" in prompt
    # Long sentences are wanted. Without this the ban reads as a length limit.
    assert "Long sentences are wanted" in prompt


def test_a_clean_article_is_not_told_how_to_lengthen_anything():
    """The advice rides on the complaint. No complaint, no advice."""
    prompt = _prompt(
        constraint_checks={
            "sentence_count": 60,
            "sentence_widest_band_share": 0.3,
            "sentences_over_25_words": 6,
        }
    )

    assert "joining, never by splitting" not in prompt
    # The dash rule is a house rule and stays regardless.
    assert "not a reason to reach for a full stop" in prompt


def test_splitting_really_does_make_the_spread_worse():
    """The prompt tells the model a split moves the number the wrong way.

    That claim has to be true, or the instruction is asking a model to trust
    an assertion the measurement would contradict. These are the two versions
    of the same passage from issue #443, joined and then split at the joint,
    measured by the function that produces the number the prompt quotes.

    Splitting loses on every measure at once: the spread collapses, the long
    sentence disappears, and the crowding share -- which is the metronome,
    measured, and where high is bad -- goes UP. A model that split its way
    through the article would think it had complied.
    """
    from app.features.prompt2blog.quality import measure_sentence_spread

    joined = (
        "Cusco sits at 3,399 meters. "
        "Lima averages between 101 and 161, which is the difference between "
        "arriving and arriving able to do anything, because tourists who fly "
        "straight to the Andes often meet a pounding headache within 6 to 24 "
        "hours, followed by nausea, dizziness and fatigue that take up to two "
        "days of rest and water to clear. "
        "You lose the start of your trip to a hotel bed."
    )
    split = (
        "Cusco sits at 3,399 meters. "
        "Lima averages between 101 and 161. "
        "That is the difference between arriving and arriving able to do "
        "anything. "
        "Tourists who fly straight to the Andes often meet a pounding headache "
        "within 6 to 24 hours. "
        "Nausea, dizziness and fatigue follow. "
        "These take up to two days of rest and water to clear. "
        "You lose the start of your trip to a hotel bed."
    )

    before = measure_sentence_spread(joined)
    after = measure_sentence_spread(split)

    assert after["sentence_stdev_words"] < before["sentence_stdev_words"]
    assert after["sentences_over_25_words"] < before["sentences_over_25_words"]
    assert after["sentence_widest_band_share"] > before["sentence_widest_band_share"]
