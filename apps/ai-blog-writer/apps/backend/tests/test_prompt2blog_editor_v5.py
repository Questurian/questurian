"""Reading the editor's reply, and the ways a reply is not a review.

The parser is forgiving on purpose: losing one malformed finding costs one
finding, and refusing the whole reply costs the call. The two things it will
not forgive are an empty reply and a reply carrying neither findings nor a
verdict, because both of those read as "nothing wrong with this article" and
that is the one wrong answer the detection phase cannot afford.
"""

from __future__ import annotations

import pytest

from app.features.prompt2blog.contracts_v4 import ArticleBrief
from app.features.prompt2blog.editor_v5 import (
    SEVERITIES,
    ReviewRefused,
    build_editor_prompt,
    parse_review,
)

WELL_FORMED = """### FINDING
LABEL: Museum price wrong by threefold
SEVERITY: serious
QUOTE: admission is 11,000 pesos
PROBLEM: It is 4,000. The whole recommendation rests on the wrong number.

### FINDING
LABEL: Two different network totals
SEVERITY: minor
QUOTE: sixteen structures
PROBLEM: One paragraph says sixteen, another says fifteen.

### FINDING
LABEL: Narrates its own sourcing
SEVERITY: notable
QUOTE: WHOLE ARTICLE
PROBLEM: It tells the reader what it could not confirm.

### VERDICT
Good on the walk, wrong on the money.
"""


def _brief() -> ArticleBrief:
    return ArticleBrief.model_validate(
        {
            "brief_fingerprint": "bf-1",
            "seed": "Two nights in Lima",
            "location": "Lima, Peru",
            "form_id": "destination-guide",
            "topic_module_ids": [],
            "reader": {"primary_reader": "layover traveller", "tags": []},
            "reader_question": "Is Lima worth two extra nights?",
            "outcome": "book two extra nights",
            "spine": "food, cheap beats famous",
            "must_name": ["Surquillo market"],
            "fails_if": "reads like a tourist board",
            "material": [{"kind": "firsthand", "statement": "I was there."}],
        }
    )


def test_findings_come_back_worst_first():
    """So a list can be triaged from the top without sorting it again."""
    review = parse_review(WELL_FORMED, draft_version="dv-1")

    assert [item.severity for item in review.findings] == list(SEVERITIES)
    assert review.verdict == "Good on the walk, wrong on the money."
    assert review.parse_issue == ""


def test_whole_article_findings_say_so():
    review = parse_review(WELL_FORMED, draft_version="dv-1")
    anchored = {item.label: item.whole_article for item in review.findings}

    assert anchored["Narrates its own sourcing"] is True
    assert anchored["Museum price wrong by threefold"] is False


def test_a_malformed_finding_is_dropped_and_counted_rather_than_fatal():
    """Losing one finding costs one finding. Refusing costs the call."""
    reply = WELL_FORMED.replace("PROBLEM: One paragraph says sixteen", "One paragraph says sixteen")

    review = parse_review(reply, draft_version="dv-1")

    assert len(review.findings) == 2
    assert "1 finding(s) came back in a shape this could not read" in review.parse_issue
    # The dropped one is still readable in the raw reply.
    assert "sixteen structures" in review.raw


def test_an_unrecognised_severity_is_filed_in_the_middle_not_dropped():
    """A real fault lost over a mistyped word is worse than one filed wrong."""
    reply = WELL_FORMED.replace("SEVERITY: serious", "SEVERITY: critical")

    review = parse_review(reply, draft_version="dv-1")

    assert len(review.findings) == 3
    filed = {item.label: item.severity for item in review.findings}
    assert filed["Museum price wrong by threefold"] == "notable"


def test_a_clean_read_is_a_result_and_not_an_error():
    """An editor that believes it must return something always will."""
    review = parse_review(
        "### VERDICT\nNothing wrong with this one.", draft_version="dv-1"
    )

    assert review.findings == []
    assert review.verdict == "Nothing wrong with this one."
    assert review.parse_issue == ""


def test_findings_without_a_verdict_are_kept_and_the_gap_is_named():
    reply = WELL_FORMED.split("### VERDICT")[0]

    review = parse_review(reply, draft_version="dv-1")

    assert len(review.findings) == 3
    assert "no overall verdict" in review.parse_issue


def test_an_empty_reply_is_refused():
    with pytest.raises(ReviewRefused):
        parse_review("   ", draft_version="dv-1")


def test_neither_findings_nor_a_verdict_is_refused_rather_than_read_as_clean():
    """This is what a refusal looks like, and it arrives as a success.

    Read as a review it would be filed as an article with nothing wrong, which
    is the one wrong answer this phase cannot afford: the signal it runs on,
    saying all clear.
    """
    with pytest.raises(ReviewRefused) as caught:
        parse_review("I'm sorry, I can't help with that.", draft_version="dv-1")

    assert "not a review" in str(caught.value)
    assert caught.value.raw == "I'm sorry, I can't help with that."


def test_the_raw_reply_is_kept_whatever_happens():
    review = parse_review(WELL_FORMED, draft_version="dv-1")
    assert review.raw.strip() == WELL_FORMED.strip()


def test_the_assignment_carries_the_brief_the_article_and_the_note():
    """Somebody who disagrees with a finding must be able to read the ask."""
    prompt = build_editor_prompt(
        _brief(), "The article body.", "- https://example.pe"
    )

    assert "Is Lima worth two extra nights?" in prompt
    assert "- Surquillo market" in prompt
    assert "The article body." in prompt
    assert "https://example.pe" in prompt
    # Detection only, said in the assignment itself rather than only in a docstring.
    assert "not proposing replacement text" in prompt


def test_a_missing_research_note_says_so_rather_than_reading_as_empty():
    assert "None was returned." in build_editor_prompt(_brief(), "Body.", "   ")
