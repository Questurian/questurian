"""URL2Blog stage 1 extraction from URL."""

import logging
from typing import Any

import httpx
from fastapi import HTTPException
from fastapi.responses import JSONResponse

from app.core import resolve_httpx_verify

from ..config import (
    URL2BLOG_INPUT_CHAR_LIMIT_DEFAULT,
    URL2BLOG_INPUT_CHAR_LIMIT_ENV,
    _read_int_env,
    _resolve_url2blog_model,
)
from ..content.text_cleanup import _strip_html
from ..models import ExtractRequest
from ..prompts import EXTRACT_PROMPT, TRANSLATE_PROMPT

logger = logging.getLogger(__name__)


async def extract_article(request: ExtractRequest) -> JSONResponse:
    """
    Fetch an article URL and extract title + content using Gemini.

    Accepts: { "url": "https://example.com/article" }
    Returns: { "title": "...", "content": "...", "raw_response": "...", "source_url": "..." }
    """
    url = request.url.strip()
    selected_model_name = _resolve_url2blog_model(request.model_name)
    include_debug = request.include_debug
    if not url.startswith(("http://", "https://")):
        raise HTTPException(
            status_code=400, detail="URL must start with http:// or https://"
        )

    # Fetch the page
    logger.info("URL2Blog: fetching %s", url)
    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=30.0,
            verify=resolve_httpx_verify(),
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; Questurian/1.0)",
                "Accept": "text/html,application/xhtml+xml",
            },
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch URL (HTTP {exc.response.status_code})",
        ) from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch URL: {exc}",
        ) from exc

    raw_html = resp.text
    raw_text = _strip_html(raw_html)

    if not raw_text or len(raw_text) < 50:
        raise HTTPException(
            status_code=422,
            detail="Page returned too little text content to extract an article.",
        )

    max_chars = _read_int_env(
        URL2BLOG_INPUT_CHAR_LIMIT_ENV,
        default=URL2BLOG_INPUT_CHAR_LIMIT_DEFAULT,
        min_value=0,
        max_value=1_000_000,
    )
    if max_chars > 0 and len(raw_text) > max_chars:
        raw_text = raw_text[:max_chars]

    # Send to Gemini for extraction
    prompt = EXTRACT_PROMPT + raw_text

    logger.info("URL2Blog Stage 1: sending prompt to Gemini (%d chars)", len(raw_text))
    from .. import routes

    parsed, raw_response, parse_error = routes._invoke_json_llm_best_effort(
        prompt=prompt,
        max_tokens=8192,
        temperature=0.1,
        model_name=selected_model_name,
        allow_truncated_repair=True,
    )
    if not raw_response and parse_error:
        logger.warning("URL2Blog Stage 1 extraction failed: %s", parse_error)

    stage_trace: list[dict[str, Any]] = []
    if include_debug:
        stage_trace.append(
            {
                "stage": "stage1_extract_article",
                "model_name": selected_model_name,
                "max_tokens": 8192,
                "temperature": 0.1,
                "input": {
                    "url": url,
                    "raw_text": raw_text,
                    "raw_text_length": len(raw_text),
                },
                "prompt": prompt,
                "raw_response": raw_response,
                "parsed": parsed,
                "parse_error": parse_error,
            }
        )

    # Phase 2: Translate if not English
    translated = None
    translation_skipped = False
    translation_error = None
    translation_prompt = ""
    translation_raw_response = ""

    if parsed and not parse_error:
        language = (parsed.get("language") or "").strip()
        is_english = language.lower() in ("english", "en", "")

        if is_english:
            translation_skipped = True
            logger.info("URL2Blog: article already in English, skipping translation")
            if include_debug:
                stage_trace.append(
                    {
                        "stage": "stage1_translate_article",
                        "model_name": selected_model_name,
                        "max_tokens": 8192,
                        "temperature": 0.1,
                        "input": {
                            "source_language": language or "English",
                            "title": parsed.get("title", ""),
                            "content": parsed.get("content", ""),
                        },
                        "prompt": None,
                        "raw_response": "",
                        "parsed": None,
                        "parse_error": None,
                        "skipped": True,
                        "skip_reason": "Source language already English.",
                    }
                )
        else:
            logger.info("URL2Blog: translating from %s to English", language)
            translation_prompt = TRANSLATE_PROMPT.format(
                source_language=language,
                title=parsed.get("title", ""),
                content=parsed.get("content", ""),
            )
            translated, translation_raw_response, translation_error = (
                routes._invoke_json_llm_best_effort(
                    prompt=translation_prompt,
                    max_tokens=8192,
                    temperature=0.1,
                    model_name=selected_model_name,
                    allow_truncated_repair=True,
                )
            )
            if include_debug:
                stage_trace.append(
                    {
                        "stage": "stage1_translate_article",
                        "model_name": selected_model_name,
                        "max_tokens": 8192,
                        "temperature": 0.1,
                        "input": {
                            "source_language": language,
                            "title": parsed.get("title", ""),
                            "content": parsed.get("content", ""),
                        },
                        "prompt": translation_prompt,
                        "raw_response": translation_raw_response,
                        "parsed": translated,
                        "parse_error": translation_error,
                        "skipped": False,
                    }
                )
            if translation_error and not translated:
                logger.warning(
                    "URL2Blog translation failed to parse JSON: %s", translation_error
                )

    payload: dict[str, Any] = {
        "message": "URL2Blog stage 1 completed",
        "source_url": url,
        "raw_text_length": len(raw_text),
        "raw_response": raw_response,
        "parsed": parsed,
        "parse_error": parse_error,
        "translated": translated,
        "translation_skipped": translation_skipped,
        "translation_error": translation_error,
    }
    if include_debug:
        payload["debug"] = {"trace": stage_trace}

    return JSONResponse(payload)
