"""
Editor Assist API routes.

Provides lightweight AI rewrite actions for staging block editors.
"""
import logging
import re
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from utils import get_vertex_llm
from .graph import (
    run_editor_assist_generate_title_graph,
    run_editor_assist_listicle_generation_graph,
    run_editor_assist_rewrite_graph,
)
from .listicle_writer import (
    ListicleArticleType,
    ListicleCategory,
    ListicleWriterTarget,
    build_generation_prompt,
    build_retry_prompt,
    strip_generation_fence,
    validate_generated_text,
)

router = APIRouter(prefix="/editor-assist", tags=["editor-assist"])
logger = logging.getLogger(__name__)


def invoke_google_grounded_text(*args: Any, **kwargs: Any) -> Any:
    """Import grounding lazily so route modules stay importable under light test stubs."""
    from utils import invoke_google_grounded_text as _invoke_google_grounded_text

    return _invoke_google_grounded_text(*args, **kwargs)


DEFAULT_MODEL = "gemini-2.5-flash-lite"
MAX_PROMPT_CHARS = 10000
MAX_BLOCK_CHARS = 24000
MAX_ARTICLE_TITLE_CHARS = 300
MAX_ARTICLE_CONTEXT_CHARS = 120000
MAX_TITLE_CHARS = 200

BLOCK_REWRITE_PROMPT = """You are an expert editorial rewriting assistant.

You will receive:
1) An editor instruction.
2) The article title (reference only).
3) Optional full-article context (reference only).
4) One markdown article block that is the only section to rewrite.

Rewrite ONLY that single block according to the instruction.

Hard rules:
- Return only rewritten block content (markdown), no commentary.
- Treat the title and full-article context as reference only.
- Do not rewrite or summarize any other section.
- Preserve markdown semantics and readability.
- Do not add meta notes, explanations, or surrounding prose.
- Keep the response as one standalone block body.
- Do not wrap the result in code fences.

Return ONLY using this exact envelope:
<<<BLOCK>>>
[rewritten markdown block content]
<<<END_BLOCK>>>"""


class RewriteBlockRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=MAX_PROMPT_CHARS)
    block_content: str = Field(min_length=1, max_length=MAX_BLOCK_CHARS)
    model_name: str | None = Field(default=None, max_length=120)
    article_title: str | None = Field(
        default=None,
        max_length=MAX_ARTICLE_TITLE_CHARS,
    )
    article_context: str | None = Field(
        default=None,
        max_length=MAX_ARTICLE_CONTEXT_CHARS,
    )


class RewriteBlockResponse(BaseModel):
    rewritten_content: str
    model_used: str


