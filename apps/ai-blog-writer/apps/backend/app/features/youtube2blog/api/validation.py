"""Validation shared by YouTube2Blog route families."""

from fastapi import HTTPException

from ..config import VALID_Y2B_MODELS


def require_valid_model(model: str | None) -> None:
    """Reject unsupported base-model overrides without changing route semantics."""
    if model is not None and model not in VALID_Y2B_MODELS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid model '{model}'. Valid options: {sorted(VALID_Y2B_MODELS)}",
        )
