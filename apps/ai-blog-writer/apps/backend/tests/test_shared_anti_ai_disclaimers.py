"""Provenance belongs in the evidence record, not in the sentence.

The rule these tests pin came from a real reading of the output: an article
that keeps explaining how confident to be reads like a database, not like a
person. The fix is not less accuracy — accuracy is settled before the writing
starts — it is that the reader never sees the working.
"""

from app.shared.prompts.anti_ai_tells import (
    ANTI_AI_TELLS_BLURB,
    ANTI_AI_TELLS_FULL,
)


def test_both_voice_variants_ban_defensive_caveats():
    for rules in (ANTI_AI_TELLS_FULL, ANTI_AI_TELLS_BLURB):
        assert "Banned disclaimers" in rules
        assert "based on my own experience" in rules
        assert "your experience may vary" in rules
        assert "this is not an average" in rules


def test_the_rule_bans_narrating_a_research_gap():
    for rules in (ANTI_AI_TELLS_FULL, ANTI_AI_TELLS_BLURB):
        assert "no official figures exist for" in rules
        assert "never narrate the gap" in rules


def test_the_rule_spares_first_person_writing():
    # Personal essays and travelogues are first person by form, and an operator
    # answering a question from their own trip is a fact like any other. Banning
    # the hedge must not ban the voice.
    for rules in (ANTI_AI_TELLS_FULL, ANTI_AI_TELLS_BLURB):
        assert "This bans hedging, not first person." in rules
        assert "I waited twenty five minutes at customs" in rules


def test_the_rule_bans_hiding_behind_a_publication():
    """The Lima food article named an outlet four times and passed every check.

    "Banned disclaimers" already covered hedging about the writer's own
    confidence. It did not cover putting a publication between the writer and
    the claim, which is the same move in a press badge.
    """
    for rules in (ANTI_AI_TELLS_FULL, ANTI_AI_TELLS_BLURB):
        assert "sources report," in rules
        assert "outlets anticipate," in rules
        assert "the publication noted," in rules
        assert "according to," in rules


def test_the_rule_spares_a_named_actor_in_the_story():
    # "PromPeru confirmed the date" is the story. "One outlet framed" is not.
    # Banning the outlet must not ban the institution that acted.
    for rules in (ANTI_AI_TELLS_FULL, ANTI_AI_TELLS_BLURB):
        assert "A named person or institution who acts in the story stays" in rules
        assert "the outlet that wrote it up does not" in rules


def test_the_rule_bans_reporting_the_gap_as_the_subjects_silence():
    # "There is no public data on X" and "X does not publish it" are the same
    # sentence pointed at a different noun. The first was already banned.
    for rules in (ANTI_AI_TELLS_FULL, ANTI_AI_TELLS_BLURB):
        assert "does not publish," in rules
        assert "has not disclosed," in rules
        assert "is not public information," in rules
        assert "Write what the subject does do, or say nothing." in rules


def test_the_rule_keeps_research_vocabulary_off_the_page():
    # "Merito's sampled booking flow uses a S/551 guarantee" shipped to a
    # reader. None of these words describe the restaurant.
    for rules in (ANTI_AI_TELLS_FULL, ANTI_AI_TELLS_BLURB):
        assert '"sampled" booking flows or menus' in rules
        assert '"data points,"' in rules
        assert '"evidence records,"' in rules
        assert '"an estimate rather than a guaranteed bill"' in rules


def test_every_phrase_the_validator_rejects_is_named_in_the_prompt():
    """The check and the instruction must not drift apart.

    The validator is shared: url2blog, youtube2blog and editor_assist all run
    it, but their writers only ever see this block. A pattern enforced here
    and unstated there costs every one of them a repair call for a rule they
    were never given.
    """
    from app.shared.text.normalize import validate_anti_ai_tells_markdown

    # One sentence per research-meta pattern the validator carries.
    rejected = (
        "Central does not publish the course names.",
        "Kjolle has not disclosed the autumn menu.",
        "The price is not publicly available.",
        "There is no public data on the counter seats.",
        "The closing time could not be confirmed.",
        "At the time of writing the room seats forty.",
        "Two data points put the bill near S/500.",
        "The number is an estimate rather than a guaranteed bill.",
    )
    for sentence in rejected:
        assert not validate_anti_ai_tells_markdown(sentence).valid, sentence

    # And the prompt has to say so, in both variants, before a writer is
    # judged against it.
    for rules in (ANTI_AI_TELLS_FULL, ANTI_AI_TELLS_BLURB):
        for phrase in (
            "does not publish",
            "has not disclosed",
            "is not public information",
            "is not publicly available",
            "could not be confirmed",
            "at the time of writing",
            "data points",
        ):
            assert phrase in rules, phrase
