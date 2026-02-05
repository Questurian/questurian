"""
Review2Blog API routes.

All routes are prefixed with /review2blog in the main router.
"""
import json
import logging
import os
import re
from typing import Any

from fastapi import APIRouter, HTTPException, UploadFile, File, Body
from fastapi.responses import JSONResponse

from app.core import clear_all_runs
from utils import get_vertex_llm

router = APIRouter(prefix="/review2blog", tags=["review2blog"])
logger = logging.getLogger(__name__)

DEFAULT_REVIEW2BLOG_MAX_TOKENS = 65536
MAX_REVIEW2BLOG_OUTPUT_TOKENS = 65536

REVIEW_SIGNAL_PROMPT = """You are an editorial restaurant analyst.

Convert each input review into a compact "experience signal" used for food intelligence.

Each input item has:
- text (string)
- rating (number)
- date (ISO YYYY-MM-DD)

Return a JSON array. Each output object must match this compact schema exactly:

{
  "d":"",
  "r":0,
  "s":0,

  "vc":[0,0,0],

  "e":{
    "f":[[],0],
    "sv":[[],0],
    "a":[[],0],
    "l":[[],0],
    "v":[[],0]
  },

  "dm":[],
  "sp":[],
  "t":[],
  "tg":[],
  "spc":0
}

------------------------
FIELD MEANINGS
------------------------

d = date
r = rating
s = sentiment

vc = [group, meal, occasion]
e = experience blocks
dm = dish mentions
sp = standout phrases
t = tone codes
tg = tag codes
spc = specificity

------------------------
ENUM CODES
------------------------

Sentiment (s):
-1 = negative
 0 = neutral
 1 = positive

Visit context (vc):

group:
0 other
1 solo
2 couple
3 family
4 friends
5 business
6 special_event

meal:
0 unknown
1 breakfast
2 brunch
3 lunch
4 dinner
5 late-night
6 drinks

occasion:
0 none
1 casual
2 celebration
3 date
4 business

Experience blocks (e):
Each is [descriptors[], intensity]

Keys:
f  = food
sv = service
a  = atmosphere
l  = location
v  = value

Intensity:
0 none
1 low
2 medium
3 high

Tone (t):
1 romantic
2 angry
3 casual
4 excited
5 poetic
6 nostalgic
7 sarcastic
8 humorous
9 critical
10 appreciative
11 neutral

Specificity (spc):
1 low
2 medium
3 high

------------------------
EXTRACTION RULES
------------------------

1. Copy d and r exactly from the input.
2. Sentiment (s) reflects the overall emotional direction of the review.
3. Descriptors must be short phrases directly implied by the text.
4. If a topic is not mentioned, use [] and intensity 0.
5. Dish mentions (dm) must be real dishes named in the text.
6. Standout phrases (sp) must be copied verbatim from the review.
   Limit to max 2 phrases, max 6 words each.
7. Tone (t) should include any strong emotional style present.
8. Specificity (spc):
   - 3 = concrete dishes, actions, or details
   - 2 = some specifics
   - 1 = vague or emotional only
9. Do NOT invent dishes, facts, or experiences.
10. Output ONLY valid JSON. No prose.
"""

PHASE_2_PROMPT = """SYSTEM PROMPT
You are an editorial restaurant analyst.

You receive many compact “experience signal” objects that represent what diners
collectively felt and noticed about a restaurant.

Your job is to synthesize these into one restaurant-wide experience profile
that can be used to write a compelling first-person restaurant article.

You do not quote individual reviews.
You extract patterns, dominant themes, and emotional tone.

You must follow the output schema exactly and return only valid JSON.

USER PROMPT
Here is an array of compact experience signals from many diners:

<EXPERIENCE_SIGNAL_ARRAY>

Aggregate them into this format:

{
  "review_count": 0,
  "average_rating": 0,

  "food": {
    "top_descriptors": [],
    "top_dishes": [],
    "emotional_tone": []
  },

  "service": {
    "top_descriptors": [],
    "reliability": "low | medium | high",
    "energy": "cold | neutral | warm"
  },

  "atmosphere": {
    "top_descriptors": [],
    "noise_level": "quiet | moderate | loud",
    "best_for": []
  },

  "value": {
    "perception": "poor | fair | good | excellent",
    "notes": []
  },

  "crowd": {
    "group_types": [],
    "common_occasions": []
  },

  "overall_vibe": ""
}

------------------------
AGGREGATION RULES
------------------------

1. review_count = number of input objects
2. average_rating = mean of all r values (rounded to one decimal)
3. Use descriptor frequency and intensity to choose top_descriptors.
4. top_dishes come from dm across all reviews.
5. emotional_tone comes from tone (t) and food/atmosphere language.
6. reliability is based on how consistent service intensity is.
7. energy comes from service and tone (excited, appreciative = warm).
8. noise_level inferred from atmosphere descriptors and tone.
9. best_for inferred from vc (couples, families, celebrations, etc).
10. value perception comes from v descriptors and rating patterns.
11. overall_vibe is one short, human-sounding phrase summarizing the restaurant.

Return ONLY the JSON.
"""


