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
DEFAULT_TRANSLATION_MODEL = "gemini-2.5-flash-lite"
DEFAULT_REVIEWS_DIGEST_MODEL = "gemini-2.5-flash"
REVIEWS_DIGEST_VERSION = 1
REVIEWS_DIGEST_MAX_REVIEWS = 80
REVIEWS_DIGEST_MAX_CHARS_PER_REVIEW = 600
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
TRANSLATION_MODEL = (
    os.getenv("TRANSLATION_MODEL", DEFAULT_TRANSLATION_MODEL).strip()
    or DEFAULT_TRANSLATION_MODEL
)
REVIEWS_DIGEST_MODEL = (
    os.getenv("REVIEWS_DIGEST_MODEL", DEFAULT_REVIEWS_DIGEST_MODEL).strip()
    or DEFAULT_REVIEWS_DIGEST_MODEL
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


class ReviewSample(BaseModel):
    text: str
    rating: float | int | None = None
    date: str | None = None


SUPPORTED_FIELD_SUGGESTION_CATEGORIES = {"accommodations", "dining"}


class FieldSuggestionRequest(BaseModel):
    category: str
    field_key: str
    field_label: str
    kind: str
    allowed_options: list[AccommodationsOption]
    form_values: dict
    api_context: dict | None = None
    reviews: list[ReviewSample] | None = None


class TranslateReviewsRequest(BaseModel):
    reviews: list[dict]
    fields_to_translate: list[str]


class TranslateReviewsResponseStats(BaseModel):
    total: int
    translated: int
    already_english: int
    errors: int
    skipped: int


class TranslateReviewsResponse(BaseModel):
    reviews: list[dict]
    stats: TranslateReviewsResponseStats
    message: str


class ReviewsDigestReviewInput(BaseModel):
    text: str
    rating: float | int | None = None
    date: str | None = None


class ReviewsDigestRequest(BaseModel):
    venue_name: str
    venue_category: str  # 'dining' | 'accommodations' | 'attractions' | 'nightlife' | 'key-locations'
    venue_location: str | None = None
    reviews: list[ReviewsDigestReviewInput]


class ReviewsDigestResponse(BaseModel):
    version: int
    knownFor: list[str]
    commonPositives: list[str]
    commonGripes: list[str]
    namedDishes: list[str] | None = None
    summary: str
    model_used: str
    reviews_considered: int


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

    reviews_present = bool(request.reviews)
    review_payload = (
        [
            {
                "text": review.text,
                "rating": review.rating,
                "date": review.date,
            }
            for review in (request.reviews or [])
        ]
        if reviews_present
        else []
    )

    context = {
        "field": {
            "key": request.field_key,
            "label": request.field_label,
            "kind": request.kind,
        },
        "allowed_options": allowed_options,
        "current_form_values": request.form_values,
        "google_foursquare_prefill": request.api_context or {},
        "guest_reviews": review_payload,
    }

    if reviews_present:
        evidence_priority = (
            "Use guest reviews as the primary evidence. Real first-person reports describe vibe, "
            "perfect_for, amenities actually used, and the on-the-ground walkability.\n"
            "Use Google/Foursquare prefill as a tiebreak when reviews are ambiguous or silent.\n"
            "Only fall back to Google Search grounding if reviews and prefill are both silent.\n"
        )
    else:
        evidence_priority = (
            "Use Google/Foursquare prefill evidence first. If that is insufficient, use Google Search grounding.\n"
        )

    return (
        f"You suggest one missing {request.category} form option for a location-management database.\n"
        f"{evidence_priority}"
        "Return only JSON. Do not return markdown.\n"
        "The suggestion must use exact option value strings from allowed_options only.\n"
        "For kind=single, suggestion must be one string or null.\n"
        "For kind=multi, suggestion must be an array of strings or null.\n"
        "If evidence is weak, return suggestion null and confidence below 0.6.\n"
        "Do not invent amenities. Do not use values outside allowed_options.\n\n"
        "Return schema:\n"
        '{ "suggestion": string | string[] | null, "confidence": number, '
        '"reason": "short evidence-backed reason", '
        '"sources": [{ "label": "source name", "url": "https://...", "snippet": "short evidence" }] }\n\n'
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
        for chunk in getattr(metadata, "grounding_chunks", []) or []:
            web = getattr(chunk, "web", None)
            if not web:
                continue
            url = (getattr(web, "uri", "") or "").strip()
            title = (getattr(web, "title", "") or "").strip()
            if not url and not title:
                continue
            sources.append({"label": title or url, "url": url})
    return sources[:5]


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
        if not parsed.get("sources"):
            parsed["sources"] = extract_grounding_sources(response)
        return parsed
    except ImportError:
        logger.warning(
            "google-genai is not installed; falling back to non-grounded Vertex generation."
        )
        return parse_json_object(generate_text_from_prompt(prompt, model_name))


def build_translation_prompt(
    reviews: list[dict], fields_to_translate: list[str]
) -> str:
    # Sparse payload: omit empty fields per review so we don't pay tokens
    # round-tripping "title": "" for Google reviews (which have no titles).
    payload: list[dict] = []
    for review in reviews:
        entry: dict = {"id": str(review.get("id", ""))}
        for field in fields_to_translate:
            value = review.get(field)
            if isinstance(value, str) and value.strip():
                entry[field] = value
        payload.append(entry)

    # The LM caller pre-filters with needsTranslation() before calling this
    # endpoint, so we trust that everything in `reviews` is non-English and
    # skip the model-side English-detection step. If translation failure rates
    # spike (e.g. mixed-language reviews tagged as non-English get returned
    # as-is and miscounted), the revert is to restore the safety-net
    # detection: re-add "If a field is already English, return it unchanged"
    # to this prompt and an `already_english_ids` array to the response
    # schema in translate_reviews_with_vertex below.
    return (
        "You are a translator. Each review below has an `id` and one or more text fields.\n"
        "Translate every present text field into clear, natural English.\n"
        "Do not summarise, embellish, or add commentary. Preserve meaning faithfully.\n"
        "If a field is missing on the input, omit it from the output.\n\n"
        f"Fields to translate (when present): {json.dumps(fields_to_translate)}\n"
        f"Reviews JSON:\n{json.dumps(payload, ensure_ascii=False)}"
    )


def build_translation_response_schema(fields: list[str]) -> dict:
    review_props: dict = {"id": {"type": "string"}}
    for field in fields:
        review_props[field] = {"type": "string"}
    return {
        "type": "object",
        "properties": {
            "reviews": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": review_props,
                    "required": ["id"],
                },
            },
        },
        "required": ["reviews"],
    }


