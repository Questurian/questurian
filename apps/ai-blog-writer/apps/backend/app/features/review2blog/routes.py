"""
Review2Blog API routes.

All routes are prefixed with /review2blog in the main router.
"""
import json
import logging
import os
import re
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, HTTPException, UploadFile, File, Body, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.core import (
    clear_all_runs,
    read_output,
    read_stage_result,
    read_status,
    write_artifact,
    write_stage_result,
    write_status,
)
from utils import get_vertex_llm
from .graph import run_review2blog_graph
from .storage import get_all_completed_articles

router = APIRouter(prefix="/review2blog", tags=["review2blog"])
logger = logging.getLogger(__name__)
FEATURE_NAME = "review2blog"

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
            try:
                resolved = int(env_value)
            except ValueError:
                logger.warning(
                    "Invalid REVIEW2BLOG_MAX_TOKENS=%s; falling back to default=%s",
                    env_value,
                    DEFAULT_REVIEW2BLOG_MAX_TOKENS,
                )
                resolved = DEFAULT_REVIEW2BLOG_MAX_TOKENS
    resolved = resolved if resolved is not None else DEFAULT_REVIEW2BLOG_MAX_TOKENS
    if resolved > MAX_REVIEW2BLOG_OUTPUT_TOKENS:
        logger.warning(
            "Requested max_tokens=%s exceeds provider limit; clamping to %s",
            resolved,
            MAX_REVIEW2BLOG_OUTPUT_TOKENS,
        )
        return MAX_REVIEW2BLOG_OUTPUT_TOKENS
    return resolved


def _now_iso() -> str:
    from datetime import datetime

    return datetime.utcnow().isoformat()


def _read_langgraph_trace(run_id: str) -> dict[str, str]:
    stage_payload = read_stage_result(run_id, "langgraph_trace")
    if not isinstance(stage_payload, dict):
        return {}
    data = stage_payload.get("data")
    if not isinstance(data, dict):
        return {}

    trace_payload: dict[str, str] = {}
    trace_url = data.get("langsmith_trace_url")
    if isinstance(trace_url, str) and trace_url.strip():
        trace_payload["langsmith_trace_url"] = trace_url.strip()
    trace_run_id = data.get("langsmith_trace_run_id")
    if isinstance(trace_run_id, str) and trace_run_id.strip():
        trace_payload["langsmith_trace_run_id"] = trace_run_id.strip()
    return trace_payload


class Review2BlogRunRequest(BaseModel):
    review_payload: dict[str, Any] = Field(..., description="Original review JSON payload")
    listicle: dict[str, Any] = Field(..., description="Listicle config used for phase 3")
    max_tokens: int | None = Field(default=None)


def _write_running_status(run_id: str, stage: str) -> None:
    write_status(
        run_id,
        {
            "run_id": run_id,
            "state": "running",
            "stage": stage,
            "error": None,
            "updated_at": _now_iso(),
        },
        feature=FEATURE_NAME,
    )


def _run_review2blog_phase1(
    *,
    run_id: str,
    reviews: list[dict[str, Any]],
    restaurant_context: dict[str, Any],
    resolved_max_tokens: int,
) -> list[Any]:
    _write_running_status(run_id, "stage_phase1")

    phase1_prompt = (
        f"{REVIEW_SIGNAL_PROMPT}\n\nINPUT JSON ARRAY:\n"
        f"{json.dumps(reviews, ensure_ascii=False, indent=2)}"
    )
    phase1_llm = get_vertex_llm(
        temperature=0.1,
        max_tokens=resolved_max_tokens,
    )
    phase1_raw = phase1_llm.invoke(phase1_prompt)
    if not phase1_raw or not phase1_raw.strip():
        raise RuntimeError("Phase 1 returned empty output")
    phase1_raw = phase1_raw.strip()
    phase1_parsed, phase1_parse_error = _try_parse_output(phase1_raw)
    if phase1_parsed is None:
        raise RuntimeError(f"Phase 1 parse failed: {phase1_parse_error}")

    write_stage_result(
        run_id,
        "stage_phase1",
        {
            "created_at": _now_iso(),
            "data": {
                "input_count": len(reviews),
                "restaurant_context": restaurant_context,
                "raw_response": phase1_raw,
                "parsed": phase1_parsed,
                "parse_error": phase1_parse_error,
            },
        },
    )
    return phase1_parsed


