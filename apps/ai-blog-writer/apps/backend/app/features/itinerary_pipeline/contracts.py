"""Every shape this feature persists, exports or accepts back.

Three artifacts, kept apart on purpose (plan section 7).

**DayDirection** is what the interview agreed: intent plus the criteria a
selection has to satisfy. It is not the old free-text Generation Brief, not a
Writer Brief and not an Article Brief; those three already exist elsewhere in
this repo and mean different things.

**DayPromptExport** is a transport envelope. It carries the exact text the
operator copied, the snapshot it was built from, and the hash that lets a
returned packet prove which request it is answering.

**DayResult** is what came back from the external model: research, a proposed
schedule, reader copy, evidence and the concerns it wants a person to see.

The dry run's schema proved the shape renders. It cannot be the production
contract, because it hard-codes six rows, six literal slot ids and a
place-only world. Everything here is keyed off the slots that were actually
exported, and the JSON Schema handed to the external model is generated per
export from those ids (`day_schema.py`).

Times are integer minutes from the day's reference midnight, with an explicit
day offset for anything that runs past it. "around eight" is not parseable and
"20:30" quietly becomes a timezone question; an integer is neither.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

DIRECTION_CONTRACT_VERSION = "itinerary-day-direction-v1"
RESULT_CONTRACT_VERSION = "itinerary-day-result-v1"
PROMPT_CONTRACT_VERSION = "itinerary-day-prompt-v1"

# The compact request format (ADR 0044, amended). What the model is asked to
# RETURN, not what the app stores: a v2 answer is adapted into the v1
# `DayResult` once, at import, so history, the screen and every downstream
# reader keep the one saved shape they already understand.
RESEARCH_WIRE_VERSION = "itinerary-day-research-v2"

# Which set of instructions a compact export was built under. Part of the
# export's identity, unlike the wording itself: it changes only when what the
# model is ASKED TO DO changes (a new budget, a new stopping rule), and an
# answer to the old assignment is then an answer to a different question.
PROMPT_POLICY_REVISION = "itinerary-research-policy-2026-09-16"

# The formats this app can read back. Anything else is refused by name rather
# than guessed at.
READABLE_ANSWER_VERSIONS: tuple[str, ...] = (RESULT_CONTRACT_VERSION, RESEARCH_WIRE_VERSION)

# What the day interview has to settle before it may agree. The eight areas
# from the plan, in the order a day is usually decided.
ITINERARY_MARKERS: tuple[tuple[str, str], ...] = (
    ("purpose", "the day's promise and what it contributes to this trip"),
    ("geography", "the area, the progression and how far a transfer may go"),
    ("anchors", "which experience drives the day, or that there is no anchor"),
    ("slot_intent", "what every slot is for, and what it must and must not be"),
    ("rhythm", "effort, meal balance, rest and what is optional"),
    ("continuity", "what other days cover, and which overlaps are deliberate"),
    ("change_policy", "what must stay, and what research may propose instead"),
    ("unknowns", "what would make this day wrong, and what research must check"),
)

ITINERARY_MARKER_KEYS: tuple[str, ...] = tuple(key for key, _ in ITINERARY_MARKERS)

# Shaped for `_marker_status`, which takes (key, field, description) triples.
ITINERARY_MARKER_ROWS: tuple[tuple[str, str, str], ...] = tuple(
    (key, key, description) for key, description in ITINERARY_MARKERS
)


class ItineraryModel(BaseModel):
    """Strict where it matters, forgiving where strictness buys nothing.

    This started out refusing any unexpected field, on the theory that one
    meant a packet built against a different contract. In practice
    `contractVersion` catches that, and what the strictness actually caught was
    a model adding one helpful extra key to a twelve-kilobyte object — losing
    the whole day's research over it.

    So unknown fields are now dropped and REPORTED as a warning rather than
    refused (see `validation.unknown_fields`). Nothing is lost silently, and
    nothing is thrown away over punctuation.

    The same principle runs through the fields below: almost everything has a
    default. What a stop must actually contain depends on what kind of stop it
    is and whether it was resolved, and that is a semantic question with a
    readable answer ("a selected place needs an address") rather than a schema
    error ("field required"). `validation.py` asks it.
    """

    model_config = ConfigDict(extra="ignore")


# --------------------------------------------------------------- the setup --


class TravelPointModel(ItineraryModel):
    ref: Literal["base", "getaway", "custom"]
    text: str = ""


class TravelDetailsModel(ItineraryModel):
    from_point: TravelPointModel = Field(alias="from")
    to_point: TravelPointModel = Field(alias="to")
    mode: str = "unspecified"

    model_config = ConfigDict(extra="ignore", populate_by_name=True)


class SlotSnapshotModel(ItineraryModel):
    """One exported stop, exactly as the approved layout has it."""

    id: str = Field(min_length=1, max_length=120)
    source_slot_id: str = Field(default="", alias="sourceSlotId", max_length=120)
    kind: Literal["place", "experience", "free_time", "travel"]
    label: str = Field(default="", max_length=200)
    daypart: str = Field(default="", max_length=40)
    optional: bool = False
    purpose: str = Field(default="", max_length=1000)
    allowed_categories: list[str] = Field(
        default_factory=list, alias="allowedCategories", max_length=8
    )
    preferred_categories: list[str] = Field(
        default_factory=list, alias="preferredCategories", max_length=8
    )
    cues: list[str] = Field(default_factory=list, max_length=20)
    exclusions: list[str] = Field(default_factory=list, max_length=20)
    travel: TravelDetailsModel | None = None

    model_config = ConfigDict(extra="ignore", populate_by_name=True)


class AvailableTimeModel(ItineraryModel):
    id: str = "full_day"
    custom_start: str = Field(default="", alias="customStart", max_length=10)
    custom_end: str = Field(default="", alias="customEnd", max_length=10)
    ends_next_day: bool = Field(default=False, alias="endsNextDay")

    model_config = ConfigDict(extra="ignore", populate_by_name=True)


class DaySnapshotModel(ItineraryModel):
    """One day of the approved setup, as the browser had it."""

    id: str = Field(min_length=1, max_length=120)
    label: str = Field(default="", max_length=200)
    source_template_name: str = Field(default="", alias="sourceTemplateName", max_length=200)
    available_time: AvailableTimeModel = Field(
        default_factory=AvailableTimeModel, alias="availableTime"
    )
    slots: list[SlotSnapshotModel] = Field(default_factory=list, max_length=40)
    setup_notes: str = Field(default="", alias="setupNotes", max_length=6000)
    preparation_notes: str = Field(default="", alias="preparationNotes", max_length=20000)
    # The signatures the browser approved this layout against. Stored so a
    # later edit can be recognised as an edit rather than believed on the word
    # of a boolean somebody could have sent.
    trip_revision: str = Field(default="", alias="tripRevision", max_length=20000)
    layout_revision: str = Field(default="", alias="layoutRevision", max_length=60000)
    approved_at: str = Field(default="", alias="approvedAt", max_length=64)

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    @model_validator(mode="after")
    def check_slots(self) -> "DaySnapshotModel":
        seen = set()
        for slot in self.slots:
            if slot.id in seen:
                raise ValueError(f"day {self.id} has two slots with id {slot.id}")
            seen.add(slot.id)
        return self


class TripSnapshotModel(ItineraryModel):
    """The shared trip. Free-form enough to survive the setup screen growing."""

    title_seed: str = Field(default="", alias="titleSeed", max_length=400)
    base_city: str = Field(default="", alias="baseCity", max_length=200)
    scope: str = "city_only"
    timing: dict[str, Any] = Field(default_factory=dict)
    preferred_areas: list[str] = Field(
        default_factory=list, alias="preferredAreas", max_length=40
    )
    starting_base: str = Field(default="", alias="startingBase", max_length=400)
    shared_preferences: dict[str, Any] = Field(
        default_factory=dict, alias="sharedPreferences"
    )
    getaway: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(extra="ignore", populate_by_name=True)


class SetupSnapshot(ItineraryModel):
    """The whole approved setup, as one immutable object.

    Sent once at handoff and again on every setup change. The server keeps it
    whole rather than shredding it into columns: it is the thing every prompt
    is built from, and a prompt built from a partial copy is a prompt that
    lies about what was approved.
    """

    draft_id: str = Field(default="", alias="draftId", max_length=120)
    trip: TripSnapshotModel
    days: list[DaySnapshotModel] = Field(min_length=1, max_length=40)

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    @model_validator(mode="after")
    def check_days(self) -> "SetupSnapshot":
        seen = set()
        for day in self.days:
            if day.id in seen:
                raise ValueError(f"two days share the id {day.id}")
            seen.add(day.id)
        return self

    def day(self, day_id: str) -> DaySnapshotModel | None:
        return next((day for day in self.days if day.id == day_id), None)

    def day_number(self, day_id: str) -> int:
        for index, day in enumerate(self.days, start=1):
            if day.id == day_id:
                return index
        return 0


# ----------------------------------------------------------- the direction --


class SlotDirection(ItineraryModel):
    slot_id: str = Field(min_length=1, max_length=120)
    role: str = Field(default="", max_length=300)
    must_have: list[str] = Field(default_factory=list, max_length=12)
    nice_to_have: list[str] = Field(default_factory=list, max_length=12)
    exclusions: list[str] = Field(default_factory=list, max_length=12)


class DirectionGeography(ItineraryModel):
    required_area: str = ""
    starting_point: str = ""
    progression: str = ""
    transfer_tolerance: str = ""
    avoid_today: list[str] = Field(default_factory=list, max_length=20)


class DirectionRhythm(ItineraryModel):
    effort: str = ""
    meal_balance: str = ""
    rest_policy: str = ""
    rest_minutes_minimum: int | None = Field(default=None, ge=0, le=1440)
    optionality: str = ""


class DirectionContinuity(ItineraryModel):
    covered_elsewhere: list[str] = Field(default_factory=list, max_length=30)
    reserved_for_later: list[str] = Field(default_factory=list, max_length=30)
    deliberate_overlaps: list[str] = Field(default_factory=list, max_length=20)


class DirectionChangePolicy(ItineraryModel):
    must_remain: str = ""
    may_be_proposed: str = ""
    optional_slots_may_be_omitted: bool = True


class AgreementTurn(ItineraryModel):
    """One decision, and where the answer actually came from.

    `answer_origin` is the difference between something the operator wrote and
    a draft they let stand. The interview keeps that difference and so does
    this, because an accepted suggestion is not first-hand knowledge and must
    never be read downstream as if it were.
    """

    decision: str = Field(default="", max_length=600)
    recommendation: str = Field(default="", max_length=4000)
    answer: str = Field(default="", max_length=4000)
    answer_origin: Literal["operator", "accepted_recommendation"] = "operator"


class DayDirection(ItineraryModel):
    """The agreed direction for one day. Immutable once accepted."""

    contract_version: Literal["itinerary-day-direction-v1"] = DIRECTION_CONTRACT_VERSION
    day_id: str = Field(min_length=1, max_length=120)
    promise: str = Field(default="", max_length=2000)
    trip_role: str = Field(default="", max_length=2000)
    anchors: list[str] = Field(default_factory=list, max_length=10)
    geography: DirectionGeography = Field(default_factory=DirectionGeography)
    rhythm: DirectionRhythm = Field(default_factory=DirectionRhythm)
    constraints: list[str] = Field(default_factory=list, max_length=30)
    slot_directions: list[SlotDirection] = Field(default_factory=list, max_length=40)
    continuity: DirectionContinuity = Field(default_factory=DirectionContinuity)
    change_policy: DirectionChangePolicy = Field(default_factory=DirectionChangePolicy)
    fails_if: list[str] = Field(default_factory=list, max_length=20)
    research_checklist: list[str] = Field(default_factory=list, max_length=30)
    agreement_trace: list[AgreementTurn] = Field(default_factory=list, max_length=40)


class DirectionRevision(ItineraryModel):
    """One extraction, candidate or accepted, with what it was extracted from."""

    revision: int = Field(ge=1)
    status: Literal["candidate", "accepted"] = "candidate"
    direction: DayDirection
    context_key: str = Field(default="", max_length=128)
    created_at: str = ""
    accepted_at: str = ""


# --------------------------------------------------------------- the export --


class DayPromptExport(ItineraryModel):
    """The packet the operator copied, kept exactly as they received it."""

    contract_version: Literal["itinerary-day-prompt-v1"] = PROMPT_CONTRACT_VERSION
    export_id: str = Field(min_length=1, max_length=64)
    workspace_id: str = Field(min_length=1, max_length=64)
    day_id: str = Field(min_length=1, max_length=120)
    direction_revision: int = Field(ge=1)
    workspace_revision: int = Field(ge=1)
    # The identity a returned packet has to echo back unchanged.
    input_hash: str = Field(min_length=8, max_length=128)
    context_key: str = Field(default="", max_length=128)
    slot_ids: list[str] = Field(default_factory=list, max_length=40)
    optional_slot_ids: list[str] = Field(default_factory=list, max_length=40)
    # The answer format this export asks for. Exports written before the
    # compact format existed carry the default and are read as v1 forever:
    # an issued request is immutable, and so is the question it asked.
    schema_version: str = RESULT_CONTRACT_VERSION
    voice_version: str = Field(default="", max_length=128)
    # Empty on a legacy export. See PROMPT_POLICY_REVISION.
    prompt_policy: str = Field(default="", max_length=128)
    # The copyable version: identity, the whole assignment, the schema once.
    prompt_text: str = ""
    response_schema: dict[str, Any] = Field(default_factory=dict)
    # What the in-app call sends, assembled from the same sections rather than
    # cut out of `prompt_text` by searching for a heading. Empty on a legacy
    # export, whose in-app prompt is derived the old way.
    system_prompt: str = ""
    call_prompt: str = ""
    # Readable pieces of the compact brief, for the prompt panel.
    sections: dict[str, str] = Field(default_factory=dict)
    # Character counts per section, the envelope total, and whether it went
    # over the budget. Characters, never tokens: nothing here counts tokens.
    size_report: dict[str, Any] = Field(default_factory=dict)
    # The research allowance the prompt states, so the screen can say it and
    # a run can be compared against it afterwards.
    research_budget: dict[str, int] = Field(default_factory=dict)
    created_at: str = ""

    @property
    def is_compact(self) -> bool:
        return self.schema_version == RESEARCH_WIRE_VERSION


# --------------------------------------------------------------- the result --


class ResultResearch(ItineraryModel):
    performed_at: str | None = Field(default=None, alias="performedAt")
    browsing_used: bool = Field(default=False, alias="browsingUsed")
    # Where `browsing_used` came from. A v1 packet states it about itself
    # ("model"). A compact answer never does: it is read off the run's own
    # tool calls ("tool_calls") or, for a paste the app did not dispatch,
    # it is simply not known ("unknown") -- which is not the same as "no".
    browsing_basis: Literal["model", "tool_calls", "unknown"] = Field(
        default="model", alias="browsingBasis"
    )
    limitations: list[str] = Field(default_factory=list, max_length=60)

    model_config = ConfigDict(extra="ignore", populate_by_name=True)


class ResultStop(ItineraryModel):
    """One row of the day. Only the two fields that decide what it IS are
    required; what a row must carry beyond them depends on its kind and its
    status, and `validation.check_structure` says so in words."""

    slot_id: str = Field(alias="slotId", min_length=1, max_length=120)
    status: Literal["selected", "unresolved", "omitted_optional"] = "unresolved"
    name: str | None = None
    category: str | None = None
    address_or_meeting_point: str | None = Field(default=None, alias="addressOrMeetingPoint")
    area: str | None = None
    maps_url: str | None = Field(default=None, alias="mapsUrl")
    # Minutes from the day's reference midnight. Null when unknown; an unknown
    # start is an incomplete day, never a zero.
    start_minutes: int | None = Field(default=None, alias="startMinutes", ge=0, le=2880)
    duration_minutes: int | None = Field(default=None, alias="durationMinutes", ge=0, le=1440)
    why_here: str = Field(default="", alias="whyHere")
    reader_copy: str = Field(default="", alias="readerCopy")
    what_to_do: list[str] = Field(default_factory=list, alias="whatToDo", max_length=20)
    practical_notes: list[str] = Field(
        default_factory=list, alias="practicalNotes", max_length=20
    )
    claim_ids: list[str] = Field(default_factory=list, alias="claimIds", max_length=40)
    selection_reason: str = Field(default="", alias="selectionReason")
    unresolved_reason: str | None = Field(default=None, alias="unresolvedReason")

    model_config = ConfigDict(extra="ignore", populate_by_name=True)


class ResultTransfer(ItineraryModel):
    from_ref: str = Field(alias="from", min_length=1, max_length=120)
    to_ref: str = Field(alias="to", min_length=1, max_length=120)
    mode: Literal[
        "walk", "public_transport", "taxi", "car", "train", "bus", "unspecified"
    ] = "unspecified"
    minutes_min: int | None = Field(default=None, alias="minutesMin", ge=0, le=1440)
    minutes_max: int | None = Field(default=None, alias="minutesMax", ge=0, le=1440)
    # Defaults to the honest answer. A transfer that forgot to say where its
    # number came from has not established one.
    basis: Literal["sourced", "planning_estimate", "unknown"] = "unknown"
    source_ids: list[str] = Field(default_factory=list, alias="sourceIds", max_length=20)
    note: str = ""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)


class ResultRestWindow(ItineraryModel):
    after_slot_id: str = Field(alias="afterSlotId", min_length=1, max_length=120)
    before_slot_id: str = Field(alias="beforeSlotId", min_length=1, max_length=120)
    minutes: int = Field(default=0, ge=0, le=1440)
    # A rest with no location is a transfer nobody accounted for. Saying which
    # of the four it is costs the model one enum and saves the schedule check
    # from guessing.
    location_policy: Literal["stay_nearby", "named_location", "return_to_base", "unknown"] = (
        Field(default="unknown", alias="locationPolicy")
    )
    description: str = ""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)


class ResultSource(ItineraryModel):
    id: str = Field(min_length=1, max_length=120)
    url: str = Field(min_length=1, max_length=2000)
    title: str = ""
    publisher: str = ""
    source_type: Literal["official", "map", "secondary"] = Field(
        default="secondary", alias="sourceType"
    )
    accessed_at: str | None = Field(default=None, alias="accessedAt")
    published_or_updated_at: str | None = Field(default=None, alias="publishedOrUpdatedAt")

    model_config = ConfigDict(extra="ignore", populate_by_name=True)


class ResultClaim(ItineraryModel):
    id: str = Field(min_length=1, max_length=120)
    text: str = Field(min_length=1)
    source_ids: list[str] = Field(default_factory=list, alias="sourceIds", max_length=20)
    applies_to: str = Field(default="", alias="appliesTo", max_length=120)

    model_config = ConfigDict(extra="ignore", populate_by_name=True)


class ResultFeasibility(ItineraryModel):
    topic: str = Field(min_length=1, max_length=200)
    status: Literal[
        "supported", "conditional", "unresolved", "not_applicable"
    ] = "unresolved"
    detail: str = ""
    source_ids: list[str] = Field(default_factory=list, alias="sourceIds", max_length=20)

    model_config = ConfigDict(extra="ignore", populate_by_name=True)


class ResultProposedChange(ItineraryModel):
    slot_id: str = Field(default="", alias="slotId", max_length=120)
    proposal: str = ""
    reason: str = ""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)


class ResultTripMemory(ItineraryModel):
    used_places: list[str] = Field(default_factory=list, alias="usedPlaces", max_length=60)
    covered_experiences: list[str] = Field(
        default_factory=list, alias="coveredExperiences", max_length=60
    )
    reserved_for_later: list[str] = Field(
        default_factory=list, alias="reservedForLater", max_length=60
    )
    next_day_implications: list[str] = Field(
        default_factory=list, alias="nextDayImplications", max_length=60
    )

    model_config = ConfigDict(extra="ignore", populate_by_name=True)


class DayResult(ItineraryModel):
    """One researched day as the external model returned it.

    `status` is the model's own word for how it went. It is stored and shown
    as something the model said, and it never becomes the app's badge: the app
    derives import validity, planning completeness and evidence review
    separately, from the packet itself.
    """

    contract_version: Literal["itinerary-day-result-v1"] = Field(
        default=RESULT_CONTRACT_VERSION, alias="contractVersion"
    )
    # The format the answer ARRIVED in. Empty means it was written as this
    # object; the compact version means the adapter built this object from a
    # smaller answer, so fields such as `status`, the ids and the map links
    # were filled in by the app rather than returned by the model.
    wire_version: str = Field(default="", alias="wireVersion", max_length=64)
    workspace_id: str = Field(alias="workspaceId", min_length=1, max_length=64)
    day_id: str = Field(alias="dayId", min_length=1, max_length=120)
    export_id: str = Field(alias="exportId", min_length=1, max_length=64)
    input_hash: str = Field(alias="inputHash", min_length=1, max_length=128)
    research: ResultResearch = Field(default_factory=ResultResearch)
    # The model's own verdict, and the app never adopts it. Defaulted rather
    # than required because a packet that forgot to grade itself is still a
    # perfectly good day, and "it wants a decision from you" is the safe
    # reading of silence.
    status: Literal[
        "ready_for_editor_review", "needs_decision", "insufficient_evidence"
    ] = "needs_decision"
    title: str = ""
    day_intro: str = Field(default="", alias="dayIntro")
    trip_role: str = Field(default="", alias="tripRole")
    schedule_label: str = Field(default="", alias="scheduleLabel", max_length=300)
    stops: list[ResultStop] = Field(default_factory=list, max_length=60)
    transfers: list[ResultTransfer] = Field(default_factory=list, max_length=80)
    rest_windows: list[ResultRestWindow] = Field(
        default_factory=list, alias="restWindows", max_length=20
    )
    sources: list[ResultSource] = Field(default_factory=list, max_length=200)
    claims: list[ResultClaim] = Field(default_factory=list, max_length=400)
    feasibility: list[ResultFeasibility] = Field(default_factory=list, max_length=40)
    proposed_changes: list[ResultProposedChange] = Field(
        default_factory=list, alias="proposedChanges", max_length=40
    )
    trip_memory: ResultTripMemory = Field(
        default_factory=ResultTripMemory, alias="tripMemory"
    )
    editor_notes: list[str] = Field(default_factory=list, alias="editorNotes", max_length=60)

    model_config = ConfigDict(extra="ignore", populate_by_name=True)


# ------------------------------------------------------------- the verdict --


class ValidationIssue(ItineraryModel):
    """One thing wrong, said where a person can act on it.

    `path` is dotted and human-readable ("stops.Lunch.durationMinutes"), not a
    JSON Pointer: the reader is an operator looking at a paste, not a parser.
    """

    severity: Literal["error", "warning"]
    layer: Literal[
        "transport", "schema", "identity", "structure", "evidence", "schedule", "review"
    ]
    path: str = ""
    message: str


class CompletenessReport(ItineraryModel):
    """Planning completeness, which is a different question from validity.

    Every reason a day is not complete is named here. A day that reads "Needs
    work" with nothing saying why is a state an operator cannot act on, and
    `outstanding_checks` exists because one of the three reasons — a question
    the model itself left unresolved — has no other place to show up.
    """

    selected: int = 0
    unresolved: int = 0
    omitted_optional: int = 0
    required_unresolved: list[str] = Field(default_factory=list)
    missing_timing: list[str] = Field(default_factory=list)
    outstanding_checks: list[str] = Field(default_factory=list)
    # Adjacent selected stops with no journey between them, or one whose time
    # is not known. The route is part of the day; a day whose legs are
    # missing has not been planned, however full its rows are.
    missing_legs: list[str] = Field(default_factory=list)
    # Arithmetic that does not fit: a finish plus the journey that runs past
    # the next start, a rest that has no room.
    schedule_conflicts: list[str] = Field(default_factory=list)
    complete: bool = False


class ValidationReport(ItineraryModel):
    valid: bool
    issues: list[ValidationIssue] = Field(default_factory=list)
    normalizations: list[str] = Field(default_factory=list)
    completeness: CompletenessReport = Field(default_factory=CompletenessReport)

    @property
    def errors(self) -> list[ValidationIssue]:
        return [issue for issue in self.issues if issue.severity == "error"]

    @property
    def warnings(self) -> list[ValidationIssue]:
        return [issue for issue in self.issues if issue.severity == "warning"]


class StoredResult(ItineraryModel):
    """A saved day, plus everything about how it got here."""

    result_revision: int = Field(ge=1)
    export_id: str = ""
    content_hash: str = ""
    result: DayResult
    report: ValidationReport
    saved_at: str = ""
    review_notes: str = ""
    evidence_reviewed: bool = False


def stable_hash(payload: Any) -> str:
    """A hash of meaning, not of formatting.

    Sorted keys and compact separators, so re-serialising the same object
    twice cannot produce two different identities -- which is the whole job of
    this function, since the export's hash is what a returned packet is
    checked against.
    """
    text = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:32]
