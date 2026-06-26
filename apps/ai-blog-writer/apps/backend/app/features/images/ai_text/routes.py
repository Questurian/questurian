"""AI image text helper routes."""

import httpx
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from ..alt_text_generator import generate_alt_text
from ..edit_prompt_builder import build_edit_prompt
from ..insert_prompt_builder import build_insert_prompt
from ..scene_describer import generate_scene_description
from ..subject_describer import generate_subject_description
from ..shared import _raise_http_error, _read_upload_file, logger

router = APIRouter()


@router.post("/generate-alt-text")
async def generate_alt_text_endpoint(
    file: UploadFile = File(...),
    narrative_focus: str = Form(
        default="",
        description="Optional audience or narrative focus for alt-text emphasis",
    ),
) -> JSONResponse:
    """Generate alt text for an image using Gemini vision."""
    content = await _read_upload_file(file, step="validate_file")
    content_type = file.content_type or "image/jpeg"

    try:
        alt_text = await generate_alt_text(
            image_bytes=content,
            content_type=content_type,
            narrative_focus=narrative_focus.strip() or None,
        )
    except TimeoutError:
        _raise_http_error(
            status_code=504,
            message="Alt text generation timed out",
            step="generate_alt_text",
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to generate alt text")
        _raise_http_error(
            status_code=500,
            message="Failed to generate alt text",
            step="generate_alt_text",
            detail=str(exc),
        )

    return JSONResponse({"success": True, "alt_text": alt_text})


@router.post("/describe-scene")
async def describe_scene_endpoint(
    file: UploadFile = File(...),
) -> JSONResponse:
    """Generate a mise-en-scène style description of an image for recreation prompting."""
    content = await _read_upload_file(file, step="validate_file")
    content_type = file.content_type or "image/jpeg"

    try:
        description = await generate_scene_description(
            image_bytes=content,
            content_type=content_type,
        )
    except TimeoutError:
        _raise_http_error(
            status_code=504,
            message="Scene description generation timed out",
            step="describe_scene",
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to generate scene description")
        _raise_http_error(
            status_code=500,
            message="Failed to generate scene description",
            step="describe_scene",
            detail=str(exc),
        )

    return JSONResponse({"success": True, "description": description})


@router.post("/build-edit-prompt")
async def build_edit_prompt_endpoint(
    file: UploadFile = File(...),
    scene_description: str = Form(
        ..., description="Mise-en-scène description of the image"
    ),
    change_request: str = Form(
        ..., description="User's requested changes to the image"
    ),
) -> JSONResponse:
    """Build a model-agnostic image-edit prompt from a scene description and change request."""
    content = await _read_upload_file(file, step="validate_file")
    content_type = file.content_type or "image/jpeg"

    normalized_scene = scene_description.strip()
    if not normalized_scene:
        _raise_http_error(
            status_code=400,
            message="scene_description is required",
            step="validate_scene_description",
        )

    normalized_changes = change_request.strip()
    if not normalized_changes:
        _raise_http_error(
            status_code=400,
            message="change_request is required",
            step="validate_change_request",
        )

    try:
        edit_prompt = await build_edit_prompt(
            image_bytes=content,
            content_type=content_type,
            scene_description=normalized_scene,
            change_request=normalized_changes,
        )
    except TimeoutError:
        _raise_http_error(
            status_code=504,
            message="Edit prompt build timed out",
            step="build_edit_prompt",
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to build edit prompt")
        _raise_http_error(
            status_code=500,
            message="Failed to build edit prompt",
            step="build_edit_prompt",
            detail=str(exc),
        )

    return JSONResponse({"success": True, "edit_prompt": edit_prompt})


@router.post("/describe-subject")
async def describe_subject_endpoint(
    file: UploadFile = File(...),
) -> JSONResponse:
    """Describe the subject(s) of an image to be inserted into another scene."""
    content = await _read_upload_file(file, step="validate_file")
    content_type = file.content_type or "image/jpeg"

    try:
        description = await generate_subject_description(
            image_bytes=content,
            content_type=content_type,
        )
    except TimeoutError:
        _raise_http_error(
            status_code=504,
            message="Subject description generation timed out",
            step="describe_subject",
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to generate subject description")
        _raise_http_error(
            status_code=500,
            message="Failed to generate subject description",
            step="describe_subject",
            detail=str(exc),
        )

    return JSONResponse({"success": True, "description": description})


@router.post("/build-insert-prompt")
async def build_insert_prompt_endpoint(
    file: UploadFile = File(..., description="The main scene image"),
    scene_description: str = Form(
        ..., description="Mise-en-scène description of the main image"
    ),
    change_request: str = Form(
        default="", description="Where/how the subjects should be inserted"
    ),
    insert_files: list[UploadFile] = File(
        ..., description="Images whose subjects are inserted into the main scene"
    ),
    insert_descriptions: list[str] = Form(
        default=[], description="Subject description for each insert image, in order"
    ),
) -> JSONResponse:
    """Build a model-agnostic edit prompt that inserts subjects into the main scene."""
    content = await _read_upload_file(file, step="validate_file")
    content_type = file.content_type or "image/jpeg"

    normalized_scene = scene_description.strip()
    if not normalized_scene:
        _raise_http_error(
            status_code=400,
            message="scene_description is required",
            step="validate_scene_description",
        )

    if not insert_files:
        _raise_http_error(
            status_code=400,
            message="At least one insert image is required",
            step="validate_insert_files",
        )

    inserts: list[dict] = []
    for index, insert_file in enumerate(insert_files):
        insert_bytes = await _read_upload_file(insert_file, step="validate_insert_file")
        description = (
            insert_descriptions[index].strip()
            if index < len(insert_descriptions)
            else ""
        )
        inserts.append(
            {
                "image_bytes": insert_bytes,
                "content_type": insert_file.content_type or "image/jpeg",
                "description": description,
            }
        )

    try:
        edit_prompt = await build_insert_prompt(
            main_image_bytes=content,
            main_content_type=content_type,
            scene_description=normalized_scene,
            inserts=inserts,
            change_request=change_request.strip(),
        )
    except TimeoutError:
        _raise_http_error(
            status_code=504,
            message="Insert prompt build timed out",
            step="build_insert_prompt",
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to build insert prompt")
        _raise_http_error(
            status_code=500,
            message="Failed to build insert prompt",
            step="build_insert_prompt",
            detail=str(exc),
        )

    return JSONResponse({"success": True, "edit_prompt": edit_prompt})


@router.post("/generate-alt-text-from-url")
async def generate_alt_text_from_url_endpoint(
    url: str = Form(..., description="Publicly accessible image URL"),
    narrative_focus: str = Form(
        default="",
        description="Optional audience or narrative focus for alt-text emphasis",
    ),
) -> JSONResponse:
    """Generate alt text for an existing image by fetching it from a URL."""
    step = "generate_alt_text_from_url"

    if not url.startswith(("http://", "https://")):
        _raise_http_error(status_code=400, message="Invalid image URL", step=step)

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            content = resp.content
            content_type = (
                resp.headers.get("content-type", "image/jpeg").split(";")[0].strip()
            )
    except httpx.HTTPStatusError as exc:
        _raise_http_error(
            status_code=502,
            message=f"Failed to fetch image from URL: HTTP {exc.response.status_code}",
            step=step,
        )
    except Exception as exc:
        logger.exception("Failed to fetch image URL for alt text generation")
        _raise_http_error(
            status_code=502,
            message="Failed to fetch image from URL",
            step=step,
            detail=str(exc),
        )

    try:
        alt_text = await generate_alt_text(
            image_bytes=content,
            content_type=content_type,
            narrative_focus=narrative_focus.strip() or None,
        )
    except TimeoutError:
        _raise_http_error(
            status_code=504, message="Alt text generation timed out", step=step
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to generate alt text from URL")
        _raise_http_error(
            status_code=500,
            message="Failed to generate alt text",
            step=step,
            detail=str(exc),
        )

    return JSONResponse({"success": True, "alt_text": alt_text})
