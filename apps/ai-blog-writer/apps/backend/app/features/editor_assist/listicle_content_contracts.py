"""HTTP contracts for Listicle Content Generation."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from .contracts import (
    MAX_ARTICLE_CONTEXT_CHARS,
    MAX_ARTICLE_TITLE_CHARS,
    MAX_BLOCK_CHARS,
    MAX_PROMPT_CHARS,
    ListTone,
)
from .listicle_writer_contracts import (
    ListicleArticleType,
    ListicleCategory,
)

PayloadCollectionSlug = Literal[
    "dining", "accommodations", "attractions", "nightlife", "key-locations"
]
ListicleAngleRequest = Literal[
    # Dining
    "signature-dish",
    "atmosphere",
    "founders-backstory",
    "insider-tip",
    "best-for",
    "whats-different",
    # Accommodations (ADR 0011)
    "location-and-setting",
    "view-and-vista",
    "design-and-aesthetic",
    "signature-amenity",
    "food-and-beverage",
    "trip-fit",
    "property-backstory",
    "booking-tip",
    # Attractions
    "signature-feature",
    "setting",
    "history-built",
    "visit-time-tip",
    "best-for-visit-type",
    # Nightlife (single-angle pool per ADR 0008)
    "best-for-night",
]


class GenerateListicleTargetRequest(BaseModel):
    target_id: str = Field(min_length=1, max_length=200)
    field_type: Literal["intro", "blurb"]
    category: ListicleCategory | None = None
    display_name: str | None = Field(default=None, max_length=240)
    research_subject: str | None = Field(default=None, max_length=240)
    location_label: str | None = Field(default=None, max_length=300)
    current_content: str = Field(default="", max_length=MAX_BLOCK_CHARS)
    supporting_context: str | None = Field(default=None, max_length=12000)
    payload_doc_id: str | None = Field(default=None, max_length=64)
    payload_collection: PayloadCollectionSlug | None = None
    angle: ListicleAngleRequest | None = None


class GenerateListicleContentRequest(BaseModel):
    article_title: str = Field(min_length=1, max_length=MAX_ARTICLE_TITLE_CHARS)
    article_type: ListicleArticleType
    location_label: str = Field(min_length=1, max_length=300)
    article_context: str | None = Field(
        default=None, max_length=MAX_ARTICLE_CONTEXT_CHARS
    )
    model_name: str | None = Field(default=None, max_length=120)
    custom_instruction: str | None = Field(default=None, max_length=MAX_PROMPT_CHARS)
    skip_existing: bool = False
    list_tone: ListTone | None = None
    targets: list[GenerateListicleTargetRequest] = Field(default_factory=list)


StepEventName = Literal[
    "critical_fields_evaluated",
    "research_profile_completed",
    "writer_brief_completed",
    "writer_called",
    "validated",
    "retry_called",
    "finalized",
]
StepEventStatus = Literal["ok", "skipped", "failed"]


class StepEvent(BaseModel):
    name: StepEventName
    status: StepEventStatus
    prompt: str | None = None
    output: str | None = None
    model: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)
    duration_ms: int = 0


class GenerateListicleTargetResponse(BaseModel):
    target_id: str
    status: Literal["generated", "skipped", "error"]
    markdown: str | None = None
    model_used: str
    source_urls: list[str] = Field(default_factory=list)
    validation_errors: list[str] = Field(default_factory=list)
    error_message: str | None = None
    low_confidence: bool = False
    warnings: list[str] = Field(default_factory=list)
    requested_angle: ListicleAngleRequest | None = None
    effective_angle: ListicleAngleRequest | None = None
    steps: list[StepEvent] = Field(default_factory=list)


class GenerateListicleContentResponse(BaseModel):
    results: dict[str, GenerateListicleTargetResponse]


class ListicleGuidelinesResponse(BaseModel):
    angles: dict[str, str]
    tones: dict[str, str]


__all__ = [
    "GenerateListicleContentRequest",
    "GenerateListicleContentResponse",
    "GenerateListicleTargetRequest",
    "GenerateListicleTargetResponse",
    "ListicleAngleRequest",
    "ListicleGuidelinesResponse",
    "PayloadCollectionSlug",
    "StepEvent",
    "StepEventName",
    "StepEventStatus",
]
