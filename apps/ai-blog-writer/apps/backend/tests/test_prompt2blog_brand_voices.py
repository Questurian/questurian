"""Invariants for the brand voice catalog.

Brand voice and tone are concatenated into the same STYLE DIRECTIVE block, so
a brand voice that restates tone sends the model two competing style vectors.
Brand voice owns only what is invariant across every tone: banned lexicon,
point of view, fact rendering, structure, and hedging.
"""

from __future__ import annotations

from app.features.prompt2blog.config import PROMPT2BLOG_BRAND_VOICES_DIR
from app.features.prompt2blog.options import (
    _default_option,
    _read_markdown_option_files,
)

SHIPPED_BRAND_VOICE_IDS = {"local-insider", "news-desk", "questurian-default"}


def _voices() -> list[dict]:
    return _read_markdown_option_files(PROMPT2BLOG_BRAND_VOICES_DIR)


def test_every_shipped_brand_voice_id_still_resolves():
    # Saved composer state and stored runs reference these ids.
    assert {voice["id"] for voice in _voices()} == SHIPPED_BRAND_VOICE_IDS


def test_exactly_one_brand_voice_is_flagged_default():
    voices = _voices()
    flagged = [voice["id"] for voice in voices if voice["default"]]

    assert flagged == ["questurian-default"]
    # brand_voice_id is optional on the request; an unflagged catalog would
    # make _resolve_input_options fall through to whatever sorted first.
    assert _default_option(voices)["id"] == "questurian-default"


def test_every_brand_voice_declares_precedence_over_tone():
    # Without this the two blocks read as equally weighted suggestions.
    for voice in _voices():
        assert "tone" in voice["instructions"].lower(), voice["id"]


def test_every_brand_voice_carries_the_house_rule_categories():
    # These are the categories that make brand voice distinct from tone. A
    # voice missing one silently stops constraining that dimension.
    for voice in _voices():
        body = voice["instructions"].lower()
        assert "never use" in body, f"{voice['id']} has no banned lexicon"
        assert "facts:" in body, f"{voice['id']} has no fact-rendering rules"
        assert "structure:" in body, f"{voice['id']} has no structural rules"
        assert "hedging" in body, f"{voice['id']} has no hedging rule"


def test_brand_voices_stay_dense_enough_to_be_worth_injecting():
    # They ship in every prompt call, so they are budgeted, but the previous
    # one-sentence versions carried almost no signal.
    for voice in _voices():
        words = len(voice["instructions"].split())
        assert 150 <= words <= 400, f"{voice['id']} is {words} words"


def test_every_brand_voice_has_a_dropdown_description():
    for voice in _voices():
        assert voice["description"], voice["id"]
        assert len(voice["description"]) <= 80, voice["id"]


def test_no_brand_voice_asks_takeaways_to_introduce_new_facts():
    """All three voices used to demand "new specifics" in the closing section.

    On a Medellin run that produced genuine leftovers -- an annual visitor
    count for Comuna 13 and arithmetic between two mondongo prices -- facts
    that are true and sourced but are not the decisions a first-time traveler
    is making. Takeaways synthesise what the body already supported; a reader
    should never meet a material fact for the first time in a summary. Three
    copies of the rule means fixing one leaves two live.
    """
    banned = (
        "new specifics",
        "new factual specifics",
    )
    for voice in _voices():
        body = voice["instructions"].lower()
        for phrase in banned:
            assert phrase not in body, f"{voice['id']} still asks for {phrase!r}"
        assert "takeaway" in body, f"{voice['id']} lost its takeaways rule"


def test_no_brand_voice_tells_the_writer_to_name_a_source():
    """The same sentence had to be fixed in all three voices on 2026-08-27.

    `questurian-default` said an unconfirmed detail is "either attributed in the
    sentence or cut", `local-insider` carried the identical line, and
    `news-desk` was built on "according to". That instruction produced four
    named publications in the Lima food article while the house rules and the
    voice rules both banned exactly that. Three copies meant fixing one left two
    live, which is how it survived a rule that already forbade it.
    """
    banned = (
        "attributed in the sentence",
        "according to",
        "sources report",
        "carries its source",
    )
    for voice in _voices():
        body = voice["instructions"].lower()
        for phrase in banned:
            # A voice may quote the phrase to ban it; it may not ask for it.
            if phrase not in body:
                continue
            index = body.find(phrase)
            window = body[max(0, index - 120) : index]
            assert any(
                marker in window
                for marker in ("no ", "never", "not an actor", "cut,", "banned")
            ), f"{voice['id']} still asks for \"{phrase}\""


def test_every_brand_voice_cuts_rather_than_attributes_an_unconfirmed_detail():
    # The rule only holds if all three say it. One voice quietly keeping the
    # old branch is the failure mode this pins.
    for voice in _voices():
        body = voice["instructions"].lower()
        assert (
            "cut" in body
        ), f"{voice['id']} does not say what happens to an unconfirmed detail"
        assert "outlet" in body or "publication" in body, (
            f"{voice['id']} never mentions the outlet it must not name"
        )