def translate_reviews_with_vertex(
    request: TranslateReviewsRequest,
) -> TranslateReviewsResponse:
    fields = [field for field in request.fields_to_translate if isinstance(field, str)]
    if not fields:
        raise ValueError("fields_to_translate must be non-empty")
    if not request.reviews:
        return TranslateReviewsResponse(
            reviews=[],
            stats=TranslateReviewsResponseStats(
                total=0, translated=0, already_english=0, errors=0, skipped=0
            ),
            message="No reviews to translate",
        )

    ensure_vertex_initialized()

    prompt = build_translation_prompt(request.reviews, fields)
    schema = build_translation_response_schema(fields)

    model = GenerativeModel(TRANSLATION_MODEL)
    response = model.generate_content(
        prompt,
        generation_config={
            "response_mime_type": "application/json",
            "response_schema": schema,
            "temperature": 0,
        },
    )

    usage = getattr(response, "usage_metadata", None)
    if usage is not None:
        logger.info(
            "[translate/reviews] model=%s chunk_size=%d prompt_tokens=%s output_tokens=%s total_tokens=%s",
            TRANSLATION_MODEL,
            len(request.reviews),
            getattr(usage, "prompt_token_count", "?"),
            getattr(usage, "candidates_token_count", "?"),
            getattr(usage, "total_token_count", "?"),
        )

    raw = (response.text or "").strip()
    if not raw:
        raise RuntimeError("Vertex AI returned empty translation response.")

    parsed = parse_json_object(raw)
    translated_list = parsed.get("reviews") or []
    if not isinstance(translated_list, list):
        raise ValueError("Translation response had no `reviews` array")

    translated_by_id: dict[str, dict] = {}
    for entry in translated_list:
        if not isinstance(entry, dict):
            continue
        entry_id = str(entry.get("id", "")).strip()
        if not entry_id:
            continue
        translated_by_id[entry_id] = entry

    output_reviews: list[dict] = []
    translated_count = 0
    errors_count = 0

    for original in request.reviews:
        original_id = str(original.get("id", "")).strip()
        translated_entry = translated_by_id.get(original_id) if original_id else None
        merged = dict(original)
        if translated_entry:
            for field in fields:
                value = translated_entry.get(field)
                if isinstance(value, str):
                    merged[field] = value
            translated_count += 1
        else:
            errors_count += 1
        output_reviews.append(merged)

    stats = TranslateReviewsResponseStats(
        total=len(request.reviews),
        translated=translated_count,
        already_english=0,
        errors=errors_count,
        skipped=0,
    )
    return TranslateReviewsResponse(
        reviews=output_reviews,
        stats=stats,
        message=f"Translated {translated_count}/{stats.total} reviews via Vertex",
    )


