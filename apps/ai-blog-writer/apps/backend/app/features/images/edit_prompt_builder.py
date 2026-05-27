"""Build an image-edit prompt from a scene description plus a user's requested changes."""

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


def _build_sync(
    image_bytes: bytes,
    content_type: str,
    scene_description: str,
    change_request: str,
) -> str:
    _ensure_initialized()

    model = GenerativeModel(DEFAULT_MODEL)
    image_part = Part.from_data(data=image_bytes, mime_type=content_type)

    prompt = (
        "You are writing a prompt for an image-editing model. The user will paste your "
        "prompt — along with the original image — into an external image editor to "
        "perform the requested changes.\n\n"
        "You are given three things:\n"
        "1. The original image (attached).\n"
        "2. A mise-en-scène description of that image (between <scene> tags).\n"
        "3. The user's requested changes (between <changes> tags).\n\n"
        f"<scene>\n{scene_description.strip()}\n</scene>\n\n"
        f"<changes>\n{change_request.strip()}\n</changes>\n\n"
        "Write a SINGLE edit prompt that:\n"
        "- Starts with a clear directive verb (\"Edit the image so that…\" or \"Modify the photo to…\").\n"
        "- States ONLY the requested changes, concretely and specifically — what is added, "
        "  removed, replaced, or altered, and where in the frame.\n"
        "- Explicitly preserves everything else: framing, camera angle, lighting direction "
        "  and quality, color palette, depth of field, subject identity and pose, and the "
        "  overall composition, unless the user's changes contradict them.\n"
        "- Uses concrete visual language (positions, materials, colors, light direction).\n"
        "- Demands photorealism. The edited result must look like an unretouched photograph, "
        "  not an illustration, render, or AI-generated image. Any new or altered element must "
        "  match the original photo's lighting direction and softness, color temperature and "
        "  white balance, shadow direction and length, focal length and perspective, depth of "
        "  field, film grain or sensor noise, and overall sharpness — so it is indistinguishable "
        "  from the surrounding pixels. Materials must have real-world surface detail "
        "  (micro-texture, weave, scuffs, pores, fabric folds, subsurface scattering on skin); "
        "  edges where new elements meet the scene must include believable contact shadows, "
        "  occlusion, and reflections. Avoid plastic, waxy, airbrushed, over-saturated, or "
        "  over-sharpened looks; avoid uncanny faces, warped hands, or duplicated features.\n"
        "- Is model-agnostic — no FLUX/SDXL/Gemini-specific syntax, no weights, no negative "
        "  prompts, no parameters. Plain natural language only.\n"
        "- Does not invent changes the user did not ask for.\n"
        "- Is 3–6 sentences. No headings, no bullet points, no preamble, no quotes around it.\n\n"
        "Return ONLY the edit prompt text."
    )

    logger.info("Building edit prompt with %s", DEFAULT_MODEL)
    response = model.generate_content([image_part, prompt])
    edit_prompt = response.text.strip().strip('"').strip("'")
    logger.info("Built edit prompt (%d chars)", len(edit_prompt))
    return edit_prompt


async def build_edit_prompt(
    image_bytes: bytes,
    content_type: str,
    scene_description: str,
    change_request: str,
) -> str:
    """Build a model-agnostic image-edit prompt from a scene description and change request."""
    loop = asyncio.get_running_loop()
    return await asyncio.wait_for(
        loop.run_in_executor(
            None,
            partial(_build_sync, image_bytes, content_type, scene_description, change_request),
        ),
        timeout=30.0,
    )