def _safe_text(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    content = getattr(value, "content", None)
    if isinstance(content, str):
        return content.strip()
    return ""


def _strip_markdown_fence(text: str) -> str:
    fenced = re.match(r"^\s*```(?:markdown|md)?\s*(.*?)\s*```\s*$", text, flags=re.S | re.I)
    if fenced:
        return fenced.group(1).strip()
    return text.strip()


def _extract_rewritten_block(raw_response: str) -> str:
    envelope_match = re.search(
        r"<<<BLOCK>>>\s*(.*?)\s*<<<END_BLOCK>>>",
        raw_response,
        flags=re.S | re.I,
    )
    if envelope_match:
        extracted = envelope_match.group(1).strip()
        return _strip_markdown_fence(extracted)

    # Fallback in case the model ignores envelope instructions.
    return _strip_markdown_fence(raw_response)


TITLE_IMPROVE_PROMPT = """You are a headline editor for a travel and lifestyle listicle publication.

You will receive an existing article title and an editor instruction for how to improve it.

Rules:
- Return only the final improved title text.
- No quotes, no markdown, no explanation, no commentary.
- Output exactly one line."""


class GenerateTitleRequest(BaseModel):
    current_title: str = Field(min_length=1, max_length=MAX_TITLE_CHARS)
    prompt: str = Field(min_length=1, max_length=MAX_PROMPT_CHARS)
    model_name: str | None = Field(default=None, max_length=120)


class GenerateTitleResponse(BaseModel):
    title: str


class GenerateListicleTargetRequest(BaseModel):
    target_id: str = Field(min_length=1, max_length=200)
    field_type: Literal["intro", "blurb"]
    category: ListicleCategory | None = None
    display_name: str | None = Field(default=None, max_length=240)
    research_subject: str | None = Field(default=None, max_length=240)
    location_label: str | None = Field(default=None, max_length=300)
    current_content: str = Field(default="", max_length=MAX_BLOCK_CHARS)
    supporting_context: str | None = Field(default=None, max_length=12000)


class GenerateListicleContentRequest(BaseModel):
    article_title: str = Field(min_length=1, max_length=MAX_ARTICLE_TITLE_CHARS)
    article_type: ListicleArticleType
    location_label: str = Field(min_length=1, max_length=300)
    article_context: str | None = Field(default=None, max_length=MAX_ARTICLE_CONTEXT_CHARS)
    model_name: str | None = Field(default=None, max_length=120)
    custom_instruction: str | None = Field(default=None, max_length=MAX_PROMPT_CHARS)
    skip_existing: bool = False
    targets: list[GenerateListicleTargetRequest] = Field(default_factory=list)


class GenerateListicleTargetResponse(BaseModel):
    target_id: str
    status: Literal["generated", "skipped", "error"]
    markdown: str | None = None
    model_used: str
    source_urls: list[str] = Field(default_factory=list)
    validation_errors: list[str] = Field(default_factory=list)
    error_message: str | None = None


class GenerateListicleContentResponse(BaseModel):
    results: dict[str, GenerateListicleTargetResponse]


def _extract_generated_title(raw_response: str) -> str:
    # Strip any stray envelope tags the model may have included
    cleaned = re.sub(r"<<<[A-Z_]+>>>", "", raw_response, flags=re.I).strip()
    # Take the first non-empty line (titles should be one line)
    for line in cleaned.splitlines():
        line = line.strip()
        if line:
            return line
    return cleaned


def _generate_title_impl(request: GenerateTitleRequest) -> GenerateTitleResponse:
    current_title = request.current_title.strip()
    prompt = request.prompt.strip()

    if not current_title:
        raise HTTPException(status_code=400, detail="current_title is required")
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")

    model_used = (request.model_name or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    llm_prompt = (
        f"{TITLE_IMPROVE_PROMPT}\n\n"
        f"Current title: {current_title}\n\n"
        f"Editor instruction: {prompt}"
    )

    try:
        llm = get_vertex_llm(
            temperature=0.4,
            model_name=model_used,
        )
        raw_result = llm.invoke(llm_prompt)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Editor assist generate-title failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI title generation request failed",
        ) from exc

    raw_text = _safe_text(raw_result)
    if not raw_text:
        raise HTTPException(status_code=502, detail="AI title generation returned empty output")

    title = _extract_generated_title(raw_text)
    if not title:
        raise HTTPException(status_code=502, detail="AI title generation returned empty title")

    return GenerateTitleResponse(title=title)


@router.post("/generate-title", response_model=GenerateTitleResponse)
async def generate_title(request: GenerateTitleRequest) -> GenerateTitleResponse:
    try:
        return run_editor_assist_generate_title_graph(
            step_runner=lambda: _generate_title_impl(request),
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Editor Assist graph generate-title failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI title generation graph failed",
        ) from exc


def _resolve_grounded_model(model_name: str) -> str:
    resolved = model_name.strip()
    if resolved in {"gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.5-pro"}:
        return resolved
    return "gemini-2.5-flash"


def _merge_urls(*groups: list[str]) -> list[str]:
    merged: list[str] = []
    seen: set[str] = set()
    for group in groups:
        for url in group:
            if url in seen:
                continue
            seen.add(url)
            merged.append(url)
    return merged


def _to_listicle_writer_target(request_target: GenerateListicleTargetRequest) -> ListicleWriterTarget:
    return ListicleWriterTarget(
        target_id=request_target.target_id,
        field_type=request_target.field_type,
        category=request_target.category,
        display_name=request_target.display_name,
        research_subject=request_target.research_subject,
        location_label=request_target.location_label,
        current_content=request_target.current_content or "",
        supporting_context=request_target.supporting_context or "",
    )


def _generate_single_listicle_target(
    *,
    article_title: str,
    article_type: ListicleArticleType,
    article_location: str,
    article_context: str,
    target: ListicleWriterTarget,
    custom_instruction: str,
    model_name: str,
) -> GenerateListicleTargetResponse:
    prompt = build_generation_prompt(
        article_title=article_title,
        article_type=article_type,
        article_location=article_location,
        target=target,
        article_context=article_context,
        custom_instruction=custom_instruction,
    )
    grounded_model = _resolve_grounded_model(model_name)
    grounded = invoke_google_grounded_text(
        prompt,
        model_name=grounded_model,
        fallback_model_name="gemini-2.5-flash",
        max_tokens=1536,
        temperature=0.15,
    )
    if grounded is None:
        raise HTTPException(
            status_code=503,
            detail="Grounded research is unavailable for listicle generation",
        )

    candidate = strip_generation_fence(grounded.text)
    validation_errors = validate_generated_text(
        field_type=target.field_type,
        text=candidate,
    )
    source_urls = grounded.source_urls
    model_used = grounded.model_name

    if validation_errors:
        retry_prompt = build_retry_prompt(
            article_title=article_title,
            article_type=article_type,
            article_location=article_location,
            target=target,
            article_context=article_context,
            custom_instruction=custom_instruction,
            current_output=candidate,
            validation_errors=validation_errors,
        )
        retry_grounded = invoke_google_grounded_text(
            retry_prompt,
            model_name=grounded_model,
            fallback_model_name="gemini-2.5-flash",
            max_tokens=1536,
            temperature=0.1,
        )
        if retry_grounded is None:
            raise HTTPException(
                status_code=503,
                detail="Grounded research is unavailable for listicle generation",
            )
        candidate = strip_generation_fence(retry_grounded.text)
        validation_errors = validate_generated_text(
            field_type=target.field_type,
            text=candidate,
        )
        source_urls = _merge_urls(source_urls, retry_grounded.source_urls)
        model_used = retry_grounded.model_name

    if validation_errors:
        return GenerateListicleTargetResponse(
            target_id=target.target_id,
            status="error",
            model_used=model_used,
            source_urls=source_urls,
            validation_errors=validation_errors,
            error_message="Generated content failed validation after retry.",
        )

    return GenerateListicleTargetResponse(
        target_id=target.target_id,
        status="generated",
        markdown=candidate,
        model_used=model_used,
        source_urls=source_urls,
    )


def _generate_listicle_content_impl(
    request: GenerateListicleContentRequest,
) -> GenerateListicleContentResponse:
    article_title = request.article_title.strip()
    article_location = request.location_label.strip()
    article_context = request.article_context.strip() if request.article_context else ""
    custom_instruction = request.custom_instruction.strip() if request.custom_instruction else ""

    if not article_title:
        raise HTTPException(status_code=400, detail="article_title is required")
    if not article_location:
        raise HTTPException(status_code=400, detail="location_label is required")
    if not request.targets:
        raise HTTPException(status_code=400, detail="At least one target is required")

    model_used = (request.model_name or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    results: dict[str, GenerateListicleTargetResponse] = {}

    for request_target in request.targets:
        target = _to_listicle_writer_target(request_target)
        current_content = target.current_content.strip()
        if request.skip_existing and current_content:
            results[target.target_id] = GenerateListicleTargetResponse(
                target_id=target.target_id,
                status="skipped",
                model_used=model_used,
                markdown=current_content,
            )
            continue

        try:
            results[target.target_id] = _generate_single_listicle_target(
                article_title=article_title,
                article_type=request.article_type,
                article_location=article_location,
                article_context=article_context,
                target=target,
                custom_instruction=custom_instruction,
                model_name=model_used,
            )
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "Listicle generation failed for target %s: %s",
                target.target_id,
                exc,
            )
            results[target.target_id] = GenerateListicleTargetResponse(
                target_id=target.target_id,
                status="error",
                model_used=model_used,
                error_message=str(exc),
            )

    return GenerateListicleContentResponse(results=results)


def _rewrite_block_impl(request: RewriteBlockRequest) -> RewriteBlockResponse:
    prompt = request.prompt.strip()
    block_content = request.block_content.strip()
    article_title = (
        request.article_title.strip() if request.article_title else "Untitled article"
    )
    article_context = request.article_context.strip() if request.article_context else ""

    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")
    if not block_content:
        raise HTTPException(status_code=400, detail="block_content is required")

    model_used = (request.model_name or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    llm_prompt = (
        f"{BLOCK_REWRITE_PROMPT}\n\n"
        f"Editor instruction:\n{prompt}\n\n"
        f"Article title (reference only):\n{article_title}\n\n"
    )

    if article_context:
        llm_prompt += (
            "Full article context for reference only. "
            "Do not rewrite this context. Rewrite only the current markdown block.\n"
            "<<<ARTICLE_CONTEXT>>>\n"
            f"{article_context}\n"
            "<<<END_ARTICLE_CONTEXT>>>\n\n"
        )

    llm_prompt += (
        "Current markdown block to rewrite:\n"
        "<<<CURRENT_BLOCK>>>\n"
        f"{block_content}\n"
        "<<<END_CURRENT_BLOCK>>>"
    )

    try:
        llm = get_vertex_llm(
            temperature=0.1,
            max_tokens=8192,
            model_name=model_used,
        )
        raw_result = llm.invoke(llm_prompt)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Editor assist rewrite failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI rewrite request failed",
        ) from exc

    raw_text = _safe_text(raw_result)
    if not raw_text:
        raise HTTPException(status_code=502, detail="AI rewrite returned empty output")

    rewritten_content = _extract_rewritten_block(raw_text)
    if not rewritten_content:
        raise HTTPException(status_code=502, detail="AI rewrite returned empty block content")

    return RewriteBlockResponse(
        rewritten_content=rewritten_content,
        model_used=model_used,
    )


@router.post("/rewrite-block", response_model=RewriteBlockResponse)
async def rewrite_block(request: RewriteBlockRequest) -> RewriteBlockResponse:
    try:
        return run_editor_assist_rewrite_graph(
            step_runner=lambda: _rewrite_block_impl(request),
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Editor Assist graph rewrite failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI rewrite graph failed",
        ) from exc


@router.post("/generate-listicle-content", response_model=GenerateListicleContentResponse)
async def generate_listicle_content(
    request: GenerateListicleContentRequest,
) -> GenerateListicleContentResponse:
    try:
        return run_editor_assist_listicle_generation_graph(
            step_runner=lambda: _generate_listicle_content_impl(request),
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Editor Assist graph generate-listicle-content failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI listicle generation graph failed",
        ) from exc
