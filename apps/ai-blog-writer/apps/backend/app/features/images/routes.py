"""API routes for image processing and upload."""

from fastapi import APIRouter

from .api.ai_text import router as ai_text_router
from .api.flux import router as flux_router
from .api.processing import router as processing_router
from .api.providers import router as providers_router
from .api.social import router as social_router
from .api.uploads import router as uploads_router

router = APIRouter(prefix="/images", tags=["images"])
router.include_router(providers_router)
router.include_router(uploads_router)
router.include_router(social_router)
router.include_router(flux_router)
router.include_router(processing_router)
router.include_router(ai_text_router)
