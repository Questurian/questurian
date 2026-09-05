"""FastAPI routes and compatibility facade for the Vertex content service."""

import asyncio
import logging
import os

from fastapi import FastAPI, File, HTTPException, UploadFile
from model_gateway import get_settings, model_for

import generation
from generation import (
    generate_alt_text_from_data as generate_alt_text_from_data,
    generate_field_suggestion as _generate_field_suggestion,
    generate_grounded_json_from_prompt as generate_grounded_json_from_prompt,
    generate_text_from_prompt as generate_text_from_prompt,
)
from grounding import (
    extract_grounding_sources as extract_grounding_sources,
    is_valid_http_url as is_valid_http_url,
    merge_grounded_snippets as merge_grounded_snippets,
    parse_json_object as parse_json_object,
)
from models import (
    AccommodationsFieldSuggestionRequest as AccommodationsFieldSuggestionRequest,
    AccommodationsOption as AccommodationsOption,
    FieldSuggestionRequest as FieldSuggestionRequest,
    NeighborhoodDescriptionRequest as NeighborhoodDescriptionRequest,
    SUPPORTED_FIELD_SUGGESTION_CATEGORIES as SUPPORTED_FIELD_SUGGESTION_CATEGORIES,
)
from prompts import (
    build_accommodations_field_suggestion_prompt as build_accommodations_field_suggestion_prompt,
    build_alt_text_prompt as build_alt_text_prompt,
    build_field_suggestion_prompt as build_field_suggestion_prompt,
    build_neighborhood_description_prompt as build_neighborhood_description_prompt,
    build_url_field_suggestion_prompt as build_url_field_suggestion_prompt,
)
from vertex_runtime import (
    DEFAULT_LOCATION as DEFAULT_LOCATION,
    ensure_vertex_initialized as ensure_vertex_initialized,
    load_local_env_files as load_local_env_files,
)


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("vertex_alt_text")
app = FastAPI()


def generate_field_suggestion(request: FieldSuggestionRequest) -> dict:
    return _generate_field_suggestion(
        request,
        grounded_generator=generate_grounded_json_from_prompt,
    )


def generate_accommodations_field_suggestion(
    request: AccommodationsFieldSuggestionRequest,
) -> dict:
    return generate_field_suggestion(request.to_generic())


# Where the model table and the usage collector live when nobody says
# otherwise. Everything in this repo runs on one machine, and a service that
# only reports its calls when someone remembers to export two variables is a
# service that reports nothing -- which is exactly the state this one was in.
# Both are overridable, and both fail soft: an unreachable dashboard leaves the
# gateway on its checked-in defaults and drops usage events on the floor.
DEFAULT_DASHBOARD = "http://localhost:4500"


@app.on_event("startup")
def startup() -> None:
    os.environ.setdefault(
        "MODEL_GATEWAY_SETTINGS_URL", f"{DEFAULT_DASHBOARD}/api/settings/v1/models"
    )
    os.environ.setdefault(
        "USAGE_MONITOR_URL", f"{DEFAULT_DASHBOARD}/api/usage/v1/events"
    )

    pinned = get_settings().pinned_jobs()
    if pinned:
        # A pinned job ignores the dashboard, so someone changing a model there
        # and seeing nothing happen deserves to have been told why at boot.
        logger.warning(
            "Pinned by environment, so the dashboard cannot change these: %s", pinned
        )

    project = (os.getenv("GOOGLE_CLOUD_PROJECT") or "").strip()
    if not project:
        logger.warning(
            "⚠️  VERTEX AI NOT CONFIGURED — GOOGLE_CLOUD_PROJECT is not set. Alt text, neighborhood description, and field suggestion endpoints will fail until a new GCP project is wired up."
        )
        return
    try:
        ensure_vertex_initialized()
    except Exception as exc:
        logger.warning("Vertex initialization deferred until first request: %s", exc)


@app.get("/test")
async def test_endpoint():
    logger.info("Test endpoint called")
    # Resolved rather than recited. This endpoint is what an operator checks
    # after changing a model, so it has to answer with what the next call will
    # really use -- including a pin from the environment, which beats the
    # dashboard and is otherwise invisible.
    settings = get_settings()
    return {
        "status": "ok",
        "message": "Server is working",
        "provider": "vertex-gemini",
        "model": model_for(generation.JOB_ALT_TEXT),
        "neighborhood_description_model": model_for(
            generation.JOB_NEIGHBORHOOD_DESCRIPTION
        ),
        "field_suggestion_model": model_for(
            generation.JOB_ACCOMMODATIONS_FIELD_SUGGESTION
        ),
        "dining_field_suggestion_model": model_for(
            generation.JOB_DINING_FIELD_SUGGESTION
        ),
        "model_table_source": settings.table().source,
        "pinned_by_environment": settings.pinned_jobs(),
    }


@app.post("/alt")
async def alt_only(image: UploadFile = File(...)):
    logger.info("API /alt called")
    image_data = await image.read()
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="file must be an image")
    if not image_data:
        raise HTTPException(status_code=400, detail="empty file")
    try:
        alt_text = await asyncio.to_thread(
            generate_alt_text_from_data, image_data, image.content_type
        )
        logger.info("Generated alt text: %s", alt_text)
        return {"alt": alt_text}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Vertex alt text generation failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/neighborhood-description")
async def neighborhood_description(request: NeighborhoodDescriptionRequest):
    if not (request.district or request.neighborhood):
        raise HTTPException(
            status_code=400, detail="district or neighborhood is required"
        )
    try:
        description = await asyncio.to_thread(
            generate_text_from_prompt,
            build_neighborhood_description_prompt(request),
        )
        logger.info("Generated neighborhood description: %s", description)
        return {"description": description}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Vertex neighborhood description generation failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/field-suggestion")
async def field_suggestion(request: FieldSuggestionRequest):
    if request.category not in SUPPORTED_FIELD_SUGGESTION_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"category '{request.category}' is not implemented yet. Supported: {sorted(SUPPORTED_FIELD_SUGGESTION_CATEGORIES)}",
        )
    try:
        result = await asyncio.to_thread(generate_field_suggestion, request)
        return {
            "suggestion": result.get("suggestion"),
            "confidence": result.get("confidence", 0),
            "reason": result.get("reason", ""),
            "sources": result.get("sources", []),
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(
            "Vertex field suggestion failed (category=%s)", request.category
        )
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/accommodations-field-suggestion")
async def accommodations_field_suggestion(
    request: AccommodationsFieldSuggestionRequest,
):
    try:
        result = await asyncio.to_thread(
            generate_accommodations_field_suggestion,
            request,
        )
        return {
            "suggestion": result.get("suggestion"),
            "confidence": result.get("confidence", 0),
            "reason": result.get("reason", ""),
            "sources": result.get("sources", []),
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Vertex accommodations field suggestion failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8642)
