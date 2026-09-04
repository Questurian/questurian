"""
Main API router that combines all feature routers.
"""
from fastapi import APIRouter

from app.features.images import router as images_router
from app.features.retired import router as retired_router
from app.features.article_types import router as article_types_router
from app.features.listicle_pipeline import router as listicle_pipeline_router
from app.features.prompt2blog import router as prompt2blog_router
from app.features.editor_assist import router as editor_assist_router
from app.features.itineraries_pipeline import router as itineraries_pipeline_router
from app.features.staged_drafts import router as staged_drafts_router
from app.features.claude_connection import router as claude_connection_router

router = APIRouter()


@router.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


# Include feature routers
router.include_router(images_router)
router.include_router(article_types_router)
router.include_router(prompt2blog_router)
router.include_router(listicle_pipeline_router)
router.include_router(editor_assist_router)
router.include_router(itineraries_pipeline_router)
router.include_router(staged_drafts_router)
router.include_router(claude_connection_router)
# Retired pipelines answer 410 rather than 404 (ADR 0032). Mounted last so a
# live route always wins the match.
router.include_router(retired_router)
