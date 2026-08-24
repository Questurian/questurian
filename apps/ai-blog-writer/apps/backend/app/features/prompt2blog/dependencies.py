from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Protocol

from app.core import get_article_type_by_id
from app.shared.text import normalize_dashes
from app.shared.writer_models import resolve_writer_model

from . import llm
from .input import _build_writing_brief_from_input
from .options import _read_article_type_markdown
from .options import _resolve_input_options
from .pricing import Prompt2BlogTokenUsageTracker
from .run_recorder import RunRecorder


class Prompt2BlogLLM(Protocol):
    def invoke_text(
        self,
        *,
        prompt: str,
        max_tokens: int,
        temperature: float,
        model_name: str | None,
    ) -> str: ...

    def invoke_json(
        self,
        *,
        prompt: str,
        max_tokens: int,
        temperature: float,
        model_name: str | None,
    ) -> tuple[dict[str, Any], str]: ...

    def enforce_anti_ai(
        self,
        text: str,
        *,
        model_name: str | None,
        max_tokens: int,
        context: str,
    ) -> str: ...


@dataclass(frozen=True)
class DefaultPrompt2BlogLLM:
    usage_tracker: Prompt2BlogTokenUsageTracker = field(
        default_factory=Prompt2BlogTokenUsageTracker,
        compare=False,
        repr=False,
    )

    def invoke_text(self, **kwargs: Any) -> str:
        return llm._invoke_text_llm(
            **kwargs,
            usage_recorder=self.usage_tracker.record,
        )

    def invoke_json(self, **kwargs: Any) -> tuple[dict[str, Any], str]:
        return llm._invoke_json_llm(
            **kwargs,
            usage_recorder=self.usage_tracker.record,
        )

    def enforce_anti_ai(self, text: str, **kwargs: Any) -> str:
        return llm._enforce_anti_ai_markdown_with_model(
            text,
            **kwargs,
            usage_recorder=self.usage_tracker.record,
        )

    def usage_summary(self, **kwargs: Any) -> dict[str, Any]:
        return self.usage_tracker.summary(**kwargs)


@dataclass(frozen=True)
class PipelineDependencies:
    llm: Prompt2BlogLLM = field(default_factory=DefaultPrompt2BlogLLM)
    recorder: RunRecorder = field(default_factory=RunRecorder)
    get_article_type: Callable[[int], dict[str, Any] | None] = get_article_type_by_id
    read_article_type_markdown: Callable[..., tuple[str, str | None]] = (
        _read_article_type_markdown
    )
    resolve_input_options: Callable[..., dict[str, Any]] = _resolve_input_options
    build_writing_brief: Callable[..., dict[str, Any]] = _build_writing_brief_from_input
    resolve_writer_model: Callable[..., str] = resolve_writer_model
    normalize_dashes: Callable[[str], str] = normalize_dashes
