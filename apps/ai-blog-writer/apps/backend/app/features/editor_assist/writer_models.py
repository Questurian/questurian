"""Writer-model adapter for Editor Assist and itinerary prose calls.

Free-text calls go through ``utils.get_vertex_llm``. That shared factory routes
``claude-*`` model names to Anthropic and Gemini names to Vertex. Forced-tool
Anthropic calls also live in utils; this module only wraps feature-specific
result shapes and errors.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class WriterResult:
    text: str
    model_name: str


@dataclass(frozen=True)
class StructuredWriterResult:
    payload: dict
    model_name: str


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
    """
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
    """Invoke the shared LLM factory and normalize output for writer callers."""
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
    return WriterResult(text=text, model_name=resolved_model)