def _run_review2blog_phase2(
    *,
    run_id: str,
    phase1_parsed: list[Any],
    resolved_max_tokens: int,
) -> dict[str, Any]:
    _write_running_status(run_id, "stage_phase2")

    phase2_prompt = PHASE_2_PROMPT.replace(
        "<EXPERIENCE_SIGNAL_ARRAY>",
        json.dumps(phase1_parsed, ensure_ascii=False, indent=2),
    )
    phase2_llm = get_vertex_llm(
        temperature=0.1,
        max_tokens=resolved_max_tokens,
    )
    phase2_raw = phase2_llm.invoke(phase2_prompt)
    if not phase2_raw or not phase2_raw.strip():
        raise RuntimeError("Phase 2 returned empty output")
    phase2_raw = phase2_raw.strip()
    phase2_parsed, phase2_parse_error = _try_parse_object(phase2_raw)
    if phase2_parsed is None:
        raise RuntimeError(f"Phase 2 parse failed: {phase2_parse_error}")

    write_stage_result(
        run_id,
        "stage_phase2",
        {
            "created_at": _now_iso(),
            "data": {
                "input_count": len(phase1_parsed),
                "raw_response": phase2_raw,
                "parsed": phase2_parsed,
                "parse_error": phase2_parse_error,
            },
        },
    )
    return phase2_parsed


def _run_review2blog_phase3(
    *,
    run_id: str,
    phase2_parsed: dict[str, Any],
    listicle: dict[str, Any],
    restaurant_context: dict[str, Any],
    resolved_max_tokens: int,
) -> str:
    _write_running_status(run_id, "stage_phase3")

    phase3_prompt = PHASE_3_LISTICLE_PROMPT.format(
        listicle_type=listicle.get("listicle_type", ""),
        listicle_title=listicle.get("listicle_title", ""),
        listicle_goal=listicle.get("listicle_goal", ""),
        aggregated_profile=json.dumps(phase2_parsed, ensure_ascii=False, indent=2),
        name=restaurant_context.get("name", "Unknown"),
        district=restaurant_context.get("district", ""),
        neighborhood_description=restaurant_context.get("neighborhoodDescription", ""),
        description=restaurant_context.get("description", ""),
        reviews_summary=restaurant_context.get("reviews_summary", ""),
    )
    phase3_llm = get_vertex_llm(
        temperature=0.7,
        max_tokens=resolved_max_tokens,
    )
    phase3_raw = phase3_llm.invoke(phase3_prompt)
    if not phase3_raw or not phase3_raw.strip():
        raise RuntimeError("Phase 3 returned empty output")
    blurb = phase3_raw.strip()

    write_stage_result(
        run_id,
        "stage_phase3",
        {
            "created_at": _now_iso(),
            "data": {
                "raw_response": phase3_raw,
                "blurb": blurb,
                "listicle": listicle,
            },
        },
    )
    return blurb


def _finalize_review2blog_run(
    *,
    run_id: str,
    listicle: dict[str, Any],
    restaurant_context: dict[str, Any],
    phase1_parsed: list[Any],
    phase2_parsed: dict[str, Any],
    blurb: str,
) -> None:
    title = (
        str(listicle.get("listicle_title", "")).strip()
        or str(restaurant_context.get("name", "")).strip()
        or "Review2Blog Draft"
    )
    markdown = f"# {title}\n\n{blurb}".strip()
    artifact_payload = {
        "run_id": run_id,
        "restaurant_name": restaurant_context.get("name"),
        "listicle": listicle,
        "phase_outputs": {
            "phase1": {"signals_count": len(phase1_parsed)},
            "phase2": phase2_parsed,
            "phase3": {"blurb": blurb},
        },
    }
    write_artifact(
        run_id,
        {
            "markdown": markdown,
            "review2blog_run": artifact_payload,
        },
    )

    write_status(
        run_id,
        {
            "run_id": run_id,
            "state": "completed",
            "stage": "complete",
            "error": None,
            "updated_at": _now_iso(),
        },
        feature=FEATURE_NAME,
    )