def build_reviews_digest_prompt(request: ReviewsDigestRequest) -> str:
    is_dining = request.venue_category == "dining"
    named_dishes_line = (
        '  "namedDishes": ["dish name", ...],   // 0-5 specific dishes that recur by name in reviews\n'
        if is_dining
        else ""
    )
    schema_block = (
        "{\n"
        '  "knownFor": ["short phrase", ...],   // 1-5 things this venue is celebrated for\n'
        '  "commonPositives": ["short phrase", ...],   // 1-5 recurring praises\n'
        '  "commonGripes": ["short phrase", ...],   // 0-3 recurring complaints (or [])\n'
        f"{named_dishes_line}"
        '  "summary": "one or two sentences"\n'
        "}"
    )

    reviews_block_lines: list[str] = []
    for i, review in enumerate(request.reviews, start=1):
        text = (review.text or "").strip()
        if not text:
            continue
        if len(text) > REVIEWS_DIGEST_MAX_CHARS_PER_REVIEW:
            text = text[:REVIEWS_DIGEST_MAX_CHARS_PER_REVIEW] + "…"
        rating_str = f" [{review.rating}/5]" if review.rating is not None else ""
        date_str = f" ({review.date})" if review.date else ""
        reviews_block_lines.append(f"{i}.{rating_str}{date_str} {text}")
    reviews_block = "\n".join(reviews_block_lines) or "(no review text supplied)"

    location_line = (
        f"Venue location: {request.venue_location}\n"
        if request.venue_location
        else ""
    )

    return (
        "You are an editorial research assistant. Given a venue's aggregated user reviews, "
        "produce a tight structured digest that an editor will use to write a publication-ready blurb.\n\n"
        f"Venue name: {request.venue_name}\n"
        f"Venue category: {request.venue_category}\n"
        f"{location_line}"
        "\n"
        "REVIEWS\n"
        f"{reviews_block}\n"
        "\n"
        "Output rules:\n"
        "- Return STRICT JSON matching the schema below. No prose outside the JSON.\n"
        "- Use short factual phrases. No marketing language, no superlatives.\n"
        "- Do not invent details. If a field has no support in the reviews, return an empty array or omit it.\n"
        "- Do not include reviewer names, ratings, dates, or quotes inside the output.\n"
        "- Keep `summary` neutral and factual; 1-2 sentences max.\n"
        "\n"
        "SCHEMA\n"
        f"{schema_block}\n"
        "\n"
        "Output JSON only."
    ).strip()


def generate_reviews_digest(request: ReviewsDigestRequest) -> ReviewsDigestResponse:
    if not request.reviews:
        raise ValueError("reviews must be a non-empty list.")
    if not request.venue_name.strip():
        raise ValueError("venue_name is required.")
    if not request.venue_category.strip():
        raise ValueError("venue_category is required.")

    capped_reviews = request.reviews[:REVIEWS_DIGEST_MAX_REVIEWS]
    capped_request = request.model_copy(update={"reviews": capped_reviews})

    prompt = build_reviews_digest_prompt(capped_request)
    raw = generate_text_from_prompt(prompt, REVIEWS_DIGEST_MODEL)
    parsed = parse_json_object(raw)

    def _coerce_list(value: object) -> list[str]:
        if not isinstance(value, list):
            return []
        return [str(v).strip() for v in value if isinstance(v, (str, int, float)) and str(v).strip()]

    known_for = _coerce_list(parsed.get("knownFor"))[:5]
    common_positives = _coerce_list(parsed.get("commonPositives"))[:5]
    common_gripes = _coerce_list(parsed.get("commonGripes"))[:3]
    named_dishes_raw = parsed.get("namedDishes")
    named_dishes: list[str] | None = (
        _coerce_list(named_dishes_raw)[:5] if named_dishes_raw is not None else None
    )
    summary = str(parsed.get("summary", "")).strip()

    return ReviewsDigestResponse(
        version=REVIEWS_DIGEST_VERSION,
        knownFor=known_for,
        commonPositives=common_positives,
        commonGripes=common_gripes,
        namedDishes=named_dishes,
        summary=summary,
        model_used=REVIEWS_DIGEST_MODEL,
        reviews_considered=len(capped_reviews),
    )


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


@app.post("/translate/reviews", response_model=TranslateReviewsResponse)
async def translate_reviews(request: TranslateReviewsRequest):
    try:
        return await asyncio.to_thread(translate_reviews_with_vertex, request)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Vertex translation failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/reviews/digest", response_model=ReviewsDigestResponse)
async def reviews_digest(request: ReviewsDigestRequest):
    try:
        return await asyncio.to_thread(generate_reviews_digest, request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Reviews digest generation failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8642)
