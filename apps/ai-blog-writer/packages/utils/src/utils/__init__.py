from __future__ import annotations

from .csv_loader import parse_csv
from .json_parser import (
    parse_json_response,
    extract_json_field,
    validate_json_structure,
)


def get_vertex_llm(*args, **kwargs):
    from .llm_client import get_vertex_llm as _get_vertex_llm

    return _get_vertex_llm(*args, **kwargs)


def invoke_anthropic_structured_tool(*args, **kwargs):
    from .llm_client import (
        invoke_anthropic_structured_tool as _invoke_anthropic_structured_tool,
    )

    return _invoke_anthropic_structured_tool(*args, **kwargs)


def invoke_structured_tool(*args, **kwargs):
    from .llm_client import invoke_structured_tool as _invoke_structured_tool

    return _invoke_structured_tool(*args, **kwargs)


def get_vertex_generative_model(*args, **kwargs):
    from .llm_client import get_vertex_generative_model as _get_vertex_generative_model

    return _get_vertex_generative_model(*args, **kwargs)


def vertex_part_from_data(*args, **kwargs):
    from .llm_client import vertex_part_from_data as _vertex_part_from_data

    return _vertex_part_from_data(*args, **kwargs)


def invoke_vertex_multimodal_text(*args, **kwargs):
    from .llm_client import (
        invoke_vertex_multimodal_text as _invoke_vertex_multimodal_text,
    )

    return _invoke_vertex_multimodal_text(*args, **kwargs)


def invoke_google_grounded_text(*args, **kwargs):
    from .google_grounding import invoke_google_grounded_text as _invoke

    return _invoke(*args, **kwargs)


def __getattr__(name: str):
    if name == "GroundedGenerationResult":
        from .google_grounding import GroundedGenerationResult

        return GroundedGenerationResult
    raise AttributeError(name)


__all__ = [
    "parse_csv",
    # LLM utilities
    "get_vertex_llm",
    "invoke_anthropic_structured_tool",
    "invoke_structured_tool",
    "get_vertex_generative_model",
    "vertex_part_from_data",
    "invoke_vertex_multimodal_text",
    "GroundedGenerationResult",
    "invoke_google_grounded_text",
    # JSON parsing utilities
    "parse_json_response",
    "extract_json_field",
    "validate_json_structure",
]
