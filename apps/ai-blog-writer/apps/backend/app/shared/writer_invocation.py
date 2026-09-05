"""Shared writer-model invocation adapter.

Free-text calls go through ``utils.get_vertex_llm``. That shared factory routes
``claude-*`` model names to Anthropic and Gemini names to Vertex. Forced-tool
calls also live in utils; this module normalizes the result shapes and errors
used by backend features.

``WRITER_PROVIDER=claude-cli`` diverts both call shapes to the Claude Code CLI
instead, answering on the machine's subscription login. It is a *third* backend
alongside Vertex and the Anthropic API, not a replacement for either: unset --
the default -- leaves every existing path byte-identical. See
``app.features.claude_connection.cli_writer`` for the transport and why it is
the CLI rather than the Agent SDK.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class WriterResult:
    text: str
    model_name: str
    # Only the CLI transport reports these; the Vertex and Anthropic paths do
    # not surface a per-call price. Optional and trailing so every existing
    # construction site, real and faked in tests, keeps working untouched.
    cost_usd: Optional[float] = None
    usage: Optional[dict] = None


@dataclass(frozen=True)
class StructuredWriterResult:
    payload: dict
    model_name: str
    cost_usd: Optional[float] = None
    usage: Optional[dict] = None


class WriterModelError(RuntimeError):
    pass


def invoke_anthropic_structured(
    *,
    prompt: str,
    model_name: str,
    tool_name: str,
    tool_description: str,
    input_schema: dict,
    max_tokens: int = 4096,
) -> StructuredWriterResult:
    """Call the writer with a forced tool so the response is schema-shaped JSON.

    Dispatches on ``model_name``: Anthropic when Claude is switched on, the
    Gemini equivalent otherwise. The name is kept for call-site compatibility.

    ``WRITER_PROVIDER=claude-cli`` takes precedence over both. ``tool_name`` and
    ``tool_description`` have no counterpart on the CLI, whose ``--json-schema``
    forces the shape without naming a tool; they are folded into the prompt so
    the instruction a caller wrote is not silently dropped. ``max_tokens`` has
    no CLI equivalent at all -- there is no flag for it -- so on that provider
    the cap is whatever the model's default is. ``--max-budget-usd`` is the
    nearest rail and is not wired up here.
    """
    if _claude_cli_writer_enabled():
        return _invoke_structured_via_cli(
            prompt=prompt,
            model_name=model_name,
            tool_name=tool_name,
            tool_description=tool_description,
            input_schema=input_schema,
        )

    try:
        from utils import invoke_structured_tool  # type: ignore
    except ImportError as exc:
        raise WriterModelError("LLM helper unavailable") from exc

    try:
        payload, resolved_model = invoke_structured_tool(
            prompt=prompt,
            model_name=model_name,
            tool_name=tool_name,
            tool_description=tool_description,
            input_schema=input_schema,
            max_tokens=max_tokens,
        )
    except Exception as exc:  # noqa: BLE001
        raise WriterModelError(f"Structured writer call failed: {exc}") from exc

    return StructuredWriterResult(payload=payload, model_name=resolved_model)


def invoke_writer_model(
    *,
    prompt: str,
    model_name: str,
    max_tokens: int = 16384,
    temperature: float = 0.15,
) -> WriterResult:
    """Invoke the shared LLM factory and normalize output for writer callers.

    ``WRITER_PROVIDER=claude-cli`` diverts the call to the subscription CLI.
    ``temperature`` and ``max_tokens`` have no CLI equivalent and are dropped
    there rather than faked.
    """
    if _claude_cli_writer_enabled():
        return _invoke_text_via_cli(prompt=prompt, model_name=model_name)

    try:
        from utils import get_vertex_llm  # type: ignore
    except ImportError as exc:
        raise WriterModelError("LLM helper unavailable") from exc

    try:
        llm = get_vertex_llm(
            temperature=temperature,
            max_tokens=max_tokens,
            model_name=model_name,
        )
        raw = llm.invoke(prompt)
    except Exception as exc:  # noqa: BLE001
        raise WriterModelError(f"Writer model call failed: {exc}") from exc

    text = (raw if isinstance(raw, str) else str(raw)).strip()
    if not text:
        raise WriterModelError("Writer model returned empty content")

    resolved_model = getattr(llm, "model_name", None) or model_name
    # Ask the object that just answered. The Vertex wrapper keeps the counts
    # LangChain's `invoke` throws away, so this is no longer always None on
    # the Gemini path -- which is what left every writer call reporting a
    # duration and no tokens.
    return WriterResult(
        text=text,
        model_name=resolved_model,
        usage=getattr(llm, "last_usage_metadata", None),
        cost_usd=getattr(llm, "last_cost_usd", None),
    )


def _cli_writer():
    """Imported lazily so the default path never touches the CLI module."""
    try:
        from app.features.claude_connection import cli_writer
    except ImportError as exc:  # pragma: no cover - packaging failure
        raise WriterModelError("Claude CLI writer unavailable") from exc
    return cli_writer


def _claude_cli_writer_enabled() -> bool:
    try:
        return _cli_writer().claude_cli_writer_enabled()
    except WriterModelError:
        return False


def _invoke_text_via_cli(*, prompt: str, model_name: str) -> WriterResult:
    cli_writer = _cli_writer()
    try:
        result = cli_writer.invoke_text(prompt=prompt, model_name=model_name)
    except cli_writer.ClaudeCliWriterError as exc:
        raise WriterModelError(f"Writer model call failed: {exc}") from exc
    return WriterResult(
        text=result["text"],
        model_name=result["modelName"],
        cost_usd=result["costUsd"],
        usage=result["usage"],
    )


def _invoke_structured_via_cli(
    *,
    prompt: str,
    model_name: str,
    tool_name: str,
    tool_description: str,
    input_schema: dict,
) -> StructuredWriterResult:
    cli_writer = _cli_writer()
    framed = cli_writer.frame_schema_prompt(
        prompt,
        tool_name=tool_name,
        tool_description=tool_description,
    )
    try:
        result = cli_writer.invoke_structured(
            prompt=framed,
            input_schema=input_schema,
            model_name=model_name,
        )
    except cli_writer.ClaudeCliWriterError as exc:
        raise WriterModelError(f"Structured writer call failed: {exc}") from exc
    return StructuredWriterResult(
        payload=result["payload"],
        model_name=result["modelName"],
        cost_usd=result["costUsd"],
        usage=result["usage"],
    )
