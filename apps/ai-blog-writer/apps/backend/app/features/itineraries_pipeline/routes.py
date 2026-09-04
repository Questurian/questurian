"""Itineraries pipeline — AI title generation from the same prompt used for ChatGPT copy."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.staff_auth import require_staff
from app.core.staff_token import staff_token
from app.shared.writer_invocation import invoke_writer_model

from .day_shells import BUILT_IN_DAY_SHELL_IDS
from .graph import run_itinerary_pipeline
from .schemas import DayShell, GenerateItineraryRequest, GenerateItineraryResponse
from .shell_library import (
    delete_library_shell,
    get_library_shell,
    list_library_shells,
    save_library_shell,
)

router = APIRouter(prefix="/itineraries-pipeline", tags=["itineraries-pipeline"])
logger = logging.getLogger(__name__)

# Was "claude-opus-4-8" until Anthropic billing ran out; restore that value
# (and set ANTHROPIC_MODELS_ENABLED=1) once it is funded again.
DEFAULT_MODEL = "gemini-2.5-flash"
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


@router.post(
    "/generate-titles",
    response_model=GenerateItineraryTitlesResponse,
    dependencies=[Depends(require_staff)],
)
async def generate_itinerary_titles(
    request: GenerateItineraryTitlesRequest,
) -> GenerateItineraryTitlesResponse:
    """Run the full itineraries title prompt through the writer-model router.

    Defaults to Claude; ``claude*`` model names route to Anthropic and any Gemini
    name falls back to Vertex (see ``invoke_writer_model``).
    """
    prompt = request.prompt.strip()
    if len(prompt) < 20:
        raise HTTPException(status_code=400, detail="prompt is too short")

    model_name = (request.model_name or DEFAULT_MODEL).strip() or DEFAULT_MODEL

    try:
        result = invoke_writer_model(
            prompt=prompt,
            model_name=model_name,
            temperature=0.35,
            max_tokens=16384,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Itineraries pipeline generate-titles failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI title pipeline request failed",
        ) from exc

    raw_text = _safe_text(result.text)
    if not raw_text:
        raise HTTPException(status_code=502, detail="AI returned empty output")

    return GenerateItineraryTitlesResponse(text=raw_text, model_used=result.model_name)


class DayShellLibraryResponse(BaseModel):
    shells: list[DayShell]


@router.get("/day-shells", response_model=DayShellLibraryResponse)
async def list_day_shells() -> DayShellLibraryResponse:
    """List the Day Shell Library (Custom Day Shells only — built-ins live in code)."""
    return DayShellLibraryResponse(shells=list_library_shells())


@router.post("/day-shells", response_model=DayShell)
async def create_day_shell(shell: DayShell) -> DayShell:
    if shell.id in BUILT_IN_DAY_SHELL_IDS:
        raise HTTPException(
            status_code=409, detail="Shell id collides with a built-in Day Shell"
        )
    if get_library_shell(shell.id) is not None:
        raise HTTPException(
            status_code=409, detail="A library shell with this id already exists"
        )
    return save_library_shell(shell)


@router.put("/day-shells/{shell_id}", response_model=DayShell)
async def update_day_shell(shell_id: str, shell: DayShell) -> DayShell:
    if shell_id in BUILT_IN_DAY_SHELL_IDS:
        raise HTTPException(status_code=409, detail="Built-in Day Shells are immutable")
    if shell.id != shell_id:
        raise HTTPException(status_code=400, detail="Shell id cannot change on update")
    if get_library_shell(shell_id) is None:
        raise HTTPException(status_code=404, detail="Library shell not found")
    return save_library_shell(shell)


@router.delete("/day-shells/{shell_id}", dependencies=[Depends(require_staff)])
async def remove_day_shell(shell_id: str) -> dict[str, bool]:
    if shell_id in BUILT_IN_DAY_SHELL_IDS:
        raise HTTPException(
            status_code=409, detail="Built-in Day Shells cannot be deleted"
        )
    if not delete_library_shell(shell_id):
        raise HTTPException(status_code=404, detail="Library shell not found")
    return {"deleted": True}


@router.post(
    "/generate",
    response_model=GenerateItineraryResponse,
    dependencies=[Depends(require_staff)],
)
async def generate_itinerary(
    request: GenerateItineraryRequest,
    session_token: str | None = Depends(staff_token),
) -> GenerateItineraryResponse:
    """Itinerary Autobuild: fill an itinerary's day slots from the brief.

    Reads candidate records from Payload with the operator's JWT, scores and
    selects them, orders each day, and returns the plan (slots + reasons only —
    no blurbs/images). The frontend persists the result.

    The JWT comes from the session cookie unless the body supplied one. The
    frontend stopped sending it once the Staff credential left JavaScript, and
    the cookie carries the same token, so the Payload reads are unaffected.
    `require_staff` still decides whether the caller may be here at all.
    """
    payload_jwt = request.payload_jwt or session_token
    if not payload_jwt:
        raise HTTPException(
            status_code=401,
            detail=(
                "Reading Payload candidates needs the operator's session: send "
                "the payload-token cookie or payload_jwt in the body"
            ),
        )
    request = request.model_copy(update={"payload_jwt": payload_jwt})

    try:
        return await run_itinerary_pipeline(request)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Itinerary Autobuild failed: %s", exc)
        raise HTTPException(
            status_code=502, detail="Itinerary generation failed"
        ) from exc
