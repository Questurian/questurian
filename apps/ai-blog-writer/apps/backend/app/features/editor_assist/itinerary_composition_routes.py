"""HTTP orchestration for Itinerary Composition workflows."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.core.staff_auth import require_staff

from .dependencies import EditorAssistDependencies, get_editor_assist_dependencies
from .itinerary_brief import _compose_itinerary_brief_impl
from .itinerary_composition_contracts import (
    ComposeDayBlurbsRequest,
    ComposeDayBlurbsResponse,
    ComposeItineraryBriefRequest,
    ComposeItineraryBriefResponse,
    ComposeItineraryIntroRequest,
    ComposeItineraryIntroResponse,
    ComposeStopReasonRequest,
    ComposeStopReasonResponse,
)
from .itinerary_day_blurb_execution import _compose_day_blurbs_impl
from .itinerary_intro import _compose_itinerary_intro_impl
from .itinerary_stop_reason import _compose_stop_reason_impl

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post(
    "/compose-itinerary-brief",
    response_model=ComposeItineraryBriefResponse,
    dependencies=[Depends(require_staff)],
)
async def compose_itinerary_brief(
    request: ComposeItineraryBriefRequest,
    dependencies: Annotated[
        EditorAssistDependencies, Depends(get_editor_assist_dependencies)
    ],
) -> ComposeItineraryBriefResponse:
    try:
        return dependencies.run_graph(
            node_name="editor_assist_compose_itinerary_brief",
            step_runner=lambda: _compose_itinerary_brief_impl(request, dependencies),
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Editor Assist graph compose-itinerary-brief failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI brief composition graph failed",
        ) from exc


@router.post(
    "/compose-itinerary-intro",
    response_model=ComposeItineraryIntroResponse,
    dependencies=[Depends(require_staff)],
)
async def compose_itinerary_intro(
    request: ComposeItineraryIntroRequest,
    dependencies: Annotated[
        EditorAssistDependencies, Depends(get_editor_assist_dependencies)
    ],
) -> ComposeItineraryIntroResponse:
    try:
        return dependencies.run_graph(
            node_name="editor_assist_compose_itinerary_intro",
            step_runner=lambda: _compose_itinerary_intro_impl(request, dependencies),
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Editor Assist graph compose-itinerary-intro failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI intro composition graph failed",
        ) from exc


@router.post(
    "/compose-itinerary-day-blurbs",
    response_model=ComposeDayBlurbsResponse,
    dependencies=[Depends(require_staff)],
)
async def compose_itinerary_day_blurbs(
    request: ComposeDayBlurbsRequest,
    dependencies: Annotated[
        EditorAssistDependencies, Depends(get_editor_assist_dependencies)
    ],
) -> ComposeDayBlurbsResponse:
    try:
        return dependencies.run_graph(
            node_name="editor_assist_compose_itinerary_day_blurbs",
            step_runner=lambda: _compose_day_blurbs_impl(request, dependencies),
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "Editor Assist graph compose-itinerary-day-blurbs failed: %s", exc
        )
        raise HTTPException(
            status_code=502,
            detail="AI day-blurb composition graph failed",
        ) from exc


@router.post(
    "/compose-itinerary-stop-reason",
    response_model=ComposeStopReasonResponse,
    dependencies=[Depends(require_staff)],
)
async def compose_itinerary_stop_reason(
    request: ComposeStopReasonRequest,
    dependencies: Annotated[
        EditorAssistDependencies, Depends(get_editor_assist_dependencies)
    ],
) -> ComposeStopReasonResponse:
    try:
        return dependencies.run_graph(
            node_name="editor_assist_compose_itinerary_stop_reason",
            step_runner=lambda: _compose_stop_reason_impl(request, dependencies),
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "Editor Assist graph compose-itinerary-stop-reason failed: %s", exc
        )
        raise HTTPException(
            status_code=502,
            detail="AI stop-reason composition graph failed",
        ) from exc
