"""What changed factually between a section and its proposed replacement.

A text diff answers "what words moved". An editor deciding whether to keep a
proposal is asking something else: did a price get attached to a different
thing, did a date fall out of a sentence that needed it, did a caveat go, did a
recommendation get stronger than the evidence supports.

Two kinds of answer, kept apart on purpose.

**Text changes** are computed here, deterministically, from the two strings. A
figure that is in one and not the other; a date that is gone; a qualifying
phrase that is no longer there; a negation that appeared or vanished. These are
exact and they are cheap, and they are labelled as what they are: differences
in text. A regex noticing that "only" is missing has not reasoned about
anything, and presenting it as though it had is how a panel becomes trusted for
something it cannot do.

**The review** is the reading. It is the checker's verdict from `edit_review`,
which judges what the new text asserts against the records. It is the half that
can say the prices were swapped, because that is invisible to any comparison of
sets: every figure is present in both.

Neither replaces the other. "Same numbers" must not mean "same facts", and
"different numbers" must not mean "wrong". The panel shows both and says which
is which.

Bound, like the review, to the exact candidate and the article revision. An
operator reading a panel for older text must not be able to apply newer text
under it.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from .edit_review import EditReview, candidate_hash
from .provenance import _figures

# A month name, or a written date. Deliberately narrower than "anything with
# digits in it": a bare year is already a figure, and counting it twice would
# make a panel that repeats itself.
_MONTHS = (
    "january|february|march|april|may|june|july|august|september|october|"
    "november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec"
)
# The day part refuses to eat the first two digits of a year: without the
# lookahead, "March 2026" parses as the 20th of March and the year is lost.
_DATE = re.compile(
    rf"\b(?:{_MONTHS})\b(?:\s+\d{{1,2}}(?!\d))?(?:,?\s*(?:19|20)\d{{2}})?"
    r"|\b\d{4}-\d{2}-\d{2}\b",
    re.IGNORECASE,
)

# The phrases that limit a claim. Multi-word wherever a single word would fire
# on ordinary prose: "only" alone appears in half the sentences ever written,
# and a panel that reports it every time is a panel nobody reads.
_QUALIFIERS = (
    "as of",
    "at the time of",
    "in high season",
    "in low season",
    "high season only",
    "low season only",
    "seasonally",
    "subject to",
    "depending on",
    "per person",
    "per night",
    "some operators",
    "not all",
    "except",
    "unless",
    "check before",
    "may change",
    "can change",
    "roughly",
    "approximately",
    "about",
    "up to",
    "at least",
)

# A flip of sense. These are single words because a negation is a single word,
# and losing one is exactly the change a reader would act on.
_NEGATIONS = (
    "not",
    "never",
    "no",
    "cannot",
    "can't",
    "don't",
    "do not",
    "rarely",
    "seldom",
    "avoid",
    "without",
)


@dataclass(frozen=True)
class TextChange:
    """One difference in text. Not a judgement about meaning."""

    kind: str
    text: str
    note: str = ""

    def as_dict(self) -> dict[str, str]:
        return {"kind": self.kind, "text": self.text, "note": self.note}


@dataclass(frozen=True)
class FactualChanges:
    """The panel: what the text says differently, and what a checker made of it."""

    text_changes: list[TextChange] = field(default_factory=list)
    review: EditReview | None = None
    candidate_hash: str = ""
    base_revision: int = -1

    @property
    def review_status(self) -> str:
        return self.review.status if self.review is not None else "unchecked"

    def as_dict(self) -> dict[str, Any]:
        return {
            # Named so the label travels with the data. A caller rendering
            # this cannot accidentally present a regex match as reasoning.
            "text_changes": [change.as_dict() for change in self.text_changes],
            "text_changes_are": (
                "exact differences between the two texts, not a judgement "
                "about whether the change is wrong"
            ),
            "review": self.review.model_dump(mode="json") if self.review else None,
            "review_status": self.review_status,
            "candidate_hash": self.candidate_hash,
            "base_revision": self.base_revision,
        }


def _normalised(text: str) -> str:
    return " ".join(text.split()).casefold()


def _phrases_in(text: str, phrases: tuple[str, ...]) -> set[str]:
    haystack = _normalised(text)
    return {
        phrase
        for phrase in phrases
        if re.search(rf"(?<!\w){re.escape(phrase)}(?!\w)", haystack)
    }


def _dates_in(text: str) -> set[str]:
    return {" ".join(match.group(0).split()).casefold() for match in _DATE.finditer(text)}


def _outside_dates(figures: set[str], dates: set[str]) -> set[str]:
    return {
        figure
        for figure in figures
        if not any(figure in date for date in dates)
    }


def text_changes(original: str, candidate: str) -> list[TextChange]:
    """Every exact difference worth showing, and nothing else.

    Set differences only. Prose that says the same thing in different words
    produces no entries, which is the point: a panel that fires on every edit
    teaches an editor to skip it, and then it is not there on the one that
    mattered.
    """
    changes: list[TextChange] = []

    before_dates = _dates_in(original)
    after_dates = _dates_in(candidate)
    # A year inside a date is reported as a date, not also as a figure. Both
    # entries describe the same removal, and a panel that says the same thing
    # twice is a panel that reads as noisier than the change was.
    before_figures = _outside_dates(_figures(original), before_dates)
    after_figures = _outside_dates(_figures(candidate), after_dates)
    for figure in sorted(after_figures - before_figures):
        changes.append(
            TextChange(
                kind="figure_added",
                text=figure,
                note="This figure is not in the section as it stands.",
            )
        )
    for figure in sorted(before_figures - after_figures):
        changes.append(
            TextChange(
                kind="figure_removed",
                text=figure,
                note="This figure is in the section now and not in the proposal.",
            )
        )

    for date in sorted(before_dates - after_dates):
        changes.append(
            TextChange(
                kind="date_removed",
                text=date,
                note="A date the section carries is gone from the proposal.",
            )
        )
    for date in sorted(after_dates - before_dates):
        changes.append(
            TextChange(
                kind="date_added",
                text=date,
                note="A date the section does not carry appears in the proposal.",
            )
        )

    before_qualifiers = _phrases_in(original, _QUALIFIERS)
    after_qualifiers = _phrases_in(candidate, _QUALIFIERS)
    for phrase in sorted(before_qualifiers - after_qualifiers):
        changes.append(
            TextChange(
                kind="qualification_removed",
                text=phrase,
                note="A phrase that limited a claim is no longer there.",
            )
        )

    before_negations = _phrases_in(original, _NEGATIONS)
    after_negations = _phrases_in(candidate, _NEGATIONS)
    for phrase in sorted(before_negations - after_negations):
        changes.append(
            TextChange(
                kind="negation_removed",
                text=phrase,
                note="A negation the section carries is gone from the proposal.",
            )
        )
    for phrase in sorted(after_negations - before_negations):
        changes.append(
            TextChange(
                kind="negation_added",
                text=phrase,
                note="A negation the section does not carry appears in the proposal.",
            )
        )

    return changes


def factual_changes(
    *,
    original: str,
    candidate: str,
    review: EditReview | None,
    base_revision: int,
) -> FactualChanges:
    """The whole panel, bound to the exact candidate it describes.

    No model call of its own. The reading half is the review that was already
    made when the proposal was; adding a second permanent AI stage to explain
    the first one would be paying twice to answer the same question.
    """
    return FactualChanges(
        text_changes=text_changes(original, candidate),
        review=review,
        candidate_hash=candidate_hash(candidate),
        base_revision=base_revision,
    )
