"""Editor Assist HTTP router aggregation."""

from fastapi import APIRouter

from .editorial_actions import router as editorial_actions_router
from .itinerary_composition import router as itinerary_composition_router
from .listicle_content import router as listicle_content_router
from .seo_metadata import router as seo_metadata_router

router = APIRouter(prefix="/editor-assist", tags=["editor-assist"])
router.include_router(editorial_actions_router)
router.include_router(itinerary_composition_router)
router.include_router(listicle_content_router)
router.include_router(seo_metadata_router)
