"""Prompt2Blog public route facade."""

from .api import articles as _articles_api
from .api import generation as _generation_api
from .api import options as _options_api
from .api import runs as _runs_api
from .api.router import router
from .models import (  # noqa: F401
    ArticleTypeOption,
    ClassificationResult,
    ClassifyRequest,
    ClassifyResponse,
    PipelineV2RuntimeRequest,
    Prompt2BlogInputRequest,
    SynthesizeRequest,
    SynthesizeResponse,
)
from .orchestrator import run_full_pipeline, run_pipeline_v2


async def synthesize_sources(req: SynthesizeRequest) -> SynthesizeResponse:
    return await _generation_api.synthesize_sources(req)


async def classify_article_type(req: ClassifyRequest) -> ClassifyResponse:
    return await _generation_api.classify_article_type(req)


async def get_input_options():
    return await _options_api.get_input_options()


async def get_article_type_guideline_preview(article_type_id: int):
    return await _options_api.get_article_type_guideline_preview(article_type_id)


async def start_pipeline_v2(
    request: Prompt2BlogInputRequest,
    background_tasks,
    staff_user=None,
):
    return await _runs_api.start_pipeline_v2(request, background_tasks, staff_user)


async def start_full_run(
    request: Prompt2BlogInputRequest,
    background_tasks,
    staff_user=None,
):
    return await _runs_api.start_full_run(request, background_tasks, staff_user)


async def get_status(run_id: str):
    return await _runs_api.get_status(run_id)


async def get_result(run_id: str):
    return await _runs_api.get_result(run_id)


async def debug_run(run_id: str):
    return await _runs_api.debug_run(run_id)


async def get_articles():
    return await _articles_api.get_articles()


async def delete_article(run_id: str, staff_user=None):
    return await _articles_api.delete_article(run_id, staff_user)


async def mark_article_as_synced(run_id: str, request: dict):
    return await _articles_api.mark_article_as_synced(run_id, request)


async def get_sync_status(run_id: str):
    return await _articles_api.get_sync_status(run_id)


__all__ = [
    "router",
    "synthesize_sources",
    "classify_article_type",
    "get_input_options",
    "get_article_type_guideline_preview",
    "start_pipeline_v2",
    "start_full_run",
    "get_status",
    "get_result",
    "debug_run",
    "get_articles",
    "delete_article",
    "mark_article_as_synced",
    "get_sync_status",
    "run_pipeline_v2",
    "run_full_pipeline",
]
