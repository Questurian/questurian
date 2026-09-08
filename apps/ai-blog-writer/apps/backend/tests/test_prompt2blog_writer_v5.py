"""Reading what the writer sent back.

The parser is deliberately cheap and deliberately forgiving. The old pipeline
paid a model to re-shape output that would not parse, and a formatting loop
that costs a writing-model call is a formatting loop that eventually costs an
article -- so every recoverable shape here is recovered with the problem named
on it, and only a reply with no prose at all is refused.
"""

from __future__ import annotations

from datetime import date

import pytest

from app.features.prompt2blog.writer_prompt import WriterPrompt
from app.features.prompt2blog.writer_v5 import (
    WriterRefused,
    parse_writer_output,
    write_article,
)

GOOD = """# Four ascensores worth the climb

Valparaiso built thirty of these. Nine still run.

## Reina Victoria

A hundred metres of track and a view of the bay.

## Research note

- https://ascensoresvalparaiso.cl -- fares, checked 7 September 2026
- Could not establish whether Concepcion has seating at the top station.
"""

PROMPT = WriterPrompt(
    prompt_fingerprint="wp-1",
    brief_fingerprint="bf-1",
    template_version="writer-prompt-1",
    style_version="short-style-1",
    target_word_count=900,
    research_date=date(2026, 9, 7),
    text="Write it.",
)


def _reply(text: str, **overrides):
    payload = {
        "text": text,
        "modelName": "claude-opus-5-20260101",
        "effort": "high",
        "costUsd": 0.42,
        "usage": {"inputTokens": 4_000, "outputTokens": 3_100},
        "elapsedSeconds": 512.4,
        "turns": 14,
        "toolDenials": [],
    }
    payload.update(overrides)
    return payload


def _writer(text: str, **overrides):
    calls: list[dict] = []

    def call(*, prompt: str, model_name: str | None = None):
        calls.append({"prompt": prompt, "model_name": model_name})
        return _reply(text, **overrides)

    call.calls = calls  # type: ignore[attr-defined]
    return call


# --- reading the reply ------------------------------------------------------


def test_the_article_and_the_note_come_apart():
    draft = parse_writer_output(GOOD)

    assert draft.headline == "Four ascensores worth the climb"
    assert "Nine still run." in draft.article_markdown
    assert "ascensoresvalparaiso.cl" in draft.research_note
    assert not draft.parse_issue


def test_the_note_never_leaks_into_the_article():
    """A research note published as body text is the failure worth guarding.

    It is a list of URLs and admissions, and it reads as prose to anything that
    only counts words.
    """
    draft = parse_writer_output(GOOD)

    assert "Research note" not in draft.article_markdown
    assert "https://" not in draft.article_markdown


def test_the_headline_is_lifted_out_of_the_body():
    draft = parse_writer_output(GOOD)

    assert not draft.article_markdown.lstrip().startswith("# Four ascensores")


def test_a_missing_note_keeps_the_article_and_says_so():
    """Recoverable, not fatal. Somebody paid for these words."""
    draft = parse_writer_output("# A headline\n\nBody text here.")

    assert draft.article_markdown == "Body text here."
    assert draft.research_note == ""
    assert "did not return a separate research note" in draft.parse_issue


def test_a_second_note_heading_does_not_split_the_article_again():
    draft = parse_writer_output(
        "# H\n\nBody.\n\n## Research note\n\n- one\n\n## Research note\n\n- two"
    )

    assert draft.article_markdown == "Body."
    assert "- one" in draft.research_note
    assert "- two" in draft.research_note
    assert "2 research-note headings" in draft.parse_issue


def test_a_differently_capitalised_heading_still_splits():
    """A model that returned "## Research Note" did what was asked.

    Refusing it would be a formatting loop over a capital letter.
    """
    draft = parse_writer_output("# H\n\nBody.\n\n## Research Note\n\n- one")

    assert draft.article_markdown == "Body."
    assert draft.research_note == "- one"


def test_an_empty_note_is_named_rather_than_hidden():
    draft = parse_writer_output("# H\n\nBody.\n\n## Research note\n")

    assert "returned empty" in draft.parse_issue


def test_an_untitled_article_is_kept_untitled():
    draft = parse_writer_output("Body with no heading at all.")

    assert draft.headline == ""
    assert draft.article_markdown == "Body with no heading at all."
    assert "no headline" in draft.parse_issue


def test_the_raw_reply_survives_every_split():
    """Nothing derived is authoritative over what actually arrived."""
    assert parse_writer_output(GOOD).raw == GOOD.strip()


def test_an_empty_reply_is_refused():
    with pytest.raises(WriterRefused):
        parse_writer_output("   ")


def test_a_note_with_no_article_is_refused():
    with pytest.raises(WriterRefused, match="no article"):
        parse_writer_output("## Research note\n\n- https://example.cl")


# --- making the call --------------------------------------------------------


def test_the_frozen_prompt_is_sent_exactly():
    """Nothing is appended here.

    The text the operator read before pressing the button is the contract this
    function keeps, and the cheap way to break it is a well-meant voice file
    stapled on at the last moment.
    """
    writer = _writer(GOOD)

    write_article(PROMPT, writer)

    assert writer.calls[0]["prompt"] == PROMPT.text


def test_the_model_is_asked_for_by_name():
    writer = _writer(GOOD)

    outcome = write_article(PROMPT, writer)

    assert writer.calls[0]["model_name"] == "claude-opus-5-high"
    assert outcome.requested_model == "claude-opus-5-high"
    assert outcome.served_model == "claude-opus-5-20260101"


def test_what_it_cost_and_how_long_it_took_come_back():
    outcome = write_article(PROMPT, _writer(GOOD))

    assert outcome.cost_usd == 0.42
    assert outcome.elapsed_seconds == 512.4
    assert outcome.turns == 14
    assert outcome.usage["outputTokens"] == 3_100


def test_a_substitution_is_recorded_rather_than_hidden(caplog):
    """Every v4 receipt said Opus while Flash wrote the article."""
    outcome = write_article(PROMPT, _writer(GOOD, modelName="gemini-2.5-flash"))

    assert outcome.requested_model == "claude-opus-5-high"
    assert outcome.served_model == "gemini-2.5-flash"


def test_an_effort_suffix_is_not_mistaken_for_a_substitution(caplog):
    """`claude-opus-5-high` asking and `claude-opus-5-20260101` answering is
    the same model: the request carries an effort the reply never does."""
    with caplog.at_level("WARNING"):
        write_article(PROMPT, _writer(GOOD))

    assert "substituted" not in caplog.text


def test_a_withheld_tool_reaches_the_outcome():
    outcome = write_article(PROMPT, _writer(GOOD, toolDenials=["Bash"]))

    assert outcome.tool_denials == ["Bash"]


def test_an_unusable_reply_raises_with_the_words_attached():
    with pytest.raises(WriterRefused) as caught:
        write_article(PROMPT, _writer("## Research note\n\n- only a note"))

    assert "only a note" in caught.value.raw
