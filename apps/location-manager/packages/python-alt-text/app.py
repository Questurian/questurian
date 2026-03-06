import asyncio
import logging
import os
import threading
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel
from vertexai import init as vertex_init
from vertexai.generative_models import GenerativeModel, Part

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("vertex_alt_text")

app = FastAPI()

DEFAULT_MODEL = "gemini-2.5-pro"
DEFAULT_NEIGHBORHOOD_DESCRIPTION_MODEL = "gemini-2.5-flash"
DEFAULT_LOCATION = "us-central1"


def load_local_env_files() -> None:
    """Load repo env files when launched without exported shell vars."""
    service_dir = Path(__file__).resolve().parent
    repo_root = service_dir.parent.parent
    candidate_files = [
        repo_root / ".env",
        repo_root / "packages" / "server" / ".env",
        service_dir / ".env",
    ]

    for env_file in candidate_files:
        if not env_file.exists():
            continue
        for raw_line in env_file.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            if not key or key in os.environ:
                continue
            os.environ[key] = value.strip().strip('"').strip("'")


load_local_env_files()

ALT_TEXT_MODEL = os.getenv("ALT_TEXT_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL
NEIGHBORHOOD_DESCRIPTION_MODEL = (
    os.getenv(
        "NEIGHBORHOOD_DESCRIPTION_MODEL",
        DEFAULT_NEIGHBORHOOD_DESCRIPTION_MODEL,
    ).strip()
    or DEFAULT_NEIGHBORHOOD_DESCRIPTION_MODEL
)

_vertex_initialized = False
_vertex_init_lock = threading.Lock()


class NeighborhoodDescriptionRequest(BaseModel):
    location_name: str | None = None
    category: str | None = None
    location_type: str | None = None
    district: str | None = None
    neighborhood: str | None = None
    city: str | None = None
    country: str | None = None
    address: str | None = None


def ensure_vertex_initialized() -> None:
    global _vertex_initialized
    if _vertex_initialized:
        return

    with _vertex_init_lock:
        if _vertex_initialized:
            return

        project = (os.getenv("GOOGLE_CLOUD_PROJECT") or "").strip()
        if not project:
            raise RuntimeError("GOOGLE_CLOUD_PROJECT environment variable is required.")

        location = (os.getenv("GOOGLE_CLOUD_LOCATION") or DEFAULT_LOCATION).strip() or DEFAULT_LOCATION
        vertex_init(project=project, location=location)
        _vertex_initialized = True

        logger.info("Vertex AI initialized (project=%s, location=%s)", project, location)


def build_alt_text_prompt() -> str:
    return (
        "You are an accessibility expert writing HTML alt text.\n\n"
        "Write ONE clear, concise sentence describing what is essential to understand the image.\n"
        "Focus on the main subject, any visible action, and relevant context.\n"
        "Use concrete nouns and plain language.\n"
        "Avoid filler, opinions, and unnecessary adjectives.\n"
        "Do NOT start with \"Image of\" or \"Photo of\".\n"
        "Keep the result under 125 characters.\n"
        "Return ONLY the alt text."
    )


def build_neighborhood_description_prompt(
    request: NeighborhoodDescriptionRequest,
) -> str:
    area_name = (
        request.district
        or request.neighborhood
        or request.city
        or "the area"
    )
    context_lines = [
        f"Area focus: {area_name}",
        f"Neighborhood: {request.neighborhood or 'Unknown'}",
        f"District: {request.district or 'Unknown'}",
        f"City: {request.city or 'Unknown'}",
        f"Country: {request.country or 'Unknown'}",
        f"Venue name: {request.location_name or 'Unknown'}",
        f"Venue category: {request.category or 'Unknown'}",
        f"Venue type: {request.location_type or 'Unknown'}",
        f"Venue address: {request.address or 'Unknown'}",
    ]

    return (
        "You are writing a short neighborhood overview for a travel and location database.\n\n"
        "Write exactly 2 sentences in a neutral, editorial tone.\n"
        "Keep it concise, around 45 to 80 words total.\n"
        "Describe the surrounding area, atmosphere, and visitor context around the venue.\n"
        "Do not describe the venue itself except as light context.\n"
        "Do not invent landmarks, transit claims, safety claims, prices, or superlatives.\n"
        "If details are uncertain, stay broad and generic rather than making specifics up.\n"
        "Return ONLY the neighborhood description.\n\n"
        "Context:\n"
        + "\n".join(context_lines)
    )


def generate_alt_text_from_data(image_data: bytes, content_type: str) -> str:
    ensure_vertex_initialized()

    model = GenerativeModel(ALT_TEXT_MODEL)
    image_part = Part.from_data(data=image_data, mime_type=content_type)
    response = model.generate_content([image_part, build_alt_text_prompt()])

    text = (response.text or "").strip().strip('"').strip("'")
    if not text:
        raise RuntimeError("Vertex AI returned empty alt text.")

    return text


def generate_text_from_prompt(
    prompt: str, model_name: str | None = None
) -> str:
    ensure_vertex_initialized()

    model = GenerativeModel(model_name or ALT_TEXT_MODEL)
    response = model.generate_content(prompt)

    text = (response.text or "").strip().strip('"').strip("'")
    if not text:
        raise RuntimeError("Vertex AI returned empty text.")

    return text


@app.on_event("startup")
def startup() -> None:
    try:
        ensure_vertex_initialized()
    except Exception as exc:
        logger.warning("Vertex initialization deferred until first request: %s", exc)


@app.get("/test")
async def test_endpoint():
    logger.info("Test endpoint called")
    return {
        "status": "ok",
        "message": "Server is working",
        "provider": "vertex-gemini",
        "model": ALT_TEXT_MODEL,
        "neighborhood_description_model": NEIGHBORHOOD_DESCRIPTION_MODEL,
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
async def neighborhood_description(
    request: NeighborhoodDescriptionRequest,
):
    if not (request.district or request.neighborhood):
        raise HTTPException(
            status_code=400,
            detail="district or neighborhood is required",
        )

    try:
        description = await asyncio.to_thread(
            generate_text_from_prompt,
            build_neighborhood_description_prompt(request),
            NEIGHBORHOOD_DESCRIPTION_MODEL,
        )
        logger.info("Generated neighborhood description: %s", description)
        return {"description": description}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Vertex neighborhood description generation failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8642)
