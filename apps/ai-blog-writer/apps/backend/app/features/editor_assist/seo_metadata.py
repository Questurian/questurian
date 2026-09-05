"""Structured SEO metadata generation."""

import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.staff_auth import require_staff
from app.shared.model_calls import resolve
from app.shared.writer_invocation import WriterModelError

from .contracts import (
    MAX_ARTICLE_CONTEXT_CHARS,
    MAX_ARTICLE_TITLE_CHARS,
    MAX_BLOCK_CHARS,
    MAX_PROMPT_CHARS,
)
from .dependencies import EditorAssistDependencies, get_editor_assist_dependencies

router = APIRouter()
logger = logging.getLogger(__name__)

SEO_PATCH_TOOL_NAME = "emit_seo_patch"

# Forced-tool calls now dispatch per provider (see utils.invoke_structured_tool),
# so this endpoint accepts Gemini writers too. While Anthropic is switched off a
# claude-* default would just be substituted, so pin the Google writer directly.
JOB = "editor.seo_metadata"

SEO_PATCH_INPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "seoTitle": {
            "type": "string",
            "description": "SEO title, <= 60 characters, keyword-rich.",
        },
        "metaDescription": {
            "type": "string",
            "description": "Compelling meta description, around 150-160 characters.",
        },
        "openGraph": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "title": {"type": "string"},
                "description": {"type": "string"},
                "url": {"type": "string"},
            },
        },
        "twitterCard": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "card": {
                    "type": "string",
                    "enum": ["summary", "summary_large_image"],
                },
                "title": {"type": "string"},
                "description": {"type": "string"},
            },
        },
        # Declared as a string, not an object, on purpose. Gemini tool
        # declarations only let a model fill properties the schema names, so a
        # free-form `{"type": "object"}` with no properties has no fields to
        # write and always comes back as `{}`. A JSON string carries arbitrary
        # JSON-LD through intact; clients already parse this field either way.
        "structuredData": {
            "type": "string",
            "description": (
                "JSON-LD document serialized as a JSON string, e.g. "
                '"{\\"@context\\":\\"https://schema.org\\",\\"@graph\\":[...]}". '
                "Must parse as a JSON object. Only when structured data is "
                "requested."
            ),
        },
        "robots": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "index": {"type": "string", "enum": ["index", "noindex"]},
                "follow": {"type": "string", "enum": ["follow", "nofollow"]},
            },
        },
    },
}


class GenerateSeoMetadataRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=MAX_PROMPT_CHARS)
    seed: str = Field(min_length=1, max_length=MAX_BLOCK_CHARS)
    model_name: str | None = Field(default=None, max_length=120)
    article_title: str | None = Field(
        default=None,
        max_length=MAX_ARTICLE_TITLE_CHARS,
    )
    article_context: str | None = Field(
        default=None,
        max_length=MAX_ARTICLE_CONTEXT_CHARS,
    )


class GenerateSeoMetadataResponse(BaseModel):
    seo_patch: dict[str, Any]
    model_used: str


def _generate_seo_metadata_impl(
    request: GenerateSeoMetadataRequest,
    dependencies: EditorAssistDependencies,
) -> GenerateSeoMetadataResponse:
    prompt = request.prompt.strip()
    seed = request.seed.strip()
    article_title = (
        request.article_title.strip() if request.article_title else "Untitled article"
    )
    article_context = request.article_context.strip() if request.article_context else ""

    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")
    if not seed:
        raise HTTPException(status_code=400, detail="seed is required")

    # An operator's explicit choice, if the UI offered one. None means the
    # gateway decides, and `structured_result.model_name` below reports what
    # actually answered.
    chosen_model = (request.model_name or "").strip() or None

    llm_prompt = f"{prompt}\n\n" f"Article title (reference only):\n{article_title}\n\n"
    if article_context:
        llm_prompt += (
            "Full article context (reference only, source of truth for facts):\n"
            "<<<ARTICLE_CONTEXT>>>\n"
            f"{article_context}\n"
            "<<<END_ARTICLE_CONTEXT>>>\n\n"
        )
    llm_prompt += (
        "Current SEO metadata (seed values, JSON):\n"
        "<<<CURRENT_SEO>>>\n"
        f"{seed}\n"
        "<<<END_CURRENT_SEO>>>\n\n"
        f"Respond by calling the {SEO_PATCH_TOOL_NAME} tool with only the "
        "requested fields filled in. Omit every field the instruction does "
        "not ask for."
    )

    try:
        structured_result = dependencies.invoke_structured_writer(
            job_id=JOB,
            prompt=llm_prompt,
            model_name=chosen_model,
            tool_name=SEO_PATCH_TOOL_NAME,
            tool_description=(
                "Emit the generated SEO metadata patch. Include only the "
                "fields the editor instruction requested."
            ),
            input_schema=SEO_PATCH_INPUT_SCHEMA,
            max_tokens=4096,
        )
    except WriterModelError as exc:
        logger.exception("Editor assist generate-seo failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI SEO generation request failed",
        ) from exc

    if not structured_result.payload:
        raise HTTPException(
            status_code=502, detail="AI SEO generation returned an empty patch"
        )

    return GenerateSeoMetadataResponse(
        seo_patch=structured_result.payload,
        model_used=structured_result.model_name,
    )


@router.post(
    "/generate-seo-metadata",
    response_model=GenerateSeoMetadataResponse,
    dependencies=[Depends(require_staff)],
)
async def generate_seo_metadata(
    request: GenerateSeoMetadataRequest,
    dependencies: Annotated[
        EditorAssistDependencies, Depends(get_editor_assist_dependencies)
    ],
) -> GenerateSeoMetadataResponse:
    try:
        return dependencies.run_graph(
            node_name="editor_assist_generate_seo_metadata",
            step_runner=lambda: _generate_seo_metadata_impl(request, dependencies),
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Editor Assist generate-seo graph failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI SEO generation graph failed",
        ) from exc
