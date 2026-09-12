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
import uuid

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


class AngleConflict(ListicleModel):
    """One approved search that looks like it will return barred places.

    Run 33fca394 approved "Nikkei cevicherias doing Japanese-Peruvian
    preparations" alongside a cut reading "no places where ceviche is not the
    primary offering". Those two disagree, and the disagreement was visible in
    the order before a penny was spent. Nobody looked, so the search ran: 8 of
    its 10 places were barred by the same order that bought it -- one of seven
    paid searches, spent almost entirely on results the operator had already
    said they did not want.

    A warning and nothing else. The angle is not removed, reworded or
    reordered: an operator who wants Nikkei places that genuinely lead with
    ceviche is asking for something coherent, and only they know that.
    """

    angle_id: str = Field(min_length=1)
    angle_text: str = ""
    # Why these two read as fighting, in a sentence a person can disagree with.
    why: str = Field(min_length=1)


# Which version of the reviewer's prompt and schema produced a verdict. Part
# of the review fingerprint: a changed prompt is a changed question, and a
# stored answer to the old one is not an answer to the new one.
CUT_REVIEW_VERSION = "2"

# What a review of one pool can be. `partial` is the state the version this
# replaced could not represent at all -- it truncated at 120 candidates and
# reported the pool as checked.
REVIEW_STATUSES: tuple[str, ...] = (
    "not_needed",
    "complete",
    "partial",
    "failed",
)


class CutVerdict(ListicleModel):
    """What the reviewer said about one candidate.

    Keyed by candidate id wherever it is stored. The version this replaces
    stored verdicts by name, and a name is not an identity: two branches of one
    bar are two candidates with one name, the reviewer flagged the branch
    inside a hotel, and both branches came back flagged with the same sentence.
    """

    candidate_id: str = Field(min_length=1)
    # Carried for the screen and for audit. Never the key.
    name: str = ""
    why: str = ""
    # "clear" or "arguable". A value outside the two reads as `arguable`, which
    # is the reading that costs less when it is wrong.
    confidence: str = "arguable"


class CutReviewChunk(ListicleModel):
    """One reviewer call, and exactly which candidates it was asked about.

    A chunk that failed keeps its expected ids, so a retry can buy the missing
    part and nothing else -- and so that whole-pool coverage is a question with
    an answer rather than an assumption.
    """

    index: int = 0
    candidate_ids: list[str] = Field(default_factory=list)
    # "complete" or "failed". A chunk is never partially complete: the reviewer
    # answered about the rows it was sent, or it did not answer.
    state: str = "failed"
    reason: str = ""


class CutReview(ListicleModel):
    """One judgement of one pool against one cut.

    Stored under the fingerprint of the material actually sent, not under a
    revision. A pool whose candidates changed is a different question, and the
    old answer used to be returned for it: a refresh that replaced every venue
    and a review that then failed left the new pool reading `checked` with
    nothing barred.
    """

    run_id: str = Field(min_length=1)
    # The revision the pool was assembled at. Recorded, never matched on.
    revision: int = 0
    fingerprint: str = Field(min_length=1)
    status: str = "failed"
    # Every candidate the pool held when this review was dispatched.
    expected_candidate_ids: list[str] = Field(default_factory=list)
    # Every candidate a completed chunk actually covered.
    reviewed_candidate_ids: list[str] = Field(default_factory=list)
    verdicts: list[CutVerdict] = Field(default_factory=list)
    chunks: list[CutReviewChunk] = Field(default_factory=list)
    review_version: str = CUT_REVIEW_VERSION
    pooling_version: str = ""
    reviewer_model: str = ""
    completed_at: str = ""

    @property
    def covers_everything(self) -> bool:
        """Whether every candidate sent was covered by a chunk that finished.

        The one question `cut_checked` is allowed to be true for. Coverage is
        not "the call returned"; it is "every row was looked at".
        """
        return set(self.expected_candidate_ids) <= set(self.reviewed_candidate_ids)

    def by_candidate(self) -> dict[str, CutVerdict]:
        return {verdict.candidate_id: verdict for verdict in self.verdicts}


