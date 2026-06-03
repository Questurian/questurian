"""Prompt2Blog feature router facade."""

from app.core import (
    cleanup_run,
    get_article_type_by_id,
    get_article_type_by_name,
    read_article_type_name_definitions,
    read_output,
    read_stage_result,
    read_status,
    write_artifact,
    write_stage_result,
    write_status,
)

from .api import articles as _articles_api
from .api import generation as _generation_api
from .api import options as _options_api
from .api import runs as _runs_api
from .api.router import router
from .services import pipeline as _pipeline_service
from .services.pipeline import (  # noqa: F401
    ArticleTypeOption,
    ClassificationResult,
    ClassifyRequest,
    ClassifyResponse,
    PipelineV2RuntimeRequest,
    Prompt2BlogInputRequest,
    SynthesizeRequest,
    SynthesizeResponse,
)

run_prompt2blog_full_graph = _pipeline_service.run_prompt2blog_full_graph
run_prompt2blog_pipeline_v2_graph = _pipeline_service.run_prompt2blog_pipeline_v2_graph


def _sync_compat_overrides() -> None:
    for module in (_pipeline_service, _runs_api, _options_api, _articles_api):
        for name in (
            "cleanup_run",
            "get_article_type_by_id",
            "get_article_type_by_name",
            "read_article_type_name_definitions",
            "read_output",
            "read_stage_result",
            "read_status",
            "write_artifact",
            "write_stage_result",
            "write_status",
        ):
            if hasattr(module, name) and name in globals():
                setattr(module, name, globals()[name])

    for name in (
        "_resolve_input_options",
        "_build_writing_brief_from_input",
        "_invoke_text_llm",
        "_invoke_json_llm",
        "run_prompt2blog_full_graph",
        "run_prompt2blog_pipeline_v2_graph",
    ):
        if name in globals():
            setattr(_pipeline_service, name, globals()[name])

    if "_run_full_pipeline" in globals():
        _runs_api._run_full_pipeline = globals()["_run_full_pipeline"]


def __getattr__(name: str):
    if hasattr(_pipeline_service, name):
        return getattr(_pipeline_service, name)
    raise AttributeError(name)


async def synthesize_sources(req: SynthesizeRequest) -> SynthesizeResponse:
    _sync_compat_overrides()
    return await _generation_api.synthesize_sources(req)


async def classify_article_type(req: ClassifyRequest) -> ClassifyResponse:
    _sync_compat_overrides()
    return await _generation_api.classify_article_type(req)


async def get_input_options():
    _sync_compat_overrides()
    return await _options_api.get_input_options()


async def get_article_type_guideline_preview(article_type_id: int):
    _sync_compat_overrides()
    return await _options_api.get_article_type_guideline_preview(article_type_id)


async def start_pipeline_v2(request: Prompt2BlogInputRequest, background_tasks):
    _sync_compat_overrides()
    return await _runs_api.start_pipeline_v2(request, background_tasks)


async def start_full_run(request: Prompt2BlogInputRequest, background_tasks):
    _sync_compat_overrides()
    return await _runs_api.start_full_run(request, background_tasks)


async def get_status(run_id: str):
    _sync_compat_overrides()
    return await _runs_api.get_status(run_id)


async def get_result(run_id: str):
    _sync_compat_overrides()
    return await _runs_api.get_result(run_id)


async def debug_run(run_id: str):
    _sync_compat_overrides()
    return await _runs_api.debug_run(run_id)


async def get_articles():
    _sync_compat_overrides()
    return await _articles_api.get_articles()


async def delete_article(run_id: str):
    _sync_compat_overrides()
    return await _articles_api.delete_article(run_id)


async def mark_article_as_synced(run_id: str, request: dict):
    _sync_compat_overrides()
    return await _articles_api.mark_article_as_synced(run_id, request)


async def get_sync_status(run_id: str):
    _sync_compat_overrides()
    return await _articles_api.get_sync_status(run_id)


def _prepare_full_pipeline_request(run_id: str, request: Prompt2BlogInputRequest):
    _sync_compat_overrides()
    return _pipeline_service._prepare_full_pipeline_request(run_id, request)


def _run_pipeline_v2(run_id: str, request: PipelineV2RuntimeRequest) -> None:
    _sync_compat_overrides()
    return _pipeline_service._run_pipeline_v2(run_id, request)


def _run_full_pipeline(run_id: str, request: Prompt2BlogInputRequest) -> None:
    _sync_compat_overrides()
    return _pipeline_service._run_full_pipeline(run_id, request)

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
    "cleanup_run",
    "get_article_type_by_id",
    "get_article_type_by_name",
    "read_article_type_name_definitions",
    "read_output",
    "read_stage_result",
    "read_status",
    "write_artifact",
    "write_stage_result",
    "write_status",
    "run_prompt2blog_full_graph",
    "run_prompt2blog_pipeline_v2_graph",
]
