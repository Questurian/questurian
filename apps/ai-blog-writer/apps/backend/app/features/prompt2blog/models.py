from __future__ import annotations

from typing import Any, List

from pydantic import BaseModel, Field


class SynthesizeRequest(BaseModel):
    blobs: List[str]


class SynthesizeResponse(BaseModel):
    synthesized: str


class ArticleTypeOption(BaseModel):
    name: str
    definition: str


class ClassificationResult(BaseModel):
    id: int
    name: str
    definition: str
    confidence: float
    reasoning: str


class ClassifyRequest(BaseModel):
    cleaned_data: str
    article_types: List[ArticleTypeOption]
    writing_brief: dict[str, Any] | None = None


class ClassifyResponse(BaseModel):
    result: str
    classification: ClassificationResult


class PipelineV4RuntimeRequest(BaseModel):
    """Everything a run needs, derived from the brief and its work order.

    Both stay whole rather than being flattened, so no stage has to
    reconstruct them. They are separate here for the same reason they are
    separate in the contract: the brief rides the whole run and is judged
    against, while the work order stops mattering once research answers it.
    """

    schema_version: int = 4
    brief: dict[str, Any]
    work_order: dict[str, Any]
    # The whole dossier. Groundedness and the readiness follow-up check a draft
    # against every claim there is, so this stays complete.
    evidence: dict[str, Any]
    # What the writer's stages actually receive: the facts a person chose, and
    # the limitations attached to them. Frozen here at the write boundary, so a
    # resumed run reads the packet it was written from rather than rebuilding
    # one from a selection somebody has edited since.
    packet: dict[str, Any]
    instructions: dict[str, Any]
    option_context: dict[str, Any] = Field(default_factory=dict)
    include_debug: bool = True
    enable_editorial_augmentation: bool = False
    model_name: str | None = None
    writing_model: str | None = None
    audit_model: str | None = None
    # Repair defaults to the writing model rather than a constant: it rewrites
    # the same prose, so following the writer is the right default. A route
    # names it only to spend different effort on the rescue than on the draft.
    repair_model: str | None = None
    # The three roles v2 pins and v3 lets a route name. Optional, so a request
    # that omits them gets the `P2B_V3_*_MODEL` defaults and routes as before.
    outline_model: str | None = None
    groundedness_model: str | None = None
    model_stack_id: str | None = None
