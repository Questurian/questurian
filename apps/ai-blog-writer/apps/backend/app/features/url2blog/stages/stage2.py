"""URL2Blog stage 2 article-type classification."""

import logging
from typing import Any

from fastapi import HTTPException
from fastapi.responses import JSONResponse

from app.core import (
    get_article_type_by_name,
    read_article_type_name_definitions,
)

from ..config import _llm_context_text, _resolve_url2blog_model
from ..llm.coerce import (
    _enforce_editorial_reasoning,
    _normalize_article_type_name,
)
from ..models import Stage2ClassifyRequest
from ..prompts import CLASSIFY_ARTICLE_TYPE_PROMPT

logger = logging.getLogger(__name__)


async def classify_article_type(request: Stage2ClassifyRequest) -> JSONResponse:
    """
    Classify Stage 1 article output into one article type.

    Uses article type name/definition reference data from shared storage and
    returns the selected article type id/name for guideline lookup.
    """
    title = request.title.strip()
    content = request.content.strip()
    selected_model_name = _resolve_url2blog_model(request.model_name)
    include_debug = request.include_debug
    if not title and not content:
        raise HTTPException(status_code=400, detail="Title or content is required")
    if len(content) < 50:
        raise HTTPException(
            status_code=422, detail="Content too short for reliable classification"
        )

    article_types = read_article_type_name_definitions()
    if not article_types:
        raise HTTPException(
            status_code=500, detail="No article types available for classification"
        )

    article_types_for_prompt = "\n".join(
        f"- {item['name']}: {item['definition']}" for item in article_types
    )
    content_for_prompt = _llm_context_text(content)

    prompt = CLASSIFY_ARTICLE_TYPE_PROMPT.format(
        article_types=article_types_for_prompt,
        title=title,
        content=content_for_prompt,
    )

    logger.info(
        "URL2Blog Stage 2: classifying article type (%d chars, %d types)",
        len(content_for_prompt),
        len(article_types),
    )
    from .. import routes

    parsed, raw_response = routes._invoke_json_llm(
        prompt=prompt,
        max_tokens=1024,
        temperature=0.1,
        model_name=selected_model_name,
    )

    selected_name = str(parsed.get("classification", "")).strip()
    if not selected_name:
        raise HTTPException(
            status_code=500,
            detail="Classification response missing required 'classification' field.",
        )

    selected_type = next(
        (item for item in article_types if item["name"] == selected_name),
        None,
    )
    if not selected_type:
        normalized_selected = _normalize_article_type_name(selected_name)
        selected_type = next(
            (
                item
                for item in article_types
                if _normalize_article_type_name(item["name"]) == normalized_selected
            ),
            None,
        )

    if not selected_type:
        raise HTTPException(
            status_code=500,
            detail=f"LLM selected unsupported article type: '{selected_name}'",
        )

    article_type_row = get_article_type_by_name(selected_type["name"])
    if not article_type_row:
        raise HTTPException(status_code=404, detail="Selected article type not found")

    try:
        confidence = float(parsed.get("confidence", 0.0))
    except (TypeError, ValueError):
        confidence = 0.0

    reasoning = _enforce_editorial_reasoning(
        str(parsed.get("reasoning", "")).strip(),
        article_type_row["name"],
    )

    payload: dict[str, Any] = {
        "message": "URL2Blog stage 2 classification completed",
        "classification": {
            "id": article_type_row["id"],
            "name": article_type_row["name"],
            "definition": article_type_row["definition"],
            "confidence": confidence,
            "reasoning": reasoning,
        },
        "article_types_considered": len(article_types),
        "raw_response": raw_response,
    }
    if include_debug:
        payload["debug"] = {
            "trace": [
                {
                    "stage": "stage2_classification",
                    "model_name": selected_model_name,
                    "max_tokens": 1024,
                    "temperature": 0.1,
                    "input": {
                        "title": title,
                        "content": content_for_prompt,
                        "source_url": request.source_url,
                        "language": request.language,
                        "article_types": article_types,
                    },
                    "prompt": prompt,
                    "raw_response": raw_response,
                    "parsed": parsed,
                    "output": {
                        "id": article_type_row["id"],
                        "name": article_type_row["name"],
                        "definition": article_type_row["definition"],
                        "confidence": confidence,
                        "reasoning": reasoning,
                    },
                }
            ]
        }

    return JSONResponse(payload)
