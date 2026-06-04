"""FLUX image edit route."""

import re
from typing import List, Optional

from fastapi import APIRouter, File, Form, Header, UploadFile
from fastapi.responses import Response

from ..bfl_client import BflApiError, BflClient
from ..shared import (
    _extract_bearer_token,
    _raise_http_error,
    _read_additional_reference_images,
    _read_upload_file,
    _status_from_bfl_error,
    _validate_flux_dimensions,
    _validate_flux_model_id,
    _validate_flux_prompt,
    _validate_flux_safety_tolerance,
    logger,
)

router = APIRouter()


@router.post("/flux-edit")
async def flux_edit_image(
    prompt: str = Form(..., description="Exact prompt text to send to FLUX.2"),
    reference_image: UploadFile = File(
        ...,
        description="Reference image used as FLUX.2 input_image",
    ),
    additional_reference_images: List[UploadFile] = File(
        default=[],
        description="Optional supporting reference images mapped to input_image_2 through input_image_8",
    ),
    model_id: Optional[str] = Form(
        None,
        description="Optional FLUX.2 model override such as flux-2-max, flux-2-pro-preview, flux-2-pro, or flux-2-flex",
    ),
    width: Optional[int] = Form(
        None,
        description="Optional output width. Must be paired with height and both must be multiples of 16.",
    ),
    height: Optional[int] = Form(
        None,
        description="Optional output height. Must be paired with width and both must be multiples of 16.",
    ),
    safety_tolerance: int = Form(
        2,
        description="BFL moderation tolerance from 0 (strictest) to 5 (most open)",
    ),
    prompt_upsampling: bool = Form(
        False,
        description="Enable BFL prompt upsampling for models that support it",
    ),
    seed: Optional[int] = Form(
        None,
        description="Optional generation seed for reproducibility",
    ),
    authorization: Optional[str] = Header(None),
) -> Response:
    """Proxy a FLUX.2 edit request with optional multi-reference inputs."""
    _extract_bearer_token(authorization)
    valid_prompt = _validate_flux_prompt(prompt)
    valid_model_id = _validate_flux_model_id(model_id)
    valid_width, valid_height = _validate_flux_dimensions(width, height)
    valid_safety_tolerance = _validate_flux_safety_tolerance(safety_tolerance)
    reference_bytes = await _read_upload_file(
        reference_image,
        step="validate_reference_image",
    )
    additional_reference_bytes = await _read_additional_reference_images(
        additional_reference_images,
    )

    try:
        bfl_client = BflClient(model_id=valid_model_id)
        generated_image = await bfl_client.generate_flux_edit(
            prompt=valid_prompt,
            reference_image=reference_bytes,
            additional_reference_images=additional_reference_bytes,
            width=valid_width,
            height=valid_height,
            safety_tolerance=valid_safety_tolerance,
            prompt_upsampling=prompt_upsampling,
            seed=seed,
        )
    except BflApiError as exc:
        model_id = bfl_client.model_id if "bfl_client" in locals() else None
        log_method = (
            logger.warning if _status_from_bfl_error(exc) < 500 else logger.exception
        )
        log_method(
            "BFL error during /images/flux-edit | model_id=%s step=%s status=%s",
            model_id,
            exc.step,
            exc.status_code,
        )
        _raise_http_error(
            status_code=_status_from_bfl_error(exc),
            message=exc.user_message,
            step=exc.step,
            detail=exc.detail or str(exc),
            request_url=exc.request_url,
            provider_status_code=exc.status_code or None,
            bfl_status=exc.bfl_status,
            env_var=exc.env_var,
            bfl_error=exc.to_dict(),
            model_id=model_id,
        )
    except Exception as exc:
        logger.exception("Unexpected error during /images/flux-edit")
        _raise_http_error(
            status_code=500,
            message="Unexpected error while generating image with FLUX.2",
            step="flux_edit_image",
            detail=str(exc),
        )

    extension = "png" if generated_image.content_type == "image/png" else "jpg"
    safe_request_id = (
        re.sub(r"[^A-Za-z0-9_-]+", "-", generated_image.request_id).strip("-")
        or "generated"
    )
    output_filename = f"{generated_image.model_id}-{safe_request_id}.{extension}"

    headers = {
        "Content-Disposition": f'inline; filename="{output_filename}"',
        "Cache-Control": "no-store",
        "X-BFL-Request-Id": generated_image.request_id,
        "X-BFL-Model": generated_image.model_id,
    }
    if generated_image.cost is not None:
        headers["X-BFL-Cost"] = str(generated_image.cost)
    if generated_image.input_mp is not None:
        headers["X-BFL-Input-MP"] = str(generated_image.input_mp)
    if generated_image.output_mp is not None:
        headers["X-BFL-Output-MP"] = str(generated_image.output_mp)

    return Response(
        content=generated_image.bytes_content,
        media_type=generated_image.content_type,
        headers=headers,
    )
