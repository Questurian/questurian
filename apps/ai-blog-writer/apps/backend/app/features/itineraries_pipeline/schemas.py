"""Itinerary Autobuild — request/response and internal pipeline models.

See ADR 0014 (function-calling over MCP) and ADR 0015 (fit-scoring on existing
tags). The AI owns intent extraction and fit-scoring; deterministic code owns
retrieval, selection/clustering, and ordering. The backend reads Payload with
the operator's JWT and returns a plan; the frontend owns all writes.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

# The four data collections this pipeline can pull from, plus the Payload
# `relationTo` slug each maps to and the itinerary block type the builder uses.
Category = Literal["dining", "accommodations", "attractions", "nightlife"]

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


class GenerateItineraryRequest(BaseModel):
    """Inputs from Step 1 of the builder plus the operator's Payload JWT.

    `payload_jwt` is used only to read candidate records over Payload REST; the
    backend never writes. `brief` is the Generation Brief (core creative input).
    """

    location: str = Field(..., min_length=1, max_length=300, description="locationKey: country|city|neighborhood")
    title: str = Field(..., min_length=1, max_length=300)
    brief: str = Field(..., min_length=1, max_length=MAX_BRIEF_CHARS, description="Generation Brief")
    day_count: int = Field(..., ge=MIN_DAYS, le=MAX_DAYS)
    payload_jwt: str = Field(..., min_length=1)
    shared_neighborhoods: list[int] = Field(default_factory=list)
    model_name: str | None = Field(default=None, max_length=120)


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
    """Structured query intent the LLM extracts from the brief. Drives both
    deterministic retrieval (categories, price band) and selection (pacing)."""

    categories: list[Category] = Field(default_factory=list)
    # Inclusive price band (1–4); None bound means "no constraint".
    price_min: int | None = Field(default=None, ge=1, le=4)
    price_max: int | None = Field(default=None, ge=1, le=4)
    # Free-text keywords per category for the scorer to match against tags.
    keywords: list[str] = Field(default_factory=list)
    wants_lodging: bool = True
    # Soft pacing signal → stops per day (excludes the lodging anchor).
    stops_per_day: int = Field(default=4, ge=1, le=8)
    lodging_keywords: list[str] = Field(default_factory=list)


class PlanStop(BaseModel):
    """One filled slot: a chosen record + the Selection Reason."""

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
    where_staying: list[PlanLodging] = Field(default_factory=list)
    items: list[PlanStop] = Field(default_factory=list)


class GenerateItineraryResponse(BaseModel):
    """Plan JSON returned to the frontend. Slots only — no blurbs/images."""

    days: list[PlanDay]
    plan_overview: str = ""
    model_used: str
    # Surfaced so the operator understands gaps (e.g. no hotel in this city).
    notes: list[str] = Field(default_factory=list)
