"""Gemini chat adapter, schema transformation, and forced tools."""

import logging
from typing import Any, Optional

from langchain_google_vertexai import ChatVertexAI

from .llm_model_policy import (
    GEMINI3_LOCATION,
    _is_gemini3_model,
    _resolve_vertex_location,
    _resolve_vertex_project,
)


logger = logging.getLogger(__name__)

_GEMINI_SCHEMA_KEYS = {
    "type",
    "description",
    "enum",
    "format",
    "nullable",
    "properties",
    "required",
    "items",
}
_GEMINI_BENIGN_DROPPED_KEYS = {
    "$id",
    "$schema",
    "additionalProperties",
    "examples",
    "title",
}


def _gemini_chat_text(content: Any) -> str:
    """Extract plain text from a ChatVertexAI response.

    Gemini 3.x returns content as a list of parts (text parts carry a
    `thought_signature` alongside the text); older models return a str.
    """
    if isinstance(content, str):
        return content.strip()
    text_parts = [
        part.get('text')
        for part in content or []
        if isinstance(part, dict)
        and part.get('type') == 'text'
        and isinstance(part.get('text'), str)
    ]
    return '\n'.join(text_parts).strip()


class Gemini3ChatTextLLM:
    """ChatVertexAI wrapper exposing the same `.invoke(prompt) -> str` surface
    as the LangChain VertexAI completion wrapper.

    Gemini 3.x is unreachable through the legacy completion class: the model
    only exists on the global endpoint and its parts-shaped responses fail the
    completion parser. Temperature is accepted but not forwarded — Google
    recommends leaving Gemini 3 at its default temperature.
    """

    def __init__(self, *, model_name: str, max_tokens: int, project: str) -> None:
        self.model_name = model_name
        self.max_tokens = max_tokens
        self.project = project
        self.last_usage_metadata: dict[str, Any] | None = None

    def invoke(self, prompt: str) -> str:
        llm = ChatVertexAI(
            model_name=self.model_name,
            max_tokens=self.max_tokens,
            project=self.project,
            location=GEMINI3_LOCATION,
        )
        message = llm.invoke(prompt)
        usage_metadata = getattr(message, 'usage_metadata', None)
        response_metadata = getattr(message, 'response_metadata', None)
        if isinstance(usage_metadata, dict):
            self.last_usage_metadata = usage_metadata
        elif isinstance(response_metadata, dict):
            candidate = response_metadata.get('usage_metadata') or response_metadata.get(
                'token_usage'
            )
            self.last_usage_metadata = candidate if isinstance(candidate, dict) else None
        text = _gemini_chat_text(getattr(message, 'content', None))
        if not text:
            raise RuntimeError(
                f"Gemini model '{self.model_name}' returned no text (response_metadata={getattr(message, 'response_metadata', None)!r})"
            )
        return text


def _strip_for_gemini(schema: Any, path: str, dropped: list[str]) -> Any:
    """Drop rejected keywords, recording significant losses into ``dropped``."""
    if isinstance(schema, list):
        return [
            _strip_for_gemini(item, f'{path}[{index}]', dropped)
            for index, item in enumerate(schema)
        ]
    if not isinstance(schema, dict):
        return schema
    cleaned: dict[str, Any] = {}
    for key, value in schema.items():
        if key not in _GEMINI_SCHEMA_KEYS:
            if key not in _GEMINI_BENIGN_DROPPED_KEYS:
                dropped.append(f'{path}.{key}' if path else key)
            continue
        if key == 'properties' and isinstance(value, dict):
            base = f'{path}.properties' if path else 'properties'
            cleaned[key] = {
                prop: _strip_for_gemini(sub, f'{base}.{prop}', dropped)
                for prop, sub in value.items()
            }
        elif key == 'items':
            cleaned[key] = _strip_for_gemini(
                value, f'{path}.items' if path else 'items', dropped
            )
        else:
            cleaned[key] = value
    return cleaned


def _gemini_tool_schema(
    schema: Any,
    *,
    tool_name: str = "",
    logger_override: logging.Logger | None = None,
) -> Any:
    """Recursively drop schema keywords Gemini's tool declarations reject.

    Constraint-bearing keywords have to go as well, but they are logged rather
    than discarded in silence -- an unvalidated payload is the caller's problem
    to handle, and they cannot handle what they never hear about.
    """
    dropped: list[str] = []
    cleaned = _strip_for_gemini(schema, '', dropped)
    if dropped:
        (logger_override or logger).warning(
            'Gemini tool schema%s dropped %d constraint(s) it cannot express: %s. The returned payload is NOT guaranteed to satisfy them -- validate it after the call.',
            f" for '{tool_name}'" if tool_name else '',
            len(dropped),
            ', '.join(sorted(dropped)),
        )
    return cleaned


def _invoke_gemini_structured_tool(
    *,
    prompt: str,
    model_name: str,
    tool_name: str,
    tool_description: str,
    input_schema: dict[str, Any],
    max_tokens: int,
    project: Optional[str] = None,
) -> tuple[dict[str, Any], str]:
    """Gemini equivalent of the Anthropic forced-tool call."""
    resolved_project = _resolve_vertex_project(project)
    location = (
        GEMINI3_LOCATION
        if _is_gemini3_model(model_name)
        else _resolve_vertex_location()
    )
    llm = ChatVertexAI(
        model_name=model_name,
        max_tokens=max_tokens,
        project=resolved_project,
        location=location,
    )
    bound = llm.bind_tools(
        [
            {
                'name': tool_name,
                'description': tool_description,
                'parameters': _gemini_tool_schema(input_schema, tool_name=tool_name),
            }
        ],
        tool_choice=tool_name,
    )
    message = bound.invoke(prompt)
    for call in getattr(message, 'tool_calls', []) or []:
        if call.get('name') == tool_name and isinstance(call.get('args'), dict):
            return (call['args'], model_name)
    raise RuntimeError(
        f"Gemini structured writer returned no '{tool_name}' tool call (response_metadata={getattr(message, 'response_metadata', None)!r})"
    )