class InterviewBaseline(ListicleModel):
    """What the interview had settled, the last time an order was written.

    An order is not a view of the transcript -- it can be corrected directly,
    and a correction that a later reading of the transcript silently undid
    would be the same class of fault as reading the count out of prose, one
    layer up. So a re-agreement is resolved against THIS rather than against
    the order: a field the interview did not change keeps whatever the order
    says, correction included, and a field the interview did change is the
    operator saying so explicitly and wins.
    """

    run_id: str = Field(min_length=1)
    # The order revision this baseline was captured alongside.
    revision: int = 1
    kind: str = ""
    place: str = ""
    target_count: int = 0
    standard: str = ""
    exclusions: str = ""
    # The approved wording, in order. Compared exactly: an edited angle is a
    # different search, and deciding by text similarity that it is "really" a
    # previous one is the guessing this record exists to stop.
    angles: list[str] = Field(default_factory=list)
    taken_at: str = ""


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
    # Angles that read as fighting the cut, found before the searches run.
    angle_conflicts: list[AngleConflict] = Field(default_factory=list)
    # Whether anything has actually looked. False is not "no conflicts found" --
    # it is "nobody checked", which is the state every order stored before this
    # existed is in, and the state of any order built on a path that is not
    # allowed to spend. The screen has to be able to tell those apart, because
    # "we looked and it is fine" and "we never looked" are different claims.
    conflicts_checked: bool = False
    # Which catalogue this commission draws its shapes from, and how that was
    # decided. Stored rather than re-derived, because the searchable noun and
    # the catalogue subject are two different things: "hotels with rooftop
    # bars" searches for hotels and used to be handed the bar catalogue.
    #
    # An empty subject with source `unknown` is a real answer -- the shared
    # shapes and nothing invented. `mixed` is a different real answer: two
    # subjects in the head, which the interview settles and the catalogue must
    # not guess at.
    catalogue_subject: str = ""
    subject_source: str = ""

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

# Terminal states. Once an attempt reaches one of these its result is frozen:
# a later invocation of the same angle is a NEW attempt with a new id, and it
# cannot overwrite what an earlier one found. That rule is the whole of R2 --
# before it, a refresh that timed out wrote its failure over the successful
# result it was meant to replace, and the successful result was gone.
TERMINAL_ATTEMPT_STATES: frozenset[str] = frozenset(
    {"completed", "failed", "interrupted"}
)


class ProviderCall(ListicleModel):
    """One request actually put to the provider, inside one invocation.

    An invocation is not a billable call. `run_one_angle` retries a failed
    provider call up to three times, and a request whose answer never arrived
    may well have been processed and charged for. Recording each one is the
    only way a cost figure can be built from what happened rather than from
    how many times someone pressed a button -- and it still does not promise
    exactly-once charging, because nothing can.
    """

    at: str = ""
    # "answered", "failed", or "interrupted" -- sent, no answer seen.
    outcome: str = ""
    # The exception's type, when there was one. Not the message: a message can
    # carry a prompt back into storage, and this is a receipt, not a log.
    detail: str = ""


