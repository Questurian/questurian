"""Explicit URL2Blog fakes shared by pipeline tests."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from fastapi.responses import JSONResponse

from app.features.url2blog.dependencies import PipelineDependencies, Url2BlogLLM


JsonCall = Callable[..., tuple[dict[str, Any], str]]
GroundedCall = Callable[..., tuple[dict[str, Any], str, list[str]]]


def _empty_grounded(
    *_args: Any, **_kwargs: Any
) -> tuple[dict[str, Any], str, list[str]]:
    return {"context_points": [], "usage_note": ""}, "{}", []


@dataclass(frozen=True)
class FakeUrl2BlogLLM:
    json_call: JsonCall
    grounded_call: GroundedCall = _empty_grounded

    def invoke_json(self, **kwargs: Any) -> tuple[dict[str, Any], str]:
        return self.json_call(**kwargs)

    def invoke_json_best_effort(
        self, **kwargs: Any
    ) -> tuple[dict[str, Any] | None, str, str | None]:
        try:
            parsed, raw = self.json_call(**kwargs)
            return parsed, raw, None
        except Exception as exc:  # noqa: BLE001
            return None, "", str(exc)

    def invoke_json_tracked(self, **kwargs: Any) -> tuple[dict[str, Any], str]:
        kwargs.pop("stage_name", None)
        kwargs.pop("parse_metrics", None)
        return self.json_call(**kwargs)

    def invoke_grounded_json(
        self, *args: Any, **kwargs: Any
    ) -> tuple[dict[str, Any], str, list[str]]:
        return self.grounded_call(*args, **kwargs)

    def invoke_markdown(self, **kwargs: Any) -> dict[str, Any]:
        legacy_prompt = kwargs.get("legacy_json_prompt") or kwargs["prompt"]
        parsed, raw = self.json_call(
            prompt=legacy_prompt,
            max_tokens=kwargs["max_tokens"],
            temperature=kwargs["temperature"],
            model_name=kwargs["model_name"],
        )
        content_key = kwargs.get("legacy_content_key") or "improved_content"
        title_key = kwargs.get("legacy_title_key")
        content = str(parsed.get(content_key) or kwargs.get("fallback_content") or "")
        return {
            "content": content,
            "raw_response": raw,
            "transport": "json_fallback",
            "fallback_title": str(parsed.get(title_key) or "") if title_key else "",
        }

    def invoke_title(self, **kwargs: Any) -> tuple[str, str]:
        return str(kwargs["fallback_title"]), ""

    def invoke_text(self, **_kwargs: Any) -> str:
        return ""


def build_pipeline_dependencies(
    *,
    json_call: JsonCall,
    extract_article: Callable[[Any], Awaitable[JSONResponse]],
    classify_article_type: Callable[[Any], Awaitable[JSONResponse]],
    get_article_type: Callable[[int], dict[str, Any] | None],
    grounded_call: GroundedCall = _empty_grounded,
) -> PipelineDependencies:
    llm: Url2BlogLLM = FakeUrl2BlogLLM(
        json_call=json_call,
        grounded_call=grounded_call,
    )

    async def extract(request: Any, _llm: Url2BlogLLM) -> JSONResponse:
        return await extract_article(request)

    async def classify(request: Any, _llm: Url2BlogLLM) -> JSONResponse:
        return await classify_article_type(request)

    return PipelineDependencies(
        llm=llm,
        extract_article=extract,
        classify_article_type=classify,
        get_article_type=get_article_type,
    )
