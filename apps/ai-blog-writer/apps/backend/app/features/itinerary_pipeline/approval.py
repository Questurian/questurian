"""Whether a day's layout approval still describes the day on screen.

The browser computes its own approval signatures in `draft.ts`, and the plan
is explicit that the server must not take a boolean's word for approval. It is
equally explicit that the two must not disagree, and two hand-written canonical
serialisations in two languages will eventually disagree -- object key order
alone is enough to do it, silently, on one field nobody thought about.

So the server does not try to reproduce the browser's string. It computes its
own signature, in Python, over the setup IT holds, and records that signature
the moment the browser hands over a day it says is approved. From then on the
server decides staleness by comparing its own signature against its own stored
one, which is a comparison it can be sure about.

What that gives up: a browser that lies at the moment of handoff is believed
once, about a setup it is itself the only source of. What it gains: every later
edit -- from any tab, through any route -- is measured by the same rules
against the same data, and cannot be talked out of.
"""

from __future__ import annotations

from .contracts import DaySnapshotModel, SetupSnapshot, stable_hash


def layout_signature(setup: SetupSnapshot, day: DaySnapshotModel) -> str:
    """Everything an approval depends on, as the server sees it.

    Both note fields are excluded, exactly as the browser excludes them. Setup
    notes and preparation notes are input to a conversation, not part of the
    structure that was approved, and making them reopen approval would punish
    the operator for thinking.

    The stays are excluded too. Changing a hotel changes where a day starts
    and ends, which the selection's own fingerprint picks up for the days it
    touches; it does not make a single layout need approving again.
    """
    return stable_hash(
        {
            "trip": setup.trip.model_dump(by_alias=True, exclude={"stays"}),
            "day": day.model_dump(
                by_alias=True,
                exclude={
                    "setup_notes",
                    "preparation_notes",
                    "approved_at",
                    "trip_revision",
                    "layout_revision",
                },
            ),
        }
    )


def claims_approval(day: DaySnapshotModel) -> bool:
    """Whether the browser handed this day over as approved.

    An approval is a pair of signatures and a timestamp. All three have to be
    there: a day carrying a timestamp and no signatures never went through the
    review screen.
    """
    return bool(day.approved_at and day.trip_revision and day.layout_revision)
