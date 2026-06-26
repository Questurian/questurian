"""Describe the subject(s) of an image that will be inserted into another scene."""

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
        "You are describing the main subject(s) of an image so that they can be "
        "cut out and convincingly inserted into a completely different photograph.\n\n"
        "Describe ONLY what is actually visible about the subject(s) themselves. Ignore "
        "the original background and setting — it will be discarded. Do not invent details, "
        "interpret mood, or guess story context. Do not name real people or brands.\n\n"
        "Cover these aspects as flowing prose (not a list):\n"
        "1. What the subject is — e.g. a group of four people, a single dog, a bicycle. "
        "   State the exact count of any people or animals.\n"
        "2. For each person/figure — approximate age range, build, hair, skin tone, clothing "
        "   (colors, materials, fit), pose, gaze direction, and what they are doing with their hands.\n"
        "3. Their spatial arrangement relative to each other (left to right, who is in front).\n"
        "4. The lighting currently on the subject(s) — direction, quality (hard/soft), and "
        "   color temperature — and which side the existing shadows fall.\n"
        "5. Any standout textures, materials, or accessories.\n\n"
        "Write 3–6 sentences, concrete and specific, in present tense. "
        "Return ONLY the description — no headings, no preamble, no bullet points."
    )

    logger.info("Generating subject description with %s", DEFAULT_MODEL)
    response = model.generate_content([image_part, prompt])
    description = response.text.strip().strip('"').strip("'")
    logger.info("Generated subject description (%d chars)", len(description))
    return description


async def generate_subject_description(image_bytes: bytes, content_type: str) -> str:
    """Describe the subject(s) of an image for insertion into another scene."""
    loop = asyncio.get_running_loop()
    return await asyncio.wait_for(
        loop.run_in_executor(None, partial(_describe_sync, image_bytes, content_type)),
        timeout=30.0,
    )
