"""Itinerary Autobuild — request/response and internal pipeline models.

See ADR 0014 (function-calling over MCP) and ADR 0015 (fit-scoring on existing
tags), plus ADR 0016 (Day Shells as layout source of truth). The AI owns
creative intent extraction and fit-scoring; Day Shells own stop count, slot
requirements, and order. The backend reads Payload with the operator's JWT and
returns a plan; the frontend owns all writes.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

# The four data collections this pipeline can pull from, plus the Payload
# `relationTo` slug each maps to and the itinerary block type the builder uses.
Category = Literal["dining", "accommodations", "attractions", "nightlife"]
Daypart = Literal[
    "morning", "late_morning", "lunch", "afternoon", "dinner", "evening", "nightlife"
]

CATEGORY_TO_BLOCK_TYPE: dict[str, str] = {
    "dining": "itinerary-dining",
    "accommodations": "itinerary-accommodations",
    "attractions": "itinerary-attractions",
    "nightlife": "itinerary-nightlife",
}

# Lodging uses a dedicated block type when it anchors a day (`whereStaying`).
WHERE_STAYING_BLOCK_TYPE = "itinerary-where-staying"

MAX_BRIEF_CHARS = 8_000
MIN_DAYS = 1
MAX_DAYS = 7
MIN_SLOT_FIT_SCORE = 55


class ShellSlot(BaseModel):
    """One ordered requirement inside a Day Shell."""

    id: str = Field(..., min_length=1, max_length=80)
    label: str = Field(..., min_length=1, max_length=120)
    daypart: Daypart
    acceptable_collections: list[Category] = Field(..., min_length=1)
    preferred_collections: list[Category] = Field(default_factory=list)
    intent_tags: list[str] = Field(default_factory=list)
    avoid_tags: list[str] = Field(default_factory=list)


class DayShell(BaseModel):
    """Operator-selected template for one day's stop structure."""

    id: str = Field(..., min_length=1, max_length=80)
    name: str = Field(..., min_length=1, max_length=120)
    description: str = ""
    slots: list[ShellSlot] = Field(..., min_length=1)


class DayShellSelection(BaseModel):
    """Shell selected for a specific day. The frontend is the canonical home of
    shell definitions (built-in or custom), so every selection must carry its
    explicit slots — the backend never resolves a shell by id."""

    day_index: int = Field(..., ge=0, le=MAX_DAYS - 1)
    shell_id: str = Field(..., min_length=1, max_length=80)
    shell_name: str | None = Field(default=None, min_length=1, max_length=120)
    shell_description: str | None = Field(default=None, max_length=300)
    slots: list[ShellSlot] = Field(..., min_length=1)


class GenerateItineraryRequest(BaseModel):
    """Inputs from Step 1 of the builder plus the operator's Payload JWT.

    `payload_jwt` is used only to read candidate records over Payload REST; the
    backend never writes. `brief` is the Generation Brief (core creative input).
    """

    location: str = Field(
        ...,
        min_length=1,
        max_length=300,
        description="locationKey: country|city|neighborhood",
    )
    title: str = Field(..., min_length=1, max_length=300)
    brief: str = Field(
        ..., min_length=1, max_length=MAX_BRIEF_CHARS, description="Generation Brief"
    )
    day_count: int = Field(..., ge=MIN_DAYS, le=MAX_DAYS)
    payload_jwt: str = Field(..., min_length=1)
    shared_neighborhoods: list[int] = Field(default_factory=list)
    day_shells: list[DayShellSelection] = Field(..., min_length=1)
    model_name: str | None = Field(default=None, max_length=120)
    # Lodging inclusion is an explicit operator decision (default on) — the AI
    # never infers it from the brief.
    include_lodging: bool = True

    @model_validator(mode="after")
    def _one_shell_per_day(self) -> "GenerateItineraryRequest":
        indexes = [selection.day_index for selection in self.day_shells]
        if len(indexes) != len(set(indexes)):
            raise ValueError("day_shells contains duplicate day_index entries")
        missing = sorted(set(range(self.day_count)) - set(indexes))
        if missing:
            raise ValueError(
                f"day_shells must cover every day; missing day_index: {missing}"
            )
        return self


class Candidate(BaseModel):
    """A Payload record flattened for scoring/ordering, independent of which
    collection or nested tab it came from (per-collection normalization)."""

    id: int
    title: str
    category: Category
    price_level: int | None = Field(default=None, ge=1, le=4)
    tags: list[str] = Field(default_factory=list)
    type: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    # Best-effort neighborhood key for multi-day clustering (from locationRef).
    neighborhood_key: str | None = None


class ScoredCandidate(BaseModel):
    """A candidate with the LLM-assigned Fit Score (0–100) and the raw fit note
    the reason stage may reuse."""

    candidate: Candidate
    fit_score: int = Field(..., ge=0, le=100)
    fit_note: str = ""


class IntentSpec(BaseModel):
    """Structured creative intent the LLM extracts from the brief. Day Shells,
    not this model, define retrieval categories and stop count."""

    # Inclusive price band (1–4); None bound means "no constraint".
    price_min: int | None = Field(default=None, ge=1, le=4)
    price_max: int | None = Field(default=None, ge=1, le=4)
    # Free-text keywords per category for the scorer to match against tags.
    keywords: list[str] = Field(default_factory=list)
    # Style descriptors only — whether lodging is included at all is the
    # request's `include_lodging`, not an AI inference.
    lodging_keywords: list[str] = Field(default_factory=list)


class PlanStop(BaseModel):
    """One filled Shell Slot: a chosen record + the Selection Reason."""

    slot_id: str
    slot_label: str
    daypart: Daypart
    block_type: str
    collection: Category
    item: int
    title: str
    selection_reason: str = ""


class PlanLodging(BaseModel):
    """The day's Lodging Anchor; `item` is null when no suitable hotel exists."""

    block_type: str = WHERE_STAYING_BLOCK_TYPE
    collection: Literal["accommodations"] = "accommodations"
    item: int | None = None
    title: str | None = None
    selection_reason: str = ""


class PlanDay(BaseModel):
    shell_id: str | None = None
    shell_name: str | None = None
    where_staying: list[PlanLodging] = Field(default_factory=list)
    items: list[PlanStop] = Field(default_factory=list)


class SlotIssue(BaseModel):
    day_index: int
    shell_id: str
    slot_id: str
    slot_label: str
    daypart: Daypart
    issue: str


AutobuildStepName = Literal["intent", "retrieve", "lodging", "slot", "reasons"]
AutobuildStepStatus = Literal["ok", "warning", "failed"]


class AutobuildStepEvent(BaseModel):
    """One entry in the Autobuild Report: a pipeline decision with its outcome,
    decisive evidence (`details`), and the raw model exchange for LLM steps.
    Transient — returned with the run, never persisted."""

    name: AutobuildStepName
    label: str
    status: AutobuildStepStatus = "ok"
    duration_ms: int = 0
    day_index: int | None = None
    slot_id: str | None = None
    model: str | None = None
    prompt: str | None = None
    output: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)


class GenerateItineraryResponse(BaseModel):
    """Plan JSON returned to the frontend. Slots only — no blurbs/images."""

    days: list[PlanDay]
    plan_overview: str = ""
    model_used: str
    # Surfaced so the operator understands gaps (e.g. no hotel in this city).
    notes: list[str] = Field(default_factory=list)
    slot_issues: list[SlotIssue] = Field(default_factory=list)
    # Autobuild Report: run-level diagnostic timeline (one entry per decision).
    steps: list[AutobuildStepEvent] = Field(default_factory=list)
