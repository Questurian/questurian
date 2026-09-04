"""Reading the search order back off a finished interview.

The grill's `consensus` is prose, written to be read by a person. It is the
wrong thing to execute: a number parsed out of a sentence is a number that can
be parsed wrong, and silently.

The answers themselves are structured enough. Every question declares the
marker it settles, so the answer to `count` is the count and the answer to
`angles` is the angle list, one per line -- which is exactly how the picker
sends them and why the picker sends lines instead of a paragraph.
"""

from __future__ import annotations

import re

from ..prompt2blog.contracts_v4 import GrillState


def _answer_for(state: GrillState, marker: str) -> str:
    """The last thing said about one marker.

    Last rather than first: a marker asked about twice was asked again because
    something was wrong with the first answer.
    """
    for turn in reversed(state.turns):
        if turn.question.asks_about == marker:
            return turn.answer.strip()
    return ""


def angles_from(state: GrillState) -> list[str]:
    """The agreed angles, one per line, in the order they were chosen."""
    raw = _answer_for(state, "angles")
    lines = [re.sub(r"^[\-\*•\d\.\)\s]+", "", line).strip() for line in raw.splitlines()]
    return [line for line in lines if line]


def count_from(state: GrillState, default: int = 20) -> int:
    """How many items the list is aiming at.

    Read from the count answer, and from the seed when the interview settled
    the count without anyone restating the number -- "Yes, that's right" is a
    perfectly good answer to "is 40 the number?" and carries no number at all.
    """
    for text in (_answer_for(state, "count"), state.seed):
        numbers = [int(n) for n in re.findall(r"\b(\d{1,3})\b", text)]
        # Ignore years and other incidental numbers; a list length is small.
        plausible = [n for n in numbers if 3 <= n <= 200]
        if plausible:
            return max(plausible)
    return default


def kind_from(state: GrillState) -> str:
    """The searchable noun. Falls back to the seed, which usually carries it."""
    return _answer_for(state, "kind") or state.seed


def place_from(state: GrillState) -> str:
    return _answer_for(state, "place") or state.location or state.seed


def standard_from(state: GrillState) -> str:
    return _answer_for(state, "bar")


def exclusions_from(state: GrillState) -> str:
    return _answer_for(state, "cut")
