"""Aggregate the cohesive YouTube2Blog route families."""

from fastapi import APIRouter

from .articles import router as articles_router
from .diagnostics import router as diagnostics_router
from .expansion import router as expansion_router
from .pipeline import router as pipeline_router
from .sync import router as sync_router
from .testing import router as testing_router

router = APIRouter(prefix="/youtube2blog", tags=["youtube2blog"])
router.include_router(pipeline_router)
router.include_router(diagnostics_router)
router.include_router(testing_router)
router.include_router(articles_router)
router.include_router(sync_router)
router.include_router(expansion_router)
