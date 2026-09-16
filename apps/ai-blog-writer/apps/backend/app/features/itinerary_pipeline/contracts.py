"""Every shape this feature persists, exports or accepts back.

Three artifacts, kept apart on purpose.

**DaySummary** is what the interview agreed, said short: the day's angle, how
it fits the trip, where it happens, and each stop's role -- with the operator's
firm requirements kept apart from preferences the selection may adjust. It is
not the Generation Brief, the Writer Brief or the Article Brief; those exist
elsewhere in this repo and mean different things.

**DayPromptExport** is a transport envelope. It carries the exact text the
operator copied, the snapshot it was built from, and the hash that lets a
returned answer prove which request it is answering.

**DaySelection** (`selection_contract.py`) is what comes back: the places,
one short reason each, the day's overview and the questions only a person can
answer. It is a proposal to judge, not an article (ADR 0045).

Two older shapes are still READ here and never written: **DayDirection**, the
long requirements object the first version extracted, and **DayResult**, the
article-shaped day it researched and wrote. Saved work in those shapes stays
viewable as a previous version; nothing new is generated from them.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

DIRECTION_CONTRACT_VERSION = "itinerary-day-direction-v1"
SUMMARY_CONTRACT_VERSION = "itinerary-day-summary-v1"
RESULT_CONTRACT_VERSION = "itinerary-day-result-v1"
PROMPT_CONTRACT_VERSION = "itinerary-day-prompt-v1"

# The answer formats of the article-shaped versions. Named so an answer in
# either is refused by name, with a next step, rather than read as nonsense.
RESEARCH_WIRE_VERSION = "itinerary-day-research-v2"
RETIRED_ANSWER_VERSIONS: tuple[str, ...] = (RESULT_CONTRACT_VERSION, RESEARCH_WIRE_VERSION)

# Which set of instructions an export was built under. Part of the export's
# identity, unlike the wording itself: it changes only when what the model is
# ASKED TO DO changes, and an answer to the old assignment is then an answer to
# a different question.
PROMPT_POLICY_REVISION = "itinerary-selection-policy-2026-09-16"

# What the day interview has to settle before it may agree. Four, not eight:
# the interview decides what the day is for, not how research should work.
# A GrillState keeps the keys it started with, so an interview begun under the
# older eight-marker list finishes under it.
ITINERARY_MARKERS: tuple[tuple[str, str], ...] = (
    ("angle", "what the day is for, and how it differs from the other days"),
    ("area", "where the day happens and roughly how it moves"),
    ("stops", "what each stop is for, where that is not already obvious"),
    ("limits", "the operator's firm requirements, kept apart from preferences"),
)

ITINERARY_MARKER_KEYS: tuple[str, ...] = tuple(key for key, _ in ITINERARY_MARKERS)


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


class StayModel(ItineraryModel):
    """Where the traveller sleeps for a run of nights.

    Night N is the night after day N. Either a Location Manager hotel the
    operator picked, or a request for the selection to recommend one -- which
    is a suggestion, never a booking and never a claim of availability.
    """

    id: str = Field(min_length=1, max_length=120)
    mode: Literal["location_manager", "recommend"] = "location_manager"
    location_id: int | None = Field(default=None, alias="locationId")
    name: str = Field(default="", max_length=300)
    area: str = Field(default="", max_length=300)
    # For a recommendation: what kind of stay the operator wants.
    note: str = Field(default="", max_length=1000)
    first_night: int = Field(default=1, alias="firstNight", ge=1, le=60)
    last_night: int = Field(default=1, alias="lastNight", ge=1, le=60)

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    def covers(self, night: int) -> bool:
        return self.first_night <= night <= self.last_night


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
    stays: list[StayModel] = Field(default_factory=list, max_length=40)

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    def stay_for_night(self, night: int) -> StayModel | None:
        """The first stay covering this night. Overlaps are the setup screen's
        to flag; here the earlier one wins, deterministically."""
        return next((stay for stay in self.stays if stay.covers(night)), None)


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


class SlotSummary(ItineraryModel):
    """One stop's role, and only what the conversation actually settled."""

    slot_id: str = Field(min_length=1, max_length=120)
    role: str = Field(default="", max_length=300)
    requirements: list[str] = Field(default_factory=list, max_length=8)
    preferences: list[str] = Field(default_factory=list, max_length=8)


