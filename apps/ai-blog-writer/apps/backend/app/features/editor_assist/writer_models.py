"""Provider-router for the listicle Writer call.

Routes by model name:
  - Names starting with "claude" → Anthropic Messages API (premier writer).
  - Everything else → Vertex AI (LangChain VertexAI wrapper), non-grounded.

The Fallback Research call is NOT routed here — it stays on Vertex with Google
Search grounding because that is the capability we rely on for fact discovery.
This module is for the writer step only, where the prompt now treats supplied
context as the source of truth and grounding is no longer needed.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class WriterResult:
    text: str
    model_name: str


class WriterModelError(RuntimeError):
    pass


def _is_anthropic_model(model_name: str) -> bool:
    return model_name.lower().startswith("claude")


def _invoke_anthropic_writer(
    *,
    prompt: str,
    model_name: str,
    max_tokens: int,
    temperature: float,
) -> WriterResult:
    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise WriterModelError(
            "ANTHROPIC_API_KEY is not set; cannot route writer to Anthropic. "
            "Set the env var, then retry."
        )

    try:
        import anthropic  # type: ignore
    except ImportError as exc:
        raise WriterModelError(
            "anthropic SDK is not installed. Run `pip install -r requirements.txt`."
        ) from exc

    client = anthropic.Anthropic(api_key=api_key)
    # Newer Claude models (Opus 4.x family) reject the `temperature` parameter;
    # the API returns 400 "temperature is deprecated for this model". Omit it
    # and let Anthropic apply its default.
    _ = temperature
    try:
        message = client.messages.create(
            model=model_name,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as exc:  # noqa: BLE001
        raise WriterModelError(f"Anthropic writer call failed: {exc}") from exc

    # Claude responses come back as a list of content blocks; concatenate text blocks.
    text_parts: list[str] = []
    for block in getattr(message, "content", []) or []:
        block_type = getattr(block, "type", None)
        block_text = getattr(block, "text", None)
        if block_type == "text" and isinstance(block_text, str):
            text_parts.append(block_text)
    text = "\n".join(text_parts).strip()
    if not text:
        raise WriterModelError("Anthropic writer returned empty content")

    resolved_model = getattr(message, "model", None) or model_name
    return WriterResult(text=text, model_name=resolved_model)


def _invoke_vertex_writer(
    *,
    prompt: str,
    model_name: str,
    max_tokens: int,
    temperature: float,
) -> WriterResult:
    try:
        from utils import get_vertex_llm  # type: ignore
    except ImportError as exc:
        raise WriterModelError("Vertex helper unavailable") from exc

    try:
        llm = get_vertex_llm(
            temperature=temperature,
            max_tokens=max_tokens,
            model_name=model_name,
        )
        raw = llm.invoke(prompt)
    except Exception as exc:  # noqa: BLE001
        raise WriterModelError(f"Vertex writer call failed: {exc}") from exc

    text = (raw if isinstance(raw, str) else str(raw)).strip()
    if not text:
        raise WriterModelError("Vertex writer returned empty content")
    return WriterResult(text=text, model_name=model_name)


def invoke_writer_model(
    *,
    prompt: str,
    model_name: str,
    max_tokens: int = 1536,
    temperature: float = 0.15,
) -> WriterResult:
    """Route a writer call to the appropriate provider based on model_name."""
    if _is_anthropic_model(model_name):
        return _invoke_anthropic_writer(
            prompt=prompt,
            model_name=model_name,
            max_tokens=max_tokens,
            temperature=temperature,
        )
    return _invoke_vertex_writer(
        prompt=prompt,
        model_name=model_name,
        max_tokens=max_tokens,
        temperature=temperature,
    )
