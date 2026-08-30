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


class PipelineV2RuntimeRequest(BaseModel):
    cleaned_data: str
    raw_sources: List[str] = Field(default_factory=list)
    writing_brief: dict[str, Any] = Field(default_factory=dict)
    article_type_id: int
    option_context: dict[str, Any] = Field(default_factory=dict)
    include_debug: bool = True
    enable_editorial_augmentation: bool = False
    model_name: str | None = None
    writing_model: str | None = None
    audit_model: str | None = None
    model_stack_id: str | None = None


class PipelineV3RuntimeRequest(BaseModel):
    """Everything a v3 run needs, derived only from an approved commission.

    Deliberately not a flattened v2 request: the commission and the exact
    evidence records stay whole so no stage has to reconstruct them.
    """

    schema_version: int = 3
    commission: dict[str, Any]
    evidence: dict[str, Any]
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
    title_model: str | None = None
    model_stack_id: str | None = None


class Prompt2BlogInputRequest(BaseModel):
    article_type_id: int
    source_material: List[str] = Field(default_factory=list)
    article_goal: str
    target_reader: str
    destination_context: str
    angle: str | None = None
    tone_id: str
    length_id: str
    brand_voice_id: str | None = None
    primary_keyword: str | None = None
    secondary_keywords: List[str] = Field(default_factory=list)
    call_to_action: str | None = None
    must_include: List[str] = Field(default_factory=list)
    audience_profile: str | None = None
    prompt_enhance: bool = True
    creativity_level: str = "medium"
    negative_instructions: List[str] = Field(default_factory=list)
    include_debug: bool = True
    enable_editorial_augmentation: bool = False
    model_name: str | None = None
    writing_model: str | None = None
    audit_model: str | None = None
    model_stack_id: str | None = None