def _validate_payload(payload: Any) -> dict[str, Any]:
    """Validate input payload with reviews array and optional restaurant context."""
    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=400,
            detail="JSON root must be an object with 'reviews' array.",
        )

    if "reviews" not in payload:
        raise HTTPException(status_code=400, detail="Missing 'reviews' field.")

    reviews = payload["reviews"]
    if not isinstance(reviews, list):
        raise HTTPException(status_code=400, detail="'reviews' must be an array.")

    for index, item in enumerate(reviews):
        if not isinstance(item, dict):
            raise HTTPException(
                status_code=400,
                detail=f"Review at index {index} must be an object.",
            )
        missing_fields = [
            field
            for field in ("text", "rating", "date")
            if field not in item
        ]
        if missing_fields:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Review at index {index} missing fields: "
                    f"{', '.join(missing_fields)}."
                ),
            )

    return payload


def _extract_json_payload(raw_text: str) -> str:
    if not raw_text:
        return ""
    match = re.search(r"```(?:json)?\s*(.*?)\s*```", raw_text, re.DOTALL)
    if match:
        return match.group(1).strip()
    return raw_text.strip()


def _strip_trailing_commas(text: str) -> str:
    previous = None
    current = text
    while previous != current:
        previous = current
        current = re.sub(r",(\s*[}\]])", r"\1", current)
    return current


def _try_parse_object(raw_text: str) -> tuple[dict[str, Any] | None, str | None]:
    cleaned = _extract_json_payload(raw_text)
    if not cleaned:
        return None, "Empty response"

    obj_start = cleaned.find("{")
    if obj_start == -1:
        return None, "No JSON object found in response."

    decoder = json.JSONDecoder()
    try:
        parsed, _ = decoder.raw_decode(cleaned[obj_start:])
    except json.JSONDecodeError as exc:
        last_brace = cleaned.rfind("}")
        if last_brace != -1 and last_brace > obj_start:
            trimmed = cleaned[obj_start:last_brace + 1]
            try:
                parsed = json.loads(trimmed)
                if not isinstance(parsed, dict):
                    return None, "Expected a JSON object in LLM response."
                return parsed, None
            except json.JSONDecodeError:
                sanitized = _strip_trailing_commas(trimmed)
                if sanitized != trimmed:
                    try:
                        parsed = json.loads(sanitized)
                        if not isinstance(parsed, dict):
                            return None, "Expected a JSON object in LLM response."
                        return parsed, None
                    except json.JSONDecodeError:
                        pass
        return None, str(exc)

    if not isinstance(parsed, dict):
        return None, "Expected a JSON object in LLM response."

    return parsed, None


def _try_parse_output(raw_text: str) -> tuple[list[Any] | None, str | None]:
    cleaned = _extract_json_payload(raw_text)
    if not cleaned:
        return None, "Empty response"

    array_start = cleaned.find("[")
    if array_start == -1:
        return None, "No JSON array found in response."

    decoder = json.JSONDecoder()
    try:
        parsed, _ = decoder.raw_decode(cleaned[array_start:])
    except json.JSONDecodeError as exc:
        last_bracket = cleaned.rfind("]")
        if last_bracket != -1 and last_bracket > array_start:
            trimmed = cleaned[array_start:last_bracket + 1]
            try:
                parsed = json.loads(trimmed)
                if not isinstance(parsed, list):
                    return None, "Expected a JSON array in LLM response."
                return parsed, None
            except json.JSONDecodeError:
                sanitized = _strip_trailing_commas(trimmed)
                if sanitized != trimmed:
                    try:
                        parsed = json.loads(sanitized)
                        if not isinstance(parsed, list):
                            return None, "Expected a JSON array in LLM response."
                        return parsed, None
                    except json.JSONDecodeError:
                        pass
        return None, str(exc)

    if not isinstance(parsed, list):
        return None, "Expected a JSON array in LLM response."

    return parsed, None


