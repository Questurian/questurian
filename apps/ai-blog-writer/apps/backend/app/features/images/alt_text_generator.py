"""Generate image alt text using Vertex AI Gemini vision capabilities."""

import asyncio
import logging
from functools import partial

from utils import invoke_vertex_multimodal_text, vertex_part_from_data

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "gemini-2.5-flash-lite"


def _generate_sync(
    image_bytes: bytes, content_type: str, narrative_focus: str | None
) -> str:
    """Blocking Vertex AI call — runs in a thread pool to avoid blocking the event loop."""
    image_part = vertex_part_from_data(data=image_bytes, mime_type=content_type)

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
    alt_text = (
        invoke_vertex_multimodal_text(
            [image_part, prompt],
            model_name=DEFAULT_MODEL,
        )
        .strip('"')
        .strip("'")
    )
    logger.info("Generated alt text: %s", alt_text)
    return alt_text


async def generate_alt_text(
    image_bytes: bytes, content_type: str, narrative_focus: str | None = None
) -> str:
    """
    Generate descriptive alt text for an image using Gemini vision.

    Runs the blocking Vertex AI call in a thread pool so it doesn't
    block the FastAPI event loop. Raises TimeoutError after 20 seconds.
    """
    loop = asyncio.get_running_loop()
    return await asyncio.wait_for(
        loop.run_in_executor(
            None, partial(_generate_sync, image_bytes, content_type, narrative_focus)
        ),
        timeout=20.0,
    )
