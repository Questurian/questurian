"""Describe the subject(s) of an image that will be inserted into another scene."""

import asyncio
import logging
from functools import partial

from utils import vertex_part_from_data

from app.shared.model_calls import multimodal_text

logger = logging.getLogger(__name__)

# What this call is, to the gateway that picks its model and the dashboard
# that records what it cost.
JOB = "images.subject_description"


def _describe_sync(image_bytes: bytes, content_type: str) -> str:
    image_part = vertex_part_from_data(data=image_bytes, mime_type=content_type)

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

    logger.info("Generating subject description for %s", JOB)
    description = (
        multimodal_text(
            JOB,
            [image_part, prompt],
            endpoint="subject_description",
        )
        .strip('"')
        .strip("'")
    )
    logger.info("Generated subject description (%d chars)", len(description))
    return description


async def generate_subject_description(image_bytes: bytes, content_type: str) -> str:
    """Describe the subject(s) of an image for insertion into another scene."""
    loop = asyncio.get_running_loop()
    return await asyncio.wait_for(
        loop.run_in_executor(None, partial(_describe_sync, image_bytes, content_type)),
        timeout=30.0,
    )
