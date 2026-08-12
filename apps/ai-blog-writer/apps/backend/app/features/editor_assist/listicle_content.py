"""Compatible HTTP facade for Listicle Content Generation."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.core.staff_auth import require_staff

from .angle_assignment import ListicleAngle as AssignmentAngle
from .contracts import ListTone
from .critical_fields import CriticalFieldsResult
from .dependencies import EditorAssistDependencies, get_editor_assist_dependencies
from .listicle_content_contracts import (
    GenerateListicleContentRequest,
    GenerateListicleContentResponse,
    GenerateListicleTargetRequest,
    GenerateListicleTargetResponse,
    ListicleAngleRequest,
    ListicleGuidelinesResponse,
    PayloadCollectionSlug,
    StepEvent,
    StepEventName,
    StepEventStatus,
)
from .listicle_content_generation import (
    generate_listicle_content as _generate_listicle_content_impl,
)
from .listicle_guidelines import (
    get_listicle_guidelines,
    router as listicle_guidelines_router,
)
from .listicle_writer_contracts import ListicleArticleType, ListicleCategory
from .research_profile import (
    ResearchProfile,
    ResearchProfileRequest,
    ResearchProfileTrace,
)

router = APIRouter()
router.include_router(listicle_guidelines_router)
logger = logging.getLogger(__name__)


@router.post(
    "/generate-listicle-content",
    response_model=GenerateListicleContentResponse,
    dependencies=[Depends(require_staff)],
)
async def generate_listicle_content(
    request: GenerateListicleContentRequest,
    dependencies: Annotated[
        EditorAssistDependencies, Depends(get_editor_assist_dependencies)
    ],
) -> GenerateListicleContentResponse:
    try:
        return dependencies.run_graph(
            node_name="editor_assist_generate_listicle_content",
            step_runner=lambda: _generate_listicle_content_impl(request, dependencies),
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "Editor Assist graph generate-listicle-content failed: %s", exc
        )
        raise HTTPException(
            status_code=502,
            detail="AI listicle generation graph failed",
        ) from exc


__all__ = [
    "AssignmentAngle",
    "CriticalFieldsResult",
    "EditorAssistDependencies",
    "GenerateListicleContentRequest",
    "GenerateListicleContentResponse",
    "GenerateListicleTargetRequest",
    "GenerateListicleTargetResponse",
    "ListicleAngleRequest",
    "ListicleArticleType",
    "ListicleCategory",
    "ListicleGuidelinesResponse",
    "ListTone",
    "PayloadCollectionSlug",
    "ResearchProfile",
    "ResearchProfileRequest",
    "ResearchProfileTrace",
    "StepEvent",
    "StepEventName",
    "StepEventStatus",
    "generate_listicle_content",
    "get_listicle_guidelines",
    "router",
]
