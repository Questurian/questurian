"""Stable contracts for composing one listicle target."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

from app.shared.writer_invocation import invoke_writer_model

from .angle_assignment import ListicleAngle
from .listicle_writer_contracts import (
    ListTone,
    ListicleArticleType,
    ListicleCategory,
    ListicleFieldType,
)
from .research_profile import ResearchProfile
from .writer_brief import WriterBrief, WriterBriefTrace, run_writer_brief

CompositionStatus = Literal["generated", "error"]
StepStatus = Literal["ok", "skipped", "failed"]


class WriterModelResult(Protocol):
    text: str
    model_name: str


class WriterInvoker(Protocol):
    def __call__(
        self,
        *,
        prompt: str,
        model_name: str,
        max_tokens: int,
        temperature: float,
    ) -> WriterModelResult: ...


class WriterBriefRunner(Protocol):
    def __call__(
        self,
        *,
        venue_name: str,
        location_label: str,
        category: str,
        angle: ListicleAngle | None,
        research_profile: ResearchProfile,
    ) -> tuple[WriterBrief, WriterBriefTrace]: ...


@dataclass(frozen=True)
class ListicleCompositionTarget:
    target_id: str
    field_type: ListicleFieldType
    category: ListicleCategory | None = None
    display_name: str | None = None
    research_subject: str | None = None
    location_label: str | None = None
    current_content: str = ""
    supporting_context: str | None = None


@dataclass(frozen=True)
class ListicleCompositionSettings:
    article_title: str
    article_type: ListicleArticleType
    article_location: str
    article_context: str
    custom_instruction: str
    model_name: str
    list_tone: ListTone | None = None
    requested_angle: ListicleAngle | None = None
    effective_angle: ListicleAngle | None = None


@dataclass(frozen=True)
class ListicleCompositionStep:
    name: str
    status: StepStatus
    prompt: str | None = None
    output: str | None = None
    model: str | None = None
    details: dict[str, Any] = field(default_factory=dict)
    duration_ms: int = 0


@dataclass(frozen=True)
class ListicleCompositionResult:
    target_id: str
    status: CompositionStatus
    model_used: str
    markdown: str | None = None
    source_urls: list[str] = field(default_factory=list)
    validation_errors: list[str] = field(default_factory=list)
    error_message: str | None = None
    low_confidence: bool = False
    warnings: list[str] = field(default_factory=list)
    requested_angle: ListicleAngle | None = None
    effective_angle: ListicleAngle | None = None
    steps: list[ListicleCompositionStep] = field(default_factory=list)


@dataclass(frozen=True)
class ListicleCompositionDeps:
    invoke_writer: WriterInvoker = invoke_writer_model
    run_writer_brief: WriterBriefRunner = run_writer_brief


class ListicleCompositionWriterError(Exception):
    """Raised when writer model calls fail and HTTP adapter should return 502."""
