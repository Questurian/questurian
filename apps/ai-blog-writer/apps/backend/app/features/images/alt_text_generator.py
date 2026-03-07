"""Generate image alt text using Vertex AI Gemini vision capabilities."""

import logging
import os

import vertexai
from vertexai.generative_models import GenerativeModel, Part

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "gemini-2.5-flash-lite"
DEFAULT_LOCATION = "us-central1"

_initialized = False


def _ensure_initialized():
    """Initialize Vertex AI SDK once."""
    global _initialized
    if _initialized:
        return

    project = os.getenv("GOOGLE_CLOUD_PROJECT")
    if not project:
        raise RuntimeError(
            "GOOGLE_CLOUD_PROJECT environment variable is required."
        )

    location = os.getenv("GOOGLE_CLOUD_LOCATION", DEFAULT_LOCATION)
    vertexai.init(project=project, location=location)
    _initialized = True


def generate_alt_text(
    image_bytes: bytes, content_type: str, narrative_focus: str | None = None
) -> str:
    """
    Generate descriptive alt text for an image using Gemini vision.

    Args:
        image_bytes: Raw image file bytes.
        content_type: MIME type of the image (e.g., 'image/jpeg', 'image/png').

    Returns:
        A concise alt text string describing the image.
    """
    _ensure_initialized()

    model = GenerativeModel(DEFAULT_MODEL)

    image_part = Part.from_data(data=image_bytes, mime_type=content_type)

    prompt = (
        "You are an accessibility expert writing HTML alt text.\n\n"
        "Write ONE clear, concise sentence describing what is essential to understand the image.\n"
        "Focus on the main subject, any visible action, and relevant context.\n"
        "Use concrete nouns and plain language.\n"
        "Avoid filler, opinions, and unnecessary adjectives.\n"
        "Do NOT start with \"Image of\" or \"Photo of\".\n"
        "Keep the result under 125 characters.\n"
        "Return ONLY the alt text."
    )

    focus_text = (narrative_focus or "").strip()
    if focus_text:
        prompt += (
            "\n\nOptional audience reframing guidance:\n"
            f"{focus_text}\n\n"
            "If this guidance is relevant to visible image details, prioritize those details.\n"
            "Do not invent anything not visible in the image."
        )

    logger.info("Generating alt text with %s", DEFAULT_MODEL)

    response = model.generate_content([image_part, prompt])
    alt_text = response.text.strip().strip('"').strip("'")

    logger.info("Generated alt text: %s", alt_text)
    return alt_text
