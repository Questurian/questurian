"""Vertex-backed text, image, and grounded generation."""

import logging
import os

from vertexai.generative_models import GenerativeModel, Part

from grounding import (
    is_valid_http_url,
    merge_grounded_snippets,
    parse_json_object,
)
from models import FieldSuggestionRequest, SUPPORTED_FIELD_SUGGESTION_CATEGORIES
from prompts import build_alt_text_prompt, build_field_suggestion_prompt
from vertex_runtime import (
    ACCOMMODATIONS_FIELD_SUGGESTION_MODEL,
    ALT_TEXT_MODEL,
    DEFAULT_LOCATION,
    ensure_vertex_initialized,
)


logger = logging.getLogger("vertex_alt_text")


def generate_alt_text_from_data(image_data: bytes, content_type: str) -> str:
    ensure_vertex_initialized()
    model = GenerativeModel(ALT_TEXT_MODEL)
    image_part = Part.from_data(data=image_data, mime_type=content_type)
    response = model.generate_content([image_part, build_alt_text_prompt()])
    text = (response.text or "").strip().strip('"').strip("'")
    if not text:
        raise RuntimeError("Vertex AI returned empty alt text.")
    return text


def generate_text_from_prompt(prompt: str, model_name: str | None = None) -> str:
    ensure_vertex_initialized()
    model = GenerativeModel(model_name or ALT_TEXT_MODEL)
    response = model.generate_content(prompt)
    text = (response.text or "").strip().strip('"').strip("'")
    if not text:
        raise RuntimeError("Vertex AI returned empty text.")
    return text


def generate_grounded_json_from_prompt(prompt: str, model_name: str) -> dict:
    project = (os.getenv("GOOGLE_CLOUD_PROJECT") or "").strip()
    location = (
        os.getenv("GOOGLE_CLOUD_LOCATION") or DEFAULT_LOCATION
    ).strip() or DEFAULT_LOCATION
    if not project:
        raise RuntimeError("GOOGLE_CLOUD_PROJECT environment variable is required.")
    try:
        from google import genai
        from google.genai.types import GenerateContentConfig, GoogleSearch, Tool

        client = genai.Client(vertexai=True, project=project, location=location)
        response = client.models.generate_content(
            model=model_name,
            contents=prompt,
            config=GenerateContentConfig(tools=[Tool(google_search=GoogleSearch())]),
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


def generate_field_suggestion(
    request: FieldSuggestionRequest,
    grounded_generator=generate_grounded_json_from_prompt,
) -> dict:
    if request.category not in SUPPORTED_FIELD_SUGGESTION_CATEGORIES:
        raise ValueError(
            f"category '{request.category}' is not implemented yet. Supported: {sorted(SUPPORTED_FIELD_SUGGESTION_CATEGORIES)}"
        )
    if request.kind not in {"single", "multi", "url"}:
        raise ValueError("kind must be single, multi, or url.")
    if request.kind in {"single", "multi"} and (not request.allowed_options):
        raise ValueError("allowed_options cannot be empty for kind=single|multi.")
    result = grounded_generator(
        build_field_suggestion_prompt(request),
        ACCOMMODATIONS_FIELD_SUGGESTION_MODEL,
    )
    if request.kind == "url":
        suggestion = result.get("suggestion")
        if suggestion is not None and (not is_valid_http_url(suggestion)):
            result["suggestion"] = None
            result["confidence"] = 0
    return result