def _resolve_max_tokens(max_tokens: int | None) -> int:
    resolved = max_tokens
    if resolved is None:
        env_value = os.getenv("REVIEW2BLOG_MAX_TOKENS")
        if env_value:
            resolved = int(env_value)
    resolved = resolved if resolved is not None else DEFAULT_REVIEW2BLOG_MAX_TOKENS
    if resolved > MAX_REVIEW2BLOG_OUTPUT_TOKENS:
        logger.warning(
            "Requested max_tokens=%s exceeds provider limit; clamping to %s",
            resolved,
            MAX_REVIEW2BLOG_OUTPUT_TOKENS,
        )
        return MAX_REVIEW2BLOG_OUTPUT_TOKENS
    return resolved


@router.post("/upload")
async def upload_json(
    file: UploadFile = File(...),
    max_tokens: int | None = None,
) -> JSONResponse:
    """
    Upload JSON review data to process.

    Expected format:
    {
        "id": 123,
        "name": "Restaurant Name",
        "district": "District",
        "neighborhoodDescription": "Description of neighborhood",
        "description": "Restaurant description",
        "reviews_summary": "Summary of reviews",
        "reviews": [
            {
                "text": "...",
                "rating": 5,
                "date": "2024-01-15"
            }
        ]
    }
    """
    if not file.filename or not file.filename.lower().endswith(".json"):
        raise HTTPException(status_code=400, detail="Please upload a JSON file.")

    content = await file.read()
    try:
        payload = json.loads(content.decode("utf-8-sig"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON file.") from exc

    validated_payload = _validate_payload(payload)
    reviews = validated_payload["reviews"]

    # Extract restaurant context (everything except reviews)
    restaurant_context = {k: v for k, v in validated_payload.items() if k != "reviews"}

    resolved_max_tokens = _resolve_max_tokens(max_tokens)
    llm = get_vertex_llm(temperature=0.1, max_tokens=resolved_max_tokens)
    prompt = (
        f"{REVIEW_SIGNAL_PROMPT}\n\nINPUT JSON ARRAY:\n"
        f"{json.dumps(reviews, ensure_ascii=False, indent=2)}"
    )

    logger.info("Review2Blog Phase 1: sending prompt to Gemini")
    result = llm.invoke(prompt)

    if not result or not result.strip():
        raise HTTPException(status_code=500, detail="LLM returned an empty response.")

    raw_response = result.strip()
    parsed_output, parse_error = _try_parse_output(raw_response)

    return JSONResponse({
        "message": "Review2Blog phase 1 completed",
        "input_count": len(reviews),
        "restaurant_context": restaurant_context,
        "max_tokens": resolved_max_tokens,
        "raw_response": raw_response,
        "parsed": parsed_output,
        "parse_error": parse_error,
    })


@router.post("/phase2")
async def aggregate_experience(
    payload: Any = Body(...),
    max_tokens: int | None = None,
) -> JSONResponse:
    if not isinstance(payload, list):
        raise HTTPException(status_code=400, detail="JSON root must be an array.")

    resolved_max_tokens = _resolve_max_tokens(max_tokens)
    llm = get_vertex_llm(temperature=0.1, max_tokens=resolved_max_tokens)

    prompt = PHASE_2_PROMPT.replace(
        "<EXPERIENCE_SIGNAL_ARRAY>",
        json.dumps(payload, ensure_ascii=False, indent=2),
    )

    logger.info("Review2Blog Phase 2: sending prompt to Gemini")
    result = llm.invoke(prompt)

    if not result or not result.strip():
        raise HTTPException(status_code=500, detail="LLM returned an empty response.")

    raw_response = result.strip()
    parsed_output, parse_error = _try_parse_object(raw_response)

    return JSONResponse({
        "message": "Review2Blog phase 2 completed",
        "input_count": len(payload),
        "max_tokens": resolved_max_tokens,
        "raw_response": raw_response,
        "parsed": parsed_output,
        "parse_error": parse_error,
    })


PHASE_3_LISTICLE_PROMPT = """## Restaurant Listicle Blurb Generator

**Task**
You are writing a **short, high-impact restaurant blurb** for a **curated food listicle**.
The goal is to make this restaurant feel **perfect for this specific list**, not just generally good.

---

## Listicle Context (CRITICAL INPUT)

Type: {listicle_type}
Title: "{listicle_title}"
Goal: {listicle_goal}

You must shape the blurb so that the restaurant feels **tailor-made for this listicle**.

---

## Restaurant Data (Review Intelligence)

{aggregated_profile}

---

## TripAdvisor Context

Name: {name}
District: {district}
Neighborhood: {neighborhood_description}
Description: {description}
Reviews Summary: {reviews_summary}

---

## Writing Guidelines (Eater-Style)

When writing the blurb:
- Write like a **savvy local food editor**
- Keep it **tight and skimmable** (4–6 sentences)
- Emphasize **why it belongs in THIS list**
- Weave in:
  - Cultural fusion & storytelling
  - Emotional tone
  - The energy implied by the listicle (romantic, buzzy, local, etc.)
- Highlight **2–3 standout dishes**
- Reference **strong ratings**
- Mention **Barranco** when relevant
- Avoid hype words ("best," "must-try," "world-class")

Tone: warm, clever, slightly playful, confident.

---

## Output Requirements

Return **one paragraph** that could drop cleanly into the specified listicle.

Do **not** use:
- Bullets
- Headings
- Emojis
- Salesy language

This should read like something **Eater, Infatuation, or Time Out** would publish.
"""


@router.post("/phase3")
async def generate_listicle_blurb(
    payload: Any = Body(...),
    max_tokens: int | None = None,
) -> JSONResponse:
    """
    Generate a listicle blurb using aggregated profile, restaurant context, and listicle config.

    Expected payload:
    {
        "aggregated_profile": {...},  # Phase 2 output
        "restaurant_context": {...},  # From Phase 1 response
        "listicle": {
            "listicle_type": "...",
            "listicle_title": "...",
            "listicle_goal": "..."
        }
    }
    """
    required_fields = ["aggregated_profile", "restaurant_context", "listicle"]
    missing = [f for f in required_fields if f not in payload]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required fields: {', '.join(missing)}",
        )

    listicle = payload["listicle"]
    restaurant = payload["restaurant_context"]

    prompt = PHASE_3_LISTICLE_PROMPT.format(
        listicle_type=listicle.get("listicle_type", ""),
        listicle_title=listicle.get("listicle_title", ""),
        listicle_goal=listicle.get("listicle_goal", ""),
        aggregated_profile=json.dumps(payload["aggregated_profile"], indent=2),
        name=restaurant.get("name", "Unknown"),
        district=restaurant.get("district", ""),
        neighborhood_description=restaurant.get("neighborhoodDescription", ""),
        description=restaurant.get("description", ""),
        reviews_summary=restaurant.get("reviews_summary", ""),
    )

    resolved_max_tokens = _resolve_max_tokens(max_tokens)
    # Higher temperature for creative writing
    llm = get_vertex_llm(temperature=0.7, max_tokens=resolved_max_tokens)

    logger.info("Review2Blog Phase 3: sending prompt to Gemini")
    result = llm.invoke(prompt)

    if not result or not result.strip():
        raise HTTPException(status_code=500, detail="LLM returned an empty response.")

    return JSONResponse({
        "message": "Review2Blog phase 3 completed",
        "blurb": result.strip(),
    })


@router.get("/status/{run_id}")
async def get_status(run_id: str) -> JSONResponse:
    """Get the status of a pipeline run."""
    # TODO: Implement when pipeline is ready
    raise HTTPException(
        status_code=501,
        detail="Review2Blog pipeline not yet implemented"
    )


@router.get("/result/{run_id}")
async def get_result(run_id: str) -> JSONResponse:
    """Get the result of a completed pipeline run."""
    # TODO: Implement when pipeline is ready
    raise HTTPException(
        status_code=501,
        detail="Review2Blog pipeline not yet implemented"
    )


@router.post("/clear")
async def clear_database() -> JSONResponse:
    """Clear ALL Review2Blog data from the database."""
    count = clear_all_runs(feature="review2blog")
    return JSONResponse({
        "message": f"Cleared {count} runs from database",
        "deleted_runs": count
    })


@router.get("/articles")
async def get_articles() -> JSONResponse:
    """Get all completed Review2Blog articles."""
    # TODO: Implement when pipeline is ready
    return JSONResponse([])
