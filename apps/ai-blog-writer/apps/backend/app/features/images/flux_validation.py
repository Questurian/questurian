"""Validation policy for FLUX image generation requests."""

from typing import Optional

from .errors import _raise_http_error


ALLOWED_BFL_MODEL_IDS = {
    "flux-2-max",
    "flux-2-pro-preview",
    "flux-2-pro",
    "flux-2-flex",
}
MIN_BFL_DIMENSION = 64
BFL_DIMENSION_MULTIPLE = 16


def _validate_flux_prompt(prompt: str) -> str:
    normalized_prompt = prompt.strip()
    if not normalized_prompt:
        _raise_http_error(
            status_code=400, message='prompt is required', step='validate_flux_prompt'
        )
    return normalized_prompt


def _validate_flux_model_id(model_id: Optional[str]) -> Optional[str]:
    normalized_model_id = (model_id or '').strip()
    if not normalized_model_id:
        return None
    if normalized_model_id not in ALLOWED_BFL_MODEL_IDS:
        _raise_http_error(
            status_code=400,
            message='model_id must target a supported FLUX.2 endpoint',
            step='validate_flux_model_id',
            model_id=model_id,
            allowed_model_ids=sorted(ALLOWED_BFL_MODEL_IDS),
        )
    return normalized_model_id


def _validate_flux_safety_tolerance(safety_tolerance: int) -> int:
    if 0 <= safety_tolerance <= 5:
        return safety_tolerance
    _raise_http_error(
        status_code=400,
        message='safety_tolerance must be between 0 and 5',
        step='validate_flux_safety_tolerance',
        safety_tolerance=safety_tolerance,
        min_value=0,
        max_value=5,
    )


def _validate_flux_dimensions(
    width: Optional[int], height: Optional[int]
) -> tuple[Optional[int], Optional[int]]:
    if width is None and height is None:
        return (None, None)
    if width is None or height is None:
        _raise_http_error(
            status_code=400,
            message='width and height must be provided together',
            step='validate_flux_dimensions',
            width=width,
            height=height,
        )
    if width < MIN_BFL_DIMENSION or height < MIN_BFL_DIMENSION:
        _raise_http_error(
            status_code=400,
            message='width and height must each be at least 64 pixels',
            step='validate_flux_dimensions',
            width=width,
            height=height,
            min_dimension=MIN_BFL_DIMENSION,
        )
    if width % BFL_DIMENSION_MULTIPLE != 0 or height % BFL_DIMENSION_MULTIPLE != 0:
        _raise_http_error(
            status_code=400,
            message='width and height must be multiples of 16',
            step='validate_flux_dimensions',
            width=width,
            height=height,
            multiple=BFL_DIMENSION_MULTIPLE,
        )
    return (width, height)
