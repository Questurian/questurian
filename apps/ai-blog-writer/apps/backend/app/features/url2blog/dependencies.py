"""Explicit collaborators used by the URL2Blog pipeline."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, Protocol

from fastapi.responses import JSONResponse

from app.core import get_article_type_by_id

from .content.text_cleanup import _cleanup_pasted_article_text
from .llm import invocation
from .models import ExtractRequest, Stage2ClassifyRequest
from .run_recorder import RunRecorder


class Url2BlogLLM(Protocol):
    def invoke_json(self, **kwargs: Any) -> tuple[dict[str, Any], str]: ...

    def invoke_json_best_effort(
        self, **kwargs: Any
    ) -> tuple[dict[str, Any] | None, str, str | None]: ...

    def invoke_json_tracked(self, **kwargs: Any) -> tuple[dict[str, Any], str]: ...

    def invoke_grounded_json(
        self, *args: Any, **kwargs: Any
    ) -> tuple[dict[str, Any], str, list[str]]: ...

    def invoke_markdown(self, **kwargs: Any) -> dict[str, Any]: ...

    def invoke_title(self, **kwargs: Any) -> tuple[str, str]: ...

    def invoke_text(self, **kwargs: Any) -> str: ...


@dataclass(frozen=True)
class DefaultUrl2BlogLLM:
    def invoke_json(self, **kwargs: Any) -> tuple[dict[str, Any], str]:
        return invocation._invoke_json_llm(**kwargs)

    def invoke_json_best_effort(
        self, **kwargs: Any
    ) -> tuple[dict[str, Any] | None, str, str | None]:
        return invocation._invoke_json_llm_best_effort(**kwargs)

    def invoke_json_tracked(self, **kwargs: Any) -> tuple[dict[str, Any], str]:
        return invocation._invoke_json_llm_tracked(**kwargs)

    def invoke_grounded_json(
        self, *args: Any, **kwargs: Any
    ) -> tuple[dict[str, Any], str, list[str]]:
        return invocation._invoke_google_grounded_json(*args, **kwargs)

    def invoke_markdown(self, **kwargs: Any) -> dict[str, Any]:
        return invocation._invoke_markdown_long_output(**kwargs)

    def invoke_title(self, **kwargs: Any) -> tuple[str, str]:
        return invocation._invoke_title_generation(**kwargs)

    def invoke_text(
        self,
        *,
        prompt: str,
        temperature: float,
        max_tokens: int,
        model_name: str,
    ) -> str:
        llm = invocation.get_vertex_llm(
            temperature=temperature,
            max_tokens=max_tokens,
            model_name=model_name,
        )
        invoke = getattr(llm, "invoke", None)
        if not callable(invoke):
            return ""
        result = invoke(prompt)
        return result if isinstance(result, str) else str(result or "")


async def _extract_article(request: ExtractRequest, llm: Url2BlogLLM) -> JSONResponse:
    from .stages.stage1 import extract_article

    return await extract_article(request, llm=llm)


async def _classify_article_type(
    request: Stage2ClassifyRequest, llm: Url2BlogLLM
) -> JSONResponse:
    from .stages.stage2 import classify_article_type

    return await classify_article_type(request, llm=llm)


@dataclass(frozen=True)
class PipelineDependencies:
    llm: Url2BlogLLM = field(default_factory=DefaultUrl2BlogLLM)
    recorder: RunRecorder = field(default_factory=RunRecorder)
    extract_article: Callable[
        [ExtractRequest, Url2BlogLLM], Awaitable[JSONResponse]
    ] = _extract_article
    classify_article_type: Callable[
        [Stage2ClassifyRequest, Url2BlogLLM], Awaitable[JSONResponse]
    ] = _classify_article_type
    cleanup_pasted_text: Callable[..., dict[str, Any]] = _cleanup_pasted_article_text
    get_article_type: Callable[[int], dict[str, Any] | None] = get_article_type_by_id
