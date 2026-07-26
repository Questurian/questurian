"""Thin public facade for the YouTube2Blog API route families."""

from .api.articles import clear_database, delete_article, get_articles
from .api.diagnostics import Y2B_DEBUG_STAGE_ORDER, debug_run
from .api.expansion import (
    detect_article_listicle,
    get_expand_result,
    get_expand_status,
    start_deep_expand,
)
from .api.pipeline import (
    get_result,
    get_status,
    get_tones,
    start_from_youtube_url,
)
from .api.router import router
from .api.sync import get_sync_status, mark_article_as_synced
from .api.testing import TEST_RECORD, test_pipeline, test_stage1
from .config import VALID_Y2B_MODELS
from .models import DeepExpandRequest, ListicleDetectRequest, YouTubeUrlRequest

__all__ = [
    "router",
    "YouTubeUrlRequest",
    "ListicleDetectRequest",
    "DeepExpandRequest",
    "VALID_Y2B_MODELS",
    "Y2B_DEBUG_STAGE_ORDER",
    "TEST_RECORD",
    "start_from_youtube_url",
    "get_status",
    "get_tones",
    "get_result",
    "debug_run",
    "test_stage1",
    "test_pipeline",
    "clear_database",
    "get_articles",
    "delete_article",
    "mark_article_as_synced",
    "detect_article_listicle",
    "start_deep_expand",
    "get_expand_status",
    "get_expand_result",
    "get_sync_status",
]
