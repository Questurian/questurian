"""Build an image-edit prompt that inserts subjects from other images into a main scene."""

import asyncio
import logging
from functools import partial

from utils import vertex_part_from_data

from app.shared.model_calls import multimodal_text

logger = logging.getLogger(__name__)

# What this call is, to the gateway that picks its model and the dashboard
# that records what it cost.
JOB = "images.insert_prompt"


def _build_sync(
    main_image_bytes: bytes,
    main_content_type: str,
    scene_description: str,
    inserts: list[dict],
    change_request: str,
) -> str:
    parts: list[object] = []
    parts.append(
        vertex_part_from_data(data=main_image_bytes, mime_type=main_content_type)
    )

    inserts_block_lines: list[str] = []
    for index, insert in enumerate(inserts, start=1):
        parts.append(
            vertex_part_from_data(
                data=insert["image_bytes"], mime_type=insert["content_type"]
            )
        )
        description = (insert.get("description") or "").strip()
        inserts_block_lines.append(
            f"Insert image {index}: {description or '(no description provided)'}"
        )
    inserts_block = "\n".join(inserts_block_lines)

    placement = change_request.strip()
    placement_block = (
        f"<placement>\n{placement}\n</placement>\n\n"
        if placement
        else "<placement>\nNo specific placement was given — choose the most natural, "
        "believable placement for each inserted subject within the main scene.\n</placement>\n\n"
    )

    prompt = (
        "You are writing a prompt for an image-editing model. The user will paste your "
        "prompt — along with the original images — into an external image editor to "
        "insert subjects from the additional images into the main image.\n\n"
        "You are given:\n"
        "1. The MAIN image (the first attached image) — the scene everything is inserted into.\n"
        "2. One or more INSERT images (the remaining attached images) — each contains a "
        "   subject to be cut out and placed into the main scene.\n"
        "3. A mise-en-scène description of the main image (between <scene> tags).\n"
        "4. A description of each insert subject (between <inserts> tags).\n"
        "5. The user's placement instructions (between <placement> tags).\n\n"
        f"<scene>\n{scene_description.strip()}\n</scene>\n\n"
        f"<inserts>\n{inserts_block}\n</inserts>\n\n"
        f"{placement_block}"
        "Write a SINGLE edit prompt that:\n"
        "- Starts with a clear directive verb (\"Edit the main image so that…\" or "
        "  \"Insert into the photo…\").\n"
        "- Describes inserting each subject from the insert images into the main scene at the "
        "  position the user requested (or the most natural position if none was given). Refer "
        "  to subjects by their described appearance, not by image number.\n"
        "- Explicitly preserves the main scene: framing, camera angle, lighting direction and "
        "  quality, color palette, depth of field, existing subjects, and overall composition.\n"
        "- Re-lights and color-grades every inserted subject to match the MAIN scene — the "
        "  inserted subjects must take on the main image's lighting direction and softness, "
        "  color temperature and white balance, and contrast, NOT the lighting from their "
        "  original photo. Cast believable contact shadows and occlusion where they meet the "
        "  ground, surfaces, or other subjects, and scale them correctly for their position in "
        "  the scene's perspective and depth.\n"
        "- Demands photorealism. The result must look like a single unretouched photograph, not "
        "  a collage or composite. Match focal length and perspective, depth of field, film "
        "  grain or sensor noise, and overall sharpness so inserted subjects are indistinguishable "
        "  from the surrounding pixels. Preserve each subject's identity, count, clothing, and "
        "  pose. Avoid plastic, waxy, airbrushed, or cut-out looks; avoid warped hands, uncanny "
        "  faces, or duplicated features.\n"
        "- Is model-agnostic — no FLUX/SDXL/Gemini-specific syntax, no weights, no negative "
        "  prompts, no parameters. Plain natural language only.\n"
        "- Does not invent subjects or changes the user did not ask for.\n"
        "- Is 3–6 sentences. No headings, no bullet points, no preamble, no quotes around it.\n\n"
        "Return ONLY the edit prompt text."
    )
    parts.append(prompt)

    logger.info(
        "Building insert prompt with %s (%d insert image(s))",
        JOB,
        len(inserts),
    )
    edit_prompt = (
        multimodal_text(
            JOB,
            parts,
            endpoint="insert_prompt",
        )
        .strip('"')
        .strip("'")
    )
    logger.info("Built insert prompt (%d chars)", len(edit_prompt))
    return edit_prompt


async def build_insert_prompt(
    main_image_bytes: bytes,
    main_content_type: str,
    scene_description: str,
    inserts: list[dict],
    change_request: str,
) -> str:
    """Build a model-agnostic edit prompt that inserts subjects into a main scene.

    Each entry in ``inserts`` is a dict with keys ``image_bytes``, ``content_type``,
    and ``description``.
    """
    loop = asyncio.get_running_loop()
    return await asyncio.wait_for(
        loop.run_in_executor(
            None,
            partial(
                _build_sync,
                main_image_bytes,
                main_content_type,
                scene_description,
                inserts,
                change_request,
            ),
        ),
        timeout=45.0,
    )
