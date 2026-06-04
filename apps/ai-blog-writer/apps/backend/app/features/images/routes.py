"""API routes for image processing and upload."""

from fastapi import APIRouter

from .ai_text.routes import router as ai_text_router
from .flux.routes import router as flux_router
from .processing.routes import router as processing_router
from .providers.routes import router as providers_router
from .social.routes import router as social_router
from .uploads.routes import router as uploads_router

router = APIRouter(prefix="/images", tags=["images"])
router.include_router(providers_router)
router.include_router(uploads_router)
router.include_router(social_router)
router.include_router(flux_router)
router.include_router(processing_router)
router.include_router(ai_text_router)
