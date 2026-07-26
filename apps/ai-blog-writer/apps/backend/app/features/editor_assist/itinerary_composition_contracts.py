"""HTTP contracts for the Itinerary Composition family."""

from typing import Any, Literal

from pydantic import BaseModel, Field

from .contracts import MAX_ARTICLE_TITLE_CHARS, ListTone

MAX_PROFILE_OPTION_CHARS = 120
MAX_PROFILE_OPTIONS_PER_SECTION = 60
MAX_PROFILE_NOTES_CHARS = 2000

MAX_INTRO_STOPS = 60
MAX_INTRO_OVERVIEW_CHARS = 4000

MAX_DAY_BLURB_STOPS = 20


class ComposeItineraryBriefRequest(BaseModel):
    traveler_types: list[str] = Field(
        default_factory=list, max_length=MAX_PROFILE_OPTIONS_PER_SECTION
    )
    motivations: list[str] = Field(
        default_factory=list, max_length=MAX_PROFILE_OPTIONS_PER_SECTION
    )
    interests: list[str] = Field(
        default_factory=list, max_length=MAX_PROFILE_OPTIONS_PER_SECTION
    )
    budget: str | None = Field(default=None, max_length=8)
    accommodations: list[str] = Field(
        default_factory=list, max_length=MAX_PROFILE_OPTIONS_PER_SECTION
    )
    practical_needs: list[str] = Field(
        default_factory=list, max_length=MAX_PROFILE_OPTIONS_PER_SECTION
    )
    notes: str | None = Field(default=None, max_length=MAX_PROFILE_NOTES_CHARS)
    location_label: str | None = Field(default=None, max_length=300)
    day_count: int | None = Field(default=None, ge=1, le=7)
    article_title: str | None = Field(default=None, max_length=MAX_ARTICLE_TITLE_CHARS)
    model_name: str | None = Field(default=None, max_length=120)


class ComposeItineraryBriefResponse(BaseModel):
    brief: str
    model_used: str


class ComposeItineraryIntroStop(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    category: str | None = Field(default=None, max_length=80)
    day_label: str | None = Field(default=None, max_length=80)
    selection_reason: str | None = Field(default=None, max_length=2000)


class ComposeItineraryIntroRequest(BaseModel):
    article_title: str = Field(min_length=1, max_length=MAX_ARTICLE_TITLE_CHARS)
    location_label: str = Field(min_length=1, max_length=300)
    list_tone: ListTone | None = None
    plan_overview: str | None = Field(default=None, max_length=MAX_INTRO_OVERVIEW_CHARS)
    day_count: int | None = Field(default=None, ge=1, le=7)
    stops: list[ComposeItineraryIntroStop] = Field(
        default_factory=list, max_length=MAX_INTRO_STOPS
    )
    model_name: str | None = Field(default=None, max_length=120)


ComposeIntroStepStatus = Literal["ok", "warning", "failed"]


class ComposeIntroStepEvent(BaseModel):
    """One diagnostic step in a Compose-from-plan run, mirroring the Autobuild
    Report timeline so the operator can inspect what signal went in and out."""

    name: str
    label: str
    status: ComposeIntroStepStatus
    duration_ms: int = 0
    model: str | None = None
    prompt: str | None = None
    output: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)


class ComposeItineraryIntroResponse(BaseModel):
    intro: str
    model_used: str
    steps: list[ComposeIntroStepEvent] = Field(default_factory=list)


class ComposeDayBlurbStop(BaseModel):
    target_id: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=240)
    category: str | None = Field(default=None, max_length=80)
    daypart: str | None = Field(default=None, max_length=80)
    angle: str | None = Field(default=None, max_length=80)
    selection_reason: str | None = Field(default=None, max_length=2000)
    # Existing copy is context only when the stop is not in write_target_ids.
    existing_blurb: str | None = Field(default=None, max_length=4000)


class ComposeDayBlurbsNeighborStop(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    category: str | None = Field(default=None, max_length=80)


class ComposeDayBlurbsRequest(BaseModel):
    article_title: str = Field(min_length=1, max_length=MAX_ARTICLE_TITLE_CHARS)
    location_label: str = Field(min_length=1, max_length=300)
    list_tone: ListTone | None = None
    plan_overview: str | None = Field(default=None, max_length=MAX_INTRO_OVERVIEW_CHARS)
    intro: str | None = Field(default=None, max_length=MAX_INTRO_OVERVIEW_CHARS)
    day_label: str | None = Field(default=None, max_length=80)
    day_count: int | None = Field(default=None, ge=1, le=7)
    prev_day_last_stop: ComposeDayBlurbsNeighborStop | None = None
    next_day_first_stop: ComposeDayBlurbsNeighborStop | None = None
    stops: list[ComposeDayBlurbStop] = Field(
        default_factory=list, max_length=MAX_DAY_BLURB_STOPS
    )
    # Omitted means author the whole day; present means author only this subset.
    write_target_ids: list[str] | None = Field(
        default=None, max_length=MAX_DAY_BLURB_STOPS
    )
    model_name: str | None = Field(default=None, max_length=120)


class ComposeDayBlurbResult(BaseModel):
    target_id: str
    status: Literal["generated", "error"]
    markdown: str | None = None
    validation_errors: list[str] = Field(default_factory=list)


class ComposeDayBlurbsResponse(BaseModel):
    model_used: str
    results: dict[str, ComposeDayBlurbResult] = Field(default_factory=dict)
    steps: list[ComposeIntroStepEvent] = Field(default_factory=list)


class ComposeStopReasonRequest(BaseModel):
    rough_reason: str = Field(min_length=1, max_length=2000)
    title: str = Field(min_length=1, max_length=240)
    category: str | None = Field(default=None, max_length=80)
    daypart: str | None = Field(default=None, max_length=80)
    angle: str | None = Field(default=None, max_length=80)
    article_title: str | None = Field(default=None, max_length=MAX_ARTICLE_TITLE_CHARS)
    location_label: str | None = Field(default=None, max_length=300)
    plan_overview: str | None = Field(default=None, max_length=MAX_INTRO_OVERVIEW_CHARS)
    model_name: str | None = Field(default=None, max_length=120)


class ComposeStopReasonResponse(BaseModel):
    reason: str
    model_used: str
