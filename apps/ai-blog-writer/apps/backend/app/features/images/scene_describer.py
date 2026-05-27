"""Generate mise-en-scène style image descriptions using Vertex AI Gemini vision."""

import asyncio
import logging
import os
from functools import partial

import vertexai
from vertexai.generative_models import GenerativeModel, Part

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "gemini-2.5-flash"
DEFAULT_LOCATION = "us-central1"

_initialized = False


def _ensure_initialized():
    global _initialized
    if _initialized:
        return

    project = os.getenv("GOOGLE_CLOUD_PROJECT")
    if not project:
        raise RuntimeError("GOOGLE_CLOUD_PROJECT environment variable is required.")

    location = os.getenv("GOOGLE_CLOUD_LOCATION", DEFAULT_LOCATION)
    vertexai.init(project=project, location=location)
    _initialized = True


def _describe_sync(image_bytes: bytes, content_type: str) -> str:
    _ensure_initialized()

    model = GenerativeModel(DEFAULT_MODEL)
    image_part = Part.from_data(data=image_bytes, mime_type=content_type)

    prompt = (
        "You are a cinematographer describing the mise-en-scène of a single still image "
        "so that another artist could recreate the shot from your words alone.\n\n"
        "Describe ONLY what is actually visible. Do not invent, interpret mood, or guess "
        "story context. Do not name real people, brands, or locations.\n\n"
        "Cover these aspects, in this order, as flowing prose (not a list):\n"
        "1. Framing & shot type — wide / medium / close-up, aspect feel, camera height "
        "   (eye-level, low, high, overhead), camera angle, and approximate focal length feel "
        "   (wide-angle distortion, telephoto compression, etc.).\n"
        "2. Subject(s) — what/who is in the frame, their pose, action, gaze, clothing, "
        "   and where each one sits in the composition (left third, center, foreground, etc.).\n"
        "3. Setting & background — the environment, depth layers (foreground, midground, "
        "   background), and notable objects with their placement.\n"
        "4. Lighting — direction (front, side, back, top), quality (hard/soft, diffused), "
        "   color temperature, time-of-day cues, visible shadows and highlights.\n"
        "5. Color & texture — dominant palette, contrast, and any standout textures or materials.\n"
        "6. Depth of field & focus — what is sharp, what is blurred, any bokeh.\n\n"
        "Write 4–8 sentences, concrete and specific, in present tense. "
        "Return ONLY the description — no headings, no preamble, no bullet points."
    )

    logger.info("Generating scene description with %s", DEFAULT_MODEL)
    response = model.generate_content([image_part, prompt])
    description = response.text.strip().strip('"').strip("'")
    logger.info("Generated scene description (%d chars)", len(description))
    return description


async def generate_scene_description(image_bytes: bytes, content_type: str) -> str:
    """Generate a mise-en-scène style description of the image for recreation prompting."""
    loop = asyncio.get_running_loop()
    return await asyncio.wait_for(
        loop.run_in_executor(None, partial(_describe_sync, image_bytes, content_type)),
        timeout=30.0,
    )
