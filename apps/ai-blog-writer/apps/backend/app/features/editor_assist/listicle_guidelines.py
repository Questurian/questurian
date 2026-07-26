"""Writer vocabulary endpoint for Listicle Content Generation."""

from fastapi import APIRouter

from .listicle_content_contracts import ListicleGuidelinesResponse
from .listicle_prompt_policy import (
    LIST_TONE_GUIDANCE,
    LISTICLE_ANGLE_GUIDANCE,
)

router = APIRouter()


@router.get("/listicle-guidelines", response_model=ListicleGuidelinesResponse)
async def get_listicle_guidelines() -> ListicleGuidelinesResponse:
    """Return the exact angle and tone guidance strings used by the writer."""
    return ListicleGuidelinesResponse(
        angles=dict(LISTICLE_ANGLE_GUIDANCE),
        tones=dict(LIST_TONE_GUIDANCE),
    )


__all__ = ["get_listicle_guidelines", "router"]
