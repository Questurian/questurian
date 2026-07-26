"""Editorial title and block-rewrite actions."""

import logging
import re
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.shared.prompts import ANTI_AI_TELLS_FULL
from app.shared.text import enforce_anti_ai_tells_markdown
from app.shared.writer_invocation import WriterModelError

from .contracts import (
    DEFAULT_MODEL,
    MAX_ARTICLE_CONTEXT_CHARS,
    MAX_ARTICLE_TITLE_CHARS,
    MAX_BLOCK_CHARS,
    MAX_PROMPT_CHARS,
    MAX_TITLE_CHARS,
)
from .dependencies import EditorAssistDependencies, get_editor_assist_dependencies

router = APIRouter()
logger = logging.getLogger(__name__)

BLOCK_REWRITE_PROMPT = """You are an expert editorial rewriting assistant.

You will receive:
1) An editor instruction.
2) The article title (reference only).
3) Optional full-article context (reference only).
4) One markdown article block that is the only section to rewrite.

Rewrite ONLY that single block according to the instruction.

Write for readers first and SEO second. Use natural travel-news language, avoid \
keyword stuffing, avoid repetitive SEO headings, and make the article feel edited \
by a human. Include SEO elements only where they improve clarity: a strong \
headline, concise subhead, clean section structure, accurate metadata, and \
natural keywords.

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
    fenced = re.match(
        r"^\s*```(?:markdown|md)?\s*(.*?)\s*```\s*$", text, flags=re.S | re.I
    )
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


def _extract_generated_title(raw_response: str) -> str:
    # Strip any stray envelope tags the model may have included
    cleaned = re.sub(r"<<<[A-Z_]+>>>", "", raw_response, flags=re.I).strip()
    # Take the first non-empty line (titles should be one line)
    for line in cleaned.splitlines():
        line = line.strip()
        if line:
            return line
    return cleaned


def _generate_title_impl(
    request: GenerateTitleRequest,
    dependencies: EditorAssistDependencies,
) -> GenerateTitleResponse:
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
        writer_result = dependencies.invoke_writer(
            prompt=llm_prompt,
            model_name=model_used,
            max_tokens=2048,
            temperature=0.4,
        )
    except WriterModelError as exc:
        logger.exception("Editor assist generate-title failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI title generation request failed",
        ) from exc

    raw_text = writer_result.text
    if not raw_text:
        raise HTTPException(
            status_code=502, detail="AI title generation returned empty output"
        )

    title = _extract_generated_title(raw_text)
    if not title:
        raise HTTPException(
            status_code=502, detail="AI title generation returned empty title"
        )

    return GenerateTitleResponse(title=title)


@router.post("/generate-title", response_model=GenerateTitleResponse)
async def generate_title(
    request: GenerateTitleRequest,
    dependencies: Annotated[
        EditorAssistDependencies, Depends(get_editor_assist_dependencies)
    ],
) -> GenerateTitleResponse:
    try:
        return dependencies.run_graph(
            node_name="editor_assist_generate_title",
            step_runner=lambda: _generate_title_impl(request, dependencies),
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Editor Assist graph generate-title failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI title generation graph failed",
        ) from exc


def _rewrite_block_impl(
    request: RewriteBlockRequest,
    dependencies: EditorAssistDependencies,
) -> RewriteBlockResponse:
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
        f"\n\n{ANTI_AI_TELLS_FULL}"
    )

    try:
        writer_result = dependencies.invoke_writer(
            prompt=llm_prompt,
            model_name=model_used,
            max_tokens=8192,
            temperature=0.1,
        )
    except WriterModelError as exc:
        logger.exception("Editor assist rewrite failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI rewrite request failed",
        ) from exc

    raw_text = writer_result.text
    if not raw_text:
        raise HTTPException(status_code=502, detail="AI rewrite returned empty output")

    rewritten_content = _extract_rewritten_block(raw_text)
    if not rewritten_content:
        raise HTTPException(
            status_code=502, detail="AI rewrite returned empty block content"
        )

    rewritten_content = enforce_anti_ai_tells_markdown(
        rewritten_content,
        repair=lambda repair_prompt: dependencies.invoke_writer(
            prompt=repair_prompt,
            model_name=model_used,
            max_tokens=8192,
            temperature=0.1,
        ).text,
        context="editor_assist block rewrite",
    )

    return RewriteBlockResponse(
        rewritten_content=rewritten_content,
        model_used=writer_result.model_name,
    )


@router.post("/rewrite-block", response_model=RewriteBlockResponse)
async def rewrite_block(
    request: RewriteBlockRequest,
    dependencies: Annotated[
        EditorAssistDependencies, Depends(get_editor_assist_dependencies)
    ],
) -> RewriteBlockResponse:
    try:
        return dependencies.run_graph(
            node_name="editor_assist_rewrite_block",
            step_runner=lambda: _rewrite_block_impl(request, dependencies),
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Editor Assist graph rewrite failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI rewrite graph failed",
        ) from exc