def _run_review2blog_pipeline(run_id: str, request: Review2BlogRunRequest) -> None:
    validated_payload = _validate_payload(request.review_payload)
    reviews = validated_payload["reviews"]
    restaurant_context = {
        k: v for k, v in validated_payload.items() if k != "reviews"
    }
    listicle = request.listicle if isinstance(request.listicle, dict) else {}
    resolved_max_tokens = _resolve_max_tokens(request.max_tokens)

    def _phase1_runner(state: dict[str, Any]) -> dict[str, Any]:
        phase1_parsed = _run_review2blog_phase1(
            run_id=run_id,
            reviews=state["reviews"],
            restaurant_context=state["restaurant_context"],
            resolved_max_tokens=int(state["resolved_max_tokens"]),
        )
        return {"phase1_parsed": phase1_parsed}

    def _phase2_runner(state: dict[str, Any]) -> dict[str, Any]:
        phase2_parsed = _run_review2blog_phase2(
            run_id=run_id,
            phase1_parsed=state["phase1_parsed"],
            resolved_max_tokens=int(state["resolved_max_tokens"]),
        )
        return {"phase2_parsed": phase2_parsed}

    def _phase3_runner(state: dict[str, Any]) -> dict[str, Any]:
        blurb = _run_review2blog_phase3(
            run_id=run_id,
            phase2_parsed=state["phase2_parsed"],
            listicle=state["listicle"],
            restaurant_context=state["restaurant_context"],
            resolved_max_tokens=int(state["resolved_max_tokens"]),
        )
        return {"blurb": blurb}

    def _finalize_runner(state: dict[str, Any]) -> dict[str, Any]:
        _finalize_review2blog_run(
            run_id=run_id,
            listicle=state["listicle"],
            restaurant_context=state["restaurant_context"],
            phase1_parsed=state["phase1_parsed"],
            phase2_parsed=state["phase2_parsed"],
            blurb=state["blurb"],
        )
        return {"completed": True}

    try:
        run_review2blog_graph(
            run_id=run_id,
            initial_state={
                "reviews": reviews,
                "restaurant_context": restaurant_context,
                "listicle": listicle,
                "resolved_max_tokens": resolved_max_tokens,
            },
            phase1_runner=_phase1_runner,
            phase2_runner=_phase2_runner,
            phase3_runner=_phase3_runner,
            finalize_runner=_finalize_runner,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Review2Blog graph pipeline failed", extra={"run_id": run_id})
        write_status(
            run_id,
            {
                "run_id": run_id,
                "state": "failed",
                "stage": "graph_execution",
                "error": str(exc),
                "updated_at": _now_iso(),
            },
            feature=FEATURE_NAME,
        )


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

    try:
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
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Review2Blog phase 1 request failed")
        raise HTTPException(
            status_code=502,
            detail="Review2Blog phase 1 request failed",
        ) from exc

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

    try:
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
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Review2Blog phase 2 request failed")
        raise HTTPException(
            status_code=502,
            detail="Review2Blog phase 2 request failed",
        ) from exc

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

    try:
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
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Review2Blog phase 3 request failed")
        raise HTTPException(
            status_code=502,
            detail="Review2Blog phase 3 request failed",
        ) from exc

    return JSONResponse({
        "message": "Review2Blog phase 3 completed",
        "blurb": result.strip(),
    })


@router.post("/run")
async def start_review2blog_run(
    request: Review2BlogRunRequest,
    background_tasks: BackgroundTasks,
) -> JSONResponse:
    """Queue a full Review2Blog run with tracked status and result output."""
    validated_payload = _validate_payload(request.review_payload)
    run_id = str(uuid4())

    write_status(
        run_id,
        {
            "run_id": run_id,
            "state": "running",
            "stage": "queued",
            "error": None,
            "updated_at": _now_iso(),
        },
        feature=FEATURE_NAME,
    )
    write_stage_result(
        run_id,
        "pipeline_input",
        {
            "created_at": _now_iso(),
            "data": {
                "review_count": len(validated_payload.get("reviews", [])),
                "listicle": request.listicle,
                "max_tokens": request.max_tokens,
            },
        },
    )

    background_tasks.add_task(_run_review2blog_pipeline, run_id, request)
    return JSONResponse(
        {
            "message": "Review2Blog run queued",
            "run_id": run_id,
        }
    )


@router.get("/status/{run_id}")
async def get_status(run_id: str) -> JSONResponse:
    """Get the status of a pipeline run."""
    status = read_status(run_id)
    if not status or status.get("feature") != FEATURE_NAME:
        raise HTTPException(status_code=404, detail="Run not found.")
    return JSONResponse(status)


@router.get("/result/{run_id}")
async def get_result(run_id: str) -> JSONResponse:
    """Get the result of a completed pipeline run."""
    status = read_status(run_id)
    if not status or status.get("feature") != FEATURE_NAME:
        raise HTTPException(status_code=404, detail="Run not found.")

    output = read_output(run_id)
    if not output:
        raise HTTPException(status_code=404, detail="Result not available yet.")

    trace_payload = _read_langgraph_trace(run_id)
    artifact = output["artifact"]
    if trace_payload and isinstance(artifact, dict):
        artifact.update(trace_payload)

    response_payload: dict[str, Any] = {
        "run_id": run_id,
        "markdown": output["markdown"],
        "artifact": artifact,
    }
    response_payload.update(trace_payload)

    return JSONResponse(
        response_payload
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
    return JSONResponse(get_all_completed_articles())
