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
