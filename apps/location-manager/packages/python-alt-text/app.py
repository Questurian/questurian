import asyncio
import json
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
DEFAULT_ACCOMMODATIONS_FIELD_SUGGESTION_MODEL = "gemini-2.5-flash"
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
ACCOMMODATIONS_FIELD_SUGGESTION_MODEL = (
    os.getenv(
        "ACCOMMODATIONS_FIELD_SUGGESTION_MODEL",
        DEFAULT_ACCOMMODATIONS_FIELD_SUGGESTION_MODEL,
    ).strip()
    or DEFAULT_ACCOMMODATIONS_FIELD_SUGGESTION_MODEL
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


class AccommodationsOption(BaseModel):
    value: str
    label: str
    description: str | None = None


SUPPORTED_FIELD_SUGGESTION_CATEGORIES = {"accommodations", "dining"}


class FieldSuggestionRequest(BaseModel):
    category: str
    field_key: str
    field_label: str
    kind: str
    allowed_options: list[AccommodationsOption]
    form_values: dict
    api_context: dict | None = None


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


def build_field_suggestion_prompt(request: FieldSuggestionRequest) -> str:
    allowed_options = [
        {
            "value": option.value,
            "label": option.label,
            "description": option.description or "",
        }
        for option in request.allowed_options
    ]

    context = {
        "field": {
            "key": request.field_key,
            "label": request.field_label,
            "kind": request.kind,
        },
        "allowed_options": allowed_options,
        "current_form_values": request.form_values,
        "google_foursquare_prefill": request.api_context or {},
    }

    return (
        f"You suggest one missing {request.category} form option for a location-management database.\n"
        "Use Google/Foursquare prefill evidence first. If that is insufficient, use Google Search grounding "
        "to find first-person evidence (reviews, blog posts, editorial guides) about this venue.\n"
        "For every claim that drives the suggestion, include the supporting passage in `sources[].snippet` "
        "so an operator can verify the evidence without leaving the form.\n"
        "Return only JSON. Do not return markdown.\n"
        "The suggestion must use exact option value strings from allowed_options only.\n"
        "For kind=single, suggestion must be one string or null.\n"
        "For kind=multi, suggestion must be an array of strings or null.\n"
        "If evidence is weak, return suggestion null and confidence below 0.6.\n"
        "Do not invent amenities. Do not use values outside allowed_options.\n\n"
        "Return schema:\n"
        '{ "suggestion": string | string[] | null, "confidence": number, '
        '"reason": "short evidence-backed reason", '
        '"sources": [{ "label": "source name", "url": "https://...", "snippet": "short evidence passage from the source" }] }\n\n'
        "Context JSON:\n"
        f"{json.dumps(context, ensure_ascii=False)}"
    )


def parse_json_object(text: str) -> dict:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.removeprefix("```json").removeprefix("```").strip()
        cleaned = cleaned.removesuffix("```").strip()

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError("Model did not return a JSON object.")

    parsed = json.loads(cleaned[start : end + 1])
    if not isinstance(parsed, dict):
        raise ValueError("Model JSON response must be an object.")
    return parsed


def extract_grounding_sources(response) -> list[dict]:
    sources: list[dict] = []
    for candidate in getattr(response, "candidates", []) or []:
        metadata = getattr(candidate, "grounding_metadata", None)
        if not metadata:
            continue

        chunks = list(getattr(metadata, "grounding_chunks", []) or [])
        snippets_by_chunk: dict[int, str] = {}
        for support in getattr(metadata, "grounding_supports", []) or []:
            segment = getattr(support, "segment", None)
            text = (getattr(segment, "text", "") or "").strip()
            if not text:
                continue
            for chunk_index in getattr(support, "grounding_chunk_indices", []) or []:
                snippets_by_chunk.setdefault(chunk_index, text)

        for i, chunk in enumerate(chunks):
            web = getattr(chunk, "web", None)
            if not web:
                continue
            url = (getattr(web, "uri", "") or "").strip()
            title = (getattr(web, "title", "") or "").strip()
            if not url and not title:
                continue
            entry: dict = {"label": title or url, "url": url}
            snippet = snippets_by_chunk.get(i, "").strip()
            if snippet:
                entry["snippet"] = snippet
            sources.append(entry)
    return sources[:5]


def merge_grounded_snippets(parsed: dict, response) -> dict:
    grounded = extract_grounding_sources(response)
    model_sources = parsed.get("sources") if isinstance(parsed.get("sources"), list) else None

    if not model_sources:
        parsed["sources"] = grounded
        return parsed

    snippets_by_url = {source["url"]: source.get("snippet", "") for source in grounded if source.get("url")}
    enriched: list[dict] = []
    for source in model_sources:
        if not isinstance(source, dict):
            continue
        url = (source.get("url") or "").strip()
        snippet = (source.get("snippet") or "").strip()
        if not snippet and url and snippets_by_url.get(url):
            source = {**source, "snippet": snippets_by_url[url]}
        enriched.append(source)
    parsed["sources"] = enriched
    return parsed


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


def generate_grounded_json_from_prompt(
    prompt: str,
    model_name: str,
) -> dict:
    project = (os.getenv("GOOGLE_CLOUD_PROJECT") or "").strip()
    location = (os.getenv("GOOGLE_CLOUD_LOCATION") or DEFAULT_LOCATION).strip() or DEFAULT_LOCATION
    if not project:
        raise RuntimeError("GOOGLE_CLOUD_PROJECT environment variable is required.")

    try:
        from google import genai
        from google.genai.types import GenerateContentConfig, GoogleSearch, Tool

        client = genai.Client(vertexai=True, project=project, location=location)
        response = client.models.generate_content(
            model=model_name,
            contents=prompt,
            config=GenerateContentConfig(
                tools=[Tool(google_search=GoogleSearch())],
            ),
        )
        text = (response.text or "").strip()
        if not text:
            raise RuntimeError("Vertex AI returned empty JSON.")
        parsed = parse_json_object(text)
        return merge_grounded_snippets(parsed, response)
    except ImportError:
        logger.warning(
            "google-genai is not installed; falling back to non-grounded Vertex generation."
        )
        return parse_json_object(generate_text_from_prompt(prompt, model_name))


def generate_field_suggestion(request: FieldSuggestionRequest) -> dict:
    if request.category not in SUPPORTED_FIELD_SUGGESTION_CATEGORIES:
        raise ValueError(
            f"category '{request.category}' is not implemented yet. "
            f"Supported: {sorted(SUPPORTED_FIELD_SUGGESTION_CATEGORIES)}"
        )
    if request.kind not in {"single", "multi"}:
        raise ValueError("kind must be single or multi.")
    if not request.allowed_options:
        raise ValueError("allowed_options cannot be empty.")

    return generate_grounded_json_from_prompt(
        build_field_suggestion_prompt(request),
        ACCOMMODATIONS_FIELD_SUGGESTION_MODEL,
    )


@app.on_event("startup")
def startup() -> None:
    project = (os.getenv("GOOGLE_CLOUD_PROJECT") or "").strip()
    if not project:
        logger.warning(
            "⚠️  VERTEX AI NOT CONFIGURED — GOOGLE_CLOUD_PROJECT is not set. "
            "Alt text, neighborhood description, and field suggestion endpoints will fail until a new GCP project is wired up."
        )
        return
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
        "field_suggestion_model": ACCOMMODATIONS_FIELD_SUGGESTION_MODEL,
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


@app.post("/field-suggestion")
async def field_suggestion(request: FieldSuggestionRequest):
    if request.category not in SUPPORTED_FIELD_SUGGESTION_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"category '{request.category}' is not implemented yet. "
                f"Supported: {sorted(SUPPORTED_FIELD_SUGGESTION_CATEGORIES)}"
            ),
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
        logger.exception("Vertex field suggestion failed (category=%s)", request.category)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8642)
