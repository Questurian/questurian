from __future__ import annotations

from datetime import datetime
from typing import Dict, Literal, Optional

from pydantic import BaseModel, Field


class RawVideoRecord(BaseModel):
    video_id: str
    title: str
    description: str
    video_url: str
    published_at: str
    transcript: str
    transcript_status: Literal["completed", "pending", "failed"]
    transcript_extracted_at: str


class PipelineMeta(BaseModel):
    run_id: str
    version: str
    created_at: datetime
    source: str
    notes: Optional[str] = None


class Stage0Output(BaseModel):
    meta: PipelineMeta
    record: RawVideoRecord


# ============================================================
# NEW SIMPLIFIED STAGE OUTPUTS
# ============================================================


class Stage1Output(BaseModel):
    """Stage 1: Extract transcript and clean with AI."""
    video_id: str
    title: str
    cleaned_transcript: str


class Stage2Output(BaseModel):
    """Stage 2: Article type classification."""
    video_id: str
    title: str
    classification: str  # One of 42 allowed article types
    confidence: float    # 0.00 to 1.00
    reasoning: str       # 1-2 sentence explanation
    # Debug fields
    debug_prompt: Optional[str] = None  # Full prompt sent to LLM
    debug_raw_response: Optional[str] = None  # Raw LLM response


class Stage3Output(BaseModel):
    """Stage 3: Article composition with coverage analysis."""
    video_id: str
    title: str
    article_type: str

    # Coverage analysis
    coverage_sufficient: bool
    coverage_analysis: str
    missing_sections: list[str]

    # Content generation
    supplemental_content: Optional[str] = None
    final_article: str
    guideline_used: str

    # Debug fields
    debug_coverage_prompt: Optional[str] = None
    debug_coverage_response: Optional[str] = None
    debug_supplement_prompt: Optional[str] = None
    debug_supplement_response: Optional[str] = None
    debug_composition_prompt: Optional[str] = None
    debug_composition_response: Optional[str] = None


class Stage4Output(BaseModel):
    """Stage 4: Article title generation."""
    video_id: str
    title: str  # The generated title
    content: str  # The article draft from Stage 3

    # Metadata
    article_type: str
    title_guideline_used: str

    # Debug fields
    debug_prompt: Optional[str] = None
    debug_raw_response: Optional[str] = None


# ============================================================
# PIPELINE INFRASTRUCTURE MODELS
# ============================================================


class StageResult(BaseModel):
    run_id: str
    stage: str
    created_at: datetime
    input_refs: Dict[str, str]
    data: Dict[str, object]


class PipelineArtifact(BaseModel):
    run_id: str
    meta: PipelineMeta
    stages: Dict[str, StageResult]
    markdown_path: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
