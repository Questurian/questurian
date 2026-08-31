"""Prompt2Blog public route facade."""

# These wrappers are `def`, not `async def`, and delegate to plain functions.
# FastAPI runs an `async def` handler on the event loop; every prompt2blog
# handler blocks (model calls, web searches, SQLite), so running them there
# froze the whole server for the length of a research pass. The `options`
# wrappers below are the exception: they stay async because what they call
# still is.

from .api import articles as _articles_api
from .api import generation as _generation_api
from .api import options as _options_api
from .api import runs as _runs_api
from .api.router import router
from .contracts_v4 import Prompt2BlogV4Request  # noqa: F401
from .models import (  # noqa: F401
    ArticleTypeOption,
    ClassificationResult,
    ClassifyRequest,
    ClassifyResponse,
    PipelineV4RuntimeRequest,
    SynthesizeRequest,
    SynthesizeResponse,
)
from .orchestrator_v3 import (  # noqa: F401
    resume_pipeline_v3,
    run_pipeline_v3,
)


def synthesize_sources(req: SynthesizeRequest) -> SynthesizeResponse:
    return _generation_api.synthesize_sources(req)


def classify_article_type(req: ClassifyRequest) -> ClassifyResponse:
    return _generation_api.classify_article_type(req)


async def get_input_options():
    return await _options_api.get_input_options()


async def get_editorial_options():
    return await _options_api.get_editorial_options()


async def get_article_type_guideline_preview(article_type_id: int):
    return await _options_api.get_article_type_guideline_preview(article_type_id)


def start_pipeline_v3(
    request: Prompt2BlogV4Request,
    background_tasks,
    staff_user=None,
):
    return _runs_api.start_pipeline_v3(request, background_tasks, staff_user)


def preview_resume(run_id: str):
    return _runs_api.preview_resume(run_id)


def resume_run(run_id: str, background_tasks, staff_user=None):
    return _runs_api.resume_run(run_id, background_tasks, staff_user)


def get_status(run_id: str):
    return _runs_api.get_status(run_id)


def get_result(run_id: str):
    return _runs_api.get_result(run_id)


def debug_run(run_id: str):
    return _runs_api.debug_run(run_id)


def get_articles():
    return _articles_api.get_articles()


def delete_article(run_id: str, staff_user=None):
    return _articles_api.delete_article(run_id, staff_user)


def mark_article_as_synced(run_id: str, request: dict):
    return _articles_api.mark_article_as_synced(run_id, request)


def get_sync_status(run_id: str):
    return _articles_api.get_sync_status(run_id)


__all__ = [
    "router",
    "synthesize_sources",
    "classify_article_type",
    "get_input_options",
    "get_editorial_options",
    "get_article_type_guideline_preview",
    "start_pipeline_v3",
    "preview_resume",
    "resume_run",
    "get_status",
    "get_result",
    "debug_run",
    "get_articles",
    "delete_article",
    "mark_article_as_synced",
    "get_sync_status",
    "run_pipeline_v3",
    "resume_pipeline_v3",
]
