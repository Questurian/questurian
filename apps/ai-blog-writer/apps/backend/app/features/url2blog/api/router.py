from fastapi import APIRouter

from .articles import router as articles_router
from .generation import router as generation_router
from .options import router as options_router
from .runs import router as runs_router

router = APIRouter(prefix="/url2blog", tags=["url2blog"])
router.include_router(runs_router)
router.include_router(articles_router)
router.include_router(generation_router)
router.include_router(options_router)
