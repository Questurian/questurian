"""Pydantic request models for the URL2Blog API.

Extracted verbatim from url2blog/routes.py.
"""

from pydantic import BaseModel, model_validator

from .config import (
    DEFAULT_MAX_EXTERNAL_CONTEXT_ITEMS,
    URL2BLOG_DEFAULT_EXECUTION_PROFILE,
    URL2BLOG_DEFAULT_MODEL,
)


class ExtractRequest(BaseModel):
    url: str
    model_name: str | None = None
    include_debug: bool = False


class Stage2ClassifyRequest(BaseModel):
    title: str
    content: str
    source_url: str | None = None
    language: str | None = None
    model_name: str | None = None
    include_debug: bool = False


class PipelineV2Request(BaseModel):
    run_id: str | None = None
    url: str | None = None
    pasted_text: str | None = None
    include_debug: bool = False
    narrative_focus: str | None = None
    tone_id: str | None = None
    enable_web_enrichment: bool = True
    enable_editorial_augmentation: bool = True
    execution_profile: str | None = URL2BLOG_DEFAULT_EXECUTION_PROFILE
    max_external_context_items: int = DEFAULT_MAX_EXTERNAL_CONTEXT_ITEMS
    model_name: str | None = URL2BLOG_DEFAULT_MODEL
    # Writing-quality model for the compose / editorial stages. None -> pinned
    # default (URL2BLOG_COMPOSE_MODEL). Validated against the shared allowlist.
    writing_model: str | None = None

    @model_validator(mode="after")
    def validate_input_source(self) -> "PipelineV2Request":
        has_url = bool((self.url or "").strip())
        has_text = bool((self.pasted_text or "").strip())
        if not has_url and not has_text:
            raise ValueError("Either url or pasted_text must be provided")
        return self
