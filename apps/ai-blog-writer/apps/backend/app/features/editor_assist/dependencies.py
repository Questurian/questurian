"""Explicit adapters for Editor Assist operations."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Protocol, TypeVar

from app.shared.writer_invocation import (
    StructuredWriterResult,
    WriterResult,
    invoke_anthropic_structured,
    invoke_writer_model,
)

from .graph import run_editor_assist_graph

T = TypeVar("T")


class WriterInvoker(Protocol):
    def __call__(
        self,
        *,
        prompt: str,
        model_name: str,
        max_tokens: int,
        temperature: float,
    ) -> WriterResult: ...


class StructuredWriterInvoker(Protocol):
    def __call__(
        self,
        *,
        prompt: str,
        model_name: str,
        tool_name: str,
        tool_description: str,
        input_schema: dict[str, Any],
        max_tokens: int,
    ) -> StructuredWriterResult: ...


class GraphRunner(Protocol):
    def __call__(
        self,
        *,
        node_name: str,
        step_runner: Callable[[], T],
    ) -> T: ...


@dataclass(frozen=True)
class EditorAssistDependencies:
    invoke_writer: WriterInvoker = invoke_writer_model
    invoke_structured_writer: StructuredWriterInvoker = invoke_anthropic_structured
    run_graph: GraphRunner = run_editor_assist_graph


def get_editor_assist_dependencies() -> EditorAssistDependencies:
    return EditorAssistDependencies()
