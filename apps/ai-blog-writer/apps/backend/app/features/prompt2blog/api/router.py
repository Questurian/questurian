from fastapi import APIRouter

from .articles import router as articles_router
from .generation import router as generation_router
from .intake import router as intake_router
from .options import router as options_router
from .runs import router as runs_router

router = APIRouter(prefix="/prompt2blog", tags=["prompt2blog"])
router.include_router(generation_router)
router.include_router(intake_router)
router.include_router(options_router)
router.include_router(runs_router)
router.include_router(articles_router)
