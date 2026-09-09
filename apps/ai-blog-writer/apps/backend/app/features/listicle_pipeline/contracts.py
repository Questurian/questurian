"""What a listicle interview has to settle, and what it settles into.

The article grill settles a vision: what the piece is for, who reads it, what
would make it a failure. This settles a specification: what kind of place,
where, how many, what earns a spot, what is barred, and which angles the list
gets built from.

Same six-marker shape, same stop condition, deliberately different contents.
The two are not interchangeable and neither is a mode of the other -- an
article is judged on whether it reads well, which was never provable; a list
is judged on whether every item is real, current and earns its place, which
is checkable.

The records below are the second half of that. An interview that has agreed is
prose plus a transcript, and prose is the wrong thing to execute: the first
real run agreed on twenty items and searched for forty, because the number was
read back out of a sentence. The order is what the searches actually run from,
it is written down once, and every result files against the revision it was
run under.
"""

from __future__ import annotations

import hashlib

from pydantic import BaseModel, ConfigDict, Field

# (marker, the field it fills on the spec, how it is said to a person)
LISTICLE_MARKERS: tuple[tuple[str, str, str], ...] = (
    ("kind", "listicle_type", "what kind of place the list is about"),
    ("place", "location", "where, and how wide an area"),
    ("count", "target_item_count", "how many items"),
    ("bar", "selection_standard", "what earns a place on the list"),
    ("cut", "exclusions", "what is out no matter how good it is"),
    ("angles", "tropes", "the angles the list gets built from"),
)

LISTICLE_MARKER_KEYS: tuple[str, ...] = tuple(m for m, _, _ in LISTICLE_MARKERS)

# The three jobs an angle can do. Named here as well as in `search` because
# the order is what carries them; `search` is what spends against them.
ANGLE_ROLES: tuple[str, ...] = ("broad", "distinctive", "specific")


class ListicleModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SelectedAngle(ListicleModel):
    """One approved search, with its identity kept.

    `angle_id` is stable across revisions of an order so an attempt, a retry
    and a result all point at the same search. `text` is the wording the
    operator approved, stored exactly -- including a narrowing they wrote
    deliberately, which is theirs and is not repaired.

    `edited` is what makes the catalogue's opinion about this angle
    provisional. A line the operator rewrote may no longer mean what its shape
    meant, so the overlap guidance that came with the shape is shown as
    uncertain rather than asserted.
    """

    angle_id: str = Field(min_length=1)
    text: str = Field(min_length=1)
    shape_key: str = ""
    group: str = ""
    role: str = "broad"
    # What this angle is asked for. Filled when the order is built, from the
    # role and the target; kept on the record so a stored result can be
    # compared against what was actually requested.
    wanted: int = 0
    edited: bool = False
    # Set when the angle was written by the operator rather than chosen from
    # the menu. Never repaired, never re-grouped.
    custom: bool = False


class SearchOrder(ListicleModel):
    """The agreement, in the form the searches run from.

    This is the source of truth the plan of 2026-09-08 asked for. The displayed
    summary is derived from it and the searches are executed from it, so the
    two cannot disagree -- which they did, in the only real run there has been.
    """

    run_id: str = Field(min_length=1)
    revision: int = 1
    kind: str = ""
    place: str = ""
    target_count: int = 20
    standard: str = ""
    exclusions: str = ""
    angles: list[SelectedAngle] = Field(default_factory=list)
    # How the count was settled, and whether anyone should look at it again.
    # An interview that answered "20, not 40" is unambiguous; one that answered
    # "somewhere between 20 and 40" is not, and the difference must reach the
    # screen rather than being resolved by whichever number happened to be
    # larger.
    count_source: str = "default"
    count_ambiguous: bool = False
    count_note: str = ""
    # Markers the interview answered more than once, and what was done about
    # it. A repeat used to be resolved by taking the last answer and saying
    # nothing, which is how an additive follow-up about the cut could delete
    # three quarters of it and leave a run that looked entirely normal. The
    # resolution is now a decision, and a decision has to be visible or it is
    # just the old silence with more code behind it.
    answer_notes: list[str] = Field(default_factory=list)

    def fingerprint(self) -> str:
        """What has to match for a stored result to still be this order's.

        Angle wording, the shared requirements, the place and the kind. Change
        any of them and the request a stored result answered is not the request
        this order makes, so the result is not reused.
        """
        material = "␟".join(
            [
                self.kind.strip(),
                self.place.strip(),
                self.standard.strip(),
                self.exclusions.strip(),
            ]
        )
        return hashlib.sha256(material.encode("utf-8")).hexdigest()[:16]

    def angle_fingerprint(self, angle: SelectedAngle) -> str:
        """What has to match for one angle's stored result to still be current."""
        material = "␟".join(
            [self.fingerprint(), angle.text.strip(), str(angle.wanted)]
        )
        return hashlib.sha256(material.encode("utf-8")).hexdigest()[:16]


# The states one angle's search can be in. `interrupted` is the one that gets
# forgotten: a request that was sent and whose answer never arrived is not a
# search that did not happen, and retrying it may cost a second time.
ATTEMPT_STATES: tuple[str, ...] = (
    "not_started",
    "running",
    "completed",
    "failed",
    "interrupted",
)


class SearchAttempt(ListicleModel):
    """One angle's search, as it stands.

    Stored per angle rather than per order so a batch that fails on its sixth
    search keeps the five that worked. The request is recorded alongside the
    result because reuse is decided by whether the request still matches, and
    reconstructing an old request from a conversation is exactly the guessing
    this pipeline is trying to stop doing.
    """

    run_id: str = Field(min_length=1)
    revision: int = 1
    angle_id: str = Field(min_length=1)
    angle_text: str = ""
    role: str = "broad"
    wanted: int = 0
    request_fingerprint: str = ""
    state: str = "not_started"
    rows: int = 0
    sources: int = 0
    reason: str = ""
    source_urls: list[str] = Field(default_factory=list)
    # Which publications answered, by name. Recorded per attempt because
    # "did this search reach Spanish-language sources" is a question about one
    # search, and the run-level answer is the union of these.
    source_titles: list[str] = Field(default_factory=list)
    sightings: list[dict] = Field(default_factory=list)
    started_at: str = ""
    finished_at: str = ""
