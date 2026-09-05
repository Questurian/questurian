"""Explicit adapters for Editor Assist operations."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Protocol, TypeVar

from app.shared.model_calls import structured as _structured_call
from app.shared.model_calls import writer_text as _writer_call
from app.shared.writer_invocation import StructuredWriterResult, WriterResult

from .graph import run_editor_assist_graph

T = TypeVar("T")


class WriterInvoker(Protocol):
    def __call__(
        self,
        *,
        job_id: str,
        prompt: str,
        model_name: str | None,
        max_tokens: int,
        temperature: float,
    ) -> WriterResult: ...


class StructuredWriterInvoker(Protocol):
    def __call__(
        self,
        *,
        job_id: str,
        prompt: str,
        model_name: str | None,
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


def _default_writer(
    *,
    job_id: str,
    prompt: str,
    model_name: str | None = None,
    max_tokens: int = 16384,
    temperature: float = 0.15,
) -> WriterResult:
    """The real writer: the gateway picks the model, the call reports itself.

    ``model_name`` is an operator's explicit choice from a dropdown, not a
    default -- None, the usual case, means the gateway decides. Every route
    here used to compute its own ``model_name or DEFAULT_MODEL``, which is
    exactly the scattered decision this work removes.
    """
    return _writer_call(
        job_id,
        prompt=prompt,
        model=model_name,
        max_tokens=max_tokens,
        temperature=temperature,
        endpoint=job_id.split(".", 1)[-1],
    )


def _default_structured_writer(
    *,
    job_id: str,
    prompt: str,
    model_name: str | None = None,
    tool_name: str,
    tool_description: str,
    input_schema: dict[str, Any],
    max_tokens: int = 4096,
) -> StructuredWriterResult:
    return _structured_call(
        job_id,
        prompt=prompt,
        model=model_name,
        tool_name=tool_name,
        tool_description=tool_description,
        input_schema=input_schema,
        max_tokens=max_tokens,
        endpoint=job_id.split(".", 1)[-1],
    )


@dataclass(frozen=True)
class EditorAssistDependencies:
    invoke_writer: WriterInvoker = _default_writer
    invoke_structured_writer: StructuredWriterInvoker = _default_structured_writer
    run_graph: GraphRunner = run_editor_assist_graph


def get_editor_assist_dependencies() -> EditorAssistDependencies:
    return EditorAssistDependencies()