class SearchAttempt(ListicleModel):
    """One angle's search, as it stands.

    Stored per angle rather than per order so a batch that fails on its sixth
    search keeps the five that worked. The request is recorded alongside the
    result because reuse is decided by whether the request still matches, and
    reconstructing an old request from a conversation is exactly the guessing
    this pipeline is trying to stop doing.
    """

    # Unique to one invocation of `run_one_angle`. Two searches of the same
    # angle under the same revision are two attempts, and both survive.
    #
    # Generated rather than required, so that constructing an attempt cannot
    # accidentally produce two rows that claim to be the same one. An id passed
    # in wins, which is how a reconstructed attempt keeps the identity the
    # migration gave it.
    attempt_id: str = Field(default_factory=lambda: uuid.uuid4().hex[:12])
    run_id: str = Field(min_length=1)
    # The revision this attempt was ORIGINATED under. It never changes: an
    # attempt reused by a later revision is referenced from that revision's
    # selection, not re-filed under it. Re-filing is what turned one paid
    # execution into three entries of search history (R10).
    revision: int = 1
    angle_id: str = Field(min_length=1)
    angle_text: str = ""
    role: str = "broad"
    wanted: int = 0
    request_fingerprint: str = ""
    # Which catalogue shape ran, and what it ran about. The wording is rewritten
    # by the model on every run, so the text cannot identify "this search" from
    # one run to the next and the shape can. `subject` scopes that identity:
    # what the `hours` shape does for cevicherias in Lima says nothing about
    # what it does for bookshops in Buenos Aires.
    shape_key: str = ""
    subject: str = ""
    state: str = "not_started"
    rows: int = 0
    sources: int = 0
    reason: str = ""
    source_urls: list[str] = Field(default_factory=list)
    # Which publications answered, by name. Recorded per attempt because
    # "did this search reach Spanish-language sources" is a question about one
    # search, and the run-level answer is the union of these.
    source_titles: list[str] = Field(default_factory=list)
    # What this search contributed, against the pool as it stood when the batch
    # finished. Recorded rather than only computed, because the whole point is
    # to be able to say what an angle did LAST time before paying for it again
    # -- and a number that only exists while a run is on screen cannot do that.
    # Rewritten after every batch: retrying one angle changes the pool, and so
    # changes what every other angle turns out to have contributed.
    found: int = 0
    shared: int = 0
    exclusive: int = 0
    contribution_recorded: bool = False
    sightings: list[dict] = Field(default_factory=list)
    started_at: str = ""
    finished_at: str = ""
    # Every request actually put to the provider inside this invocation. One
    # invocation can be three calls; a cost read off the number of attempts is
    # a cost read off the wrong number.
    provider_calls: list[ProviderCall] = Field(default_factory=list)
    # "executed" for an attempt this pipeline ran and watched, "reconstructed"
    # for one rebuilt from a row stored before attempts had identities. A
    # reconstructed attempt is real evidence and an unreliable execution
    # count, and history says so rather than averaging the two.
    origin: str = "executed"


class AngleSelection(ListicleModel):
    """Which stored attempt speaks for one angle, at one revision.

    Separated from the attempts themselves because they answer different
    questions. An attempt is what happened. This is what is being shown -- and
    the two come apart exactly when it matters: a refresh that fails leaves the
    earlier success selected and the failure latest, and the screen has to be
    able to say both.
    """

    run_id: str = Field(min_length=1)
    revision: int = 1
    angle_id: str = Field(min_length=1)
    # The successful attempt currently displayed for this angle. Empty when no
    # successful attempt has ever matched this revision's request.
    selected_attempt_id: str = ""
    # The most recent attempt of any outcome. Equal to the selected one on the
    # ordinary path; different exactly when a refresh failed.
    latest_attempt_id: str = ""


class AttemptContribution(ListicleModel):
    """What one attempt contributed to one pooling of the evidence."""

    attempt_id: str = ""
    angle_id: str = ""
    angle_text: str = ""
    shape_key: str = ""
    role: str = "broad"
    rows: int = 0
    found: int = 0
    shared: int = 0
    exclusive: int = 0


class PoolSnapshot(ListicleModel):
    """One pooling of one run's evidence, and what each search contributed.

    Contribution is a property of a pooling, not of an execution. The same
    search contributes differently against different peers -- retry one angle
    and every other angle's exclusivity moves -- so a number stored on the
    execution alone is a number that cannot say what it was measured against.

    This is also what makes history countable. A snapshot names the attempts it
    pooled, once each, so an execution referenced by three revisions is one
    execution in the record rather than three.
    """

    run_id: str = Field(min_length=1)
    revision: int = 1
    subject: str = ""
    target_count: int = 0
    candidate_count: int = 0
    # True while any two candidates might be one venue. A distinct count taken
    # from a snapshot with this set is provisional, and saying so is cheaper
    # than being wrong about coverage.
    uncertain_identity: int = 0
    pooling_version: str = ""
    taken_at: str = ""
    contributions: list[AttemptContribution] = Field(default_factory=list)
