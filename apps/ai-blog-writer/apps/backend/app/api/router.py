"""
Main API router that combines all feature routers.
"""
from fastapi import APIRouter

from app.features.youtube2blog import router as youtube2blog_router
from app.features.images import router as images_router
from app.features.url2blog import router as url2blog_router
from app.features.article_types import router as article_types_router
from app.features.prompt2blog import router as prompt2blog_router
from app.features.editor_assist import router as editor_assist_router
from app.features.itineraries_pipeline import router as itineraries_pipeline_router
from app.features.staged_drafts import router as staged_drafts_router

router = APIRouter()


@router.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


# Include feature routers
router.include_router(youtube2blog_router)
router.include_router(images_router)
router.include_router(url2blog_router)
router.include_router(article_types_router)
router.include_router(prompt2blog_router)
router.include_router(editor_assist_router)
router.include_router(itineraries_pipeline_router)
router.include_router(staged_drafts_router)