class DaySummary(ItineraryModel):
    """The agreed day, short enough to scan. Immutable once accepted.

    `requirements` are the operator's own musts: things they wrote, or the
    setup states. `preferences` are everything the selection may adjust --
    including a suggestion the operator merely accepted. "Walkable" is a
    preference; it does not become a fifteen-minute rule by being written down.
    """

    contract_version: Literal["itinerary-day-summary-v1"] = SUMMARY_CONTRACT_VERSION
    day_id: str = Field(min_length=1, max_length=120)
    angle: str = Field(default="", max_length=600)
    trip_fit: str = Field(default="", max_length=600)
    area: str = Field(default="", max_length=600)
    requirements: list[str] = Field(default_factory=list, max_length=12)
    preferences: list[str] = Field(default_factory=list, max_length=12)
    avoid: list[str] = Field(default_factory=list, max_length=12)
    slots: list[SlotSummary] = Field(default_factory=list, max_length=40)
    agreement_trace: list[AgreementTurn] = Field(default_factory=list, max_length=40)

    @property
    def promise(self) -> str:
        """The one line other days see about this one."""
        return self.angle


class DirectionRevision(ItineraryModel):
    """One extraction, candidate or accepted, with what it was extracted from.

    An accepted `DayDirection` is the older, longer shape. It is kept readable
    and is never exported: a new selection needs a `DaySummary`.
    """

    revision: int = Field(ge=1)
    status: Literal["candidate", "accepted"] = "candidate"
    direction: DaySummary | DayDirection = Field(discriminator="contract_version")
    context_key: str = Field(default="", max_length=128)
    created_at: str = ""
    accepted_at: str = ""

    @property
    def is_summary(self) -> bool:
        return isinstance(self.direction, DaySummary)


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
    # The answer format this export asks for. An issued request is immutable,
    # and so is the question it asked: exports from the article-shaped
    # versions keep their format and are no longer run or imported.
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
    # A revision asks for a changed proposal: which saved revision it starts
    # from, and what the operator wants different. Both are part of the hash.
    base_revision: int | None = None
    change_request: str = Field(default="", max_length=4000)
    change_slot_id: str = Field(default="", max_length=120)
    # What the request was built from, in words, so a later change to the day
    # can be named ("the stay for night 1") rather than just detected.
    context_summary: dict[str, Any] = Field(default_factory=dict)
    created_at: str = ""

    @property
    def is_selection(self) -> bool:
        from .selection_contract import SELECTION_CONTRACT_VERSION

        return self.schema_version == SELECTION_CONTRACT_VERSION


# ------------------------------------------- the previous version's result --
#
# Read-only. Saved article-shaped days are still shown as previous versions.


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
    """A saved day, plus everything about how it got here.

    Exactly one of `selection` (current) and `result` (a previous, article-
    shaped version) is set.
    """

    result_revision: int = Field(ge=1)
    export_id: str = ""
    content_hash: str = ""
    result: DayResult | None = None
    selection: Any = None
    report: ValidationReport
    saved_at: str = ""
    # Who made this revision: an answer that was imported, or an edit made on
    # the proposal itself.
    origin: Literal["answer", "editor_swap"] = "answer"
    review_notes: str = ""
    evidence_reviewed: bool = False

    @model_validator(mode="after")
    def read_selection(self) -> "StoredResult":
        from .selection_contract import DaySelection

        if isinstance(self.selection, dict):
            self.selection = DaySelection.model_validate(self.selection)
        return self

    @property
    def is_selection(self) -> bool:
        return self.selection is not None

    @property
    def complete(self) -> bool:
        return self.report.completeness.complete

    def chosen_names(self) -> list[str]:
        """The places this saved day uses, whichever shape it is."""
        if self.selection is not None:
            return [
                pick.name.strip()
                for pick in self.selection.picks
                if pick.status == "selected" and pick.name and pick.name.strip()
            ]
        if self.result is not None:
            return [
                stop.name.strip()
                for stop in self.result.stops
                if stop.status == "selected" and stop.name and stop.name.strip()
            ]
        return []

    def headline(self) -> str:
        if self.selection is not None:
            return self.selection.overview
        return self.result.title if self.result is not None else ""


def stable_hash(payload: Any) -> str:
    """A hash of meaning, not of formatting.

    Sorted keys and compact separators, so re-serialising the same object
    twice cannot produce two different identities -- which is the whole job of
    this function, since the export's hash is what a returned packet is
    checked against.
    """
    text = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:32]
