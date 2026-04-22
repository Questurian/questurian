"""Itineraries pipeline — AI title generation from the same prompt used for ChatGPT copy."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from utils import get_vertex_llm

router = APIRouter(prefix="/itineraries-pipeline", tags=["itineraries-pipeline"])
logger = logging.getLogger(__name__)

DEFAULT_MODEL = "gemini-2.5-flash-lite"
MAX_PROMPT_CHARS = 120_000


class GenerateItineraryTitlesRequest(BaseModel):
    prompt: str = Field(..., min_length=20, max_length=MAX_PROMPT_CHARS)
    model_name: str | None = Field(default=None, max_length=120)


class GenerateItineraryTitlesResponse(BaseModel):
    text: str
    model_used: str


def _safe_text(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    content = getattr(value, "content", None)
    if isinstance(content, str):
        return content.strip()
    return ""


@router.post("/generate-titles", response_model=GenerateItineraryTitlesResponse)
async def generate_itinerary_titles(request: GenerateItineraryTitlesRequest) -> GenerateItineraryTitlesResponse:
    """Run the full itineraries title prompt through Vertex AI (Gemini)."""
    prompt = request.prompt.strip()
    if len(prompt) < 20:
        raise HTTPException(status_code=400, detail="prompt is too short")

    model_used = (request.model_name or DEFAULT_MODEL).strip() or DEFAULT_MODEL

    try:
        llm = get_vertex_llm(
            temperature=0.35,
            max_tokens=4096,
            model_name=model_used,
        )
        raw_result = llm.invoke(prompt)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Itineraries pipeline generate-titles failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI title pipeline request failed",
        ) from exc

    raw_text = _safe_text(raw_result)
    if not raw_text:
        raise HTTPException(status_code=502, detail="AI returned empty output")

    return GenerateItineraryTitlesResponse(text=raw_text, model_used=model_used)
