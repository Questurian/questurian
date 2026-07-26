"""Anthropic client creation and response parsing."""

import os
from typing import Any


def _get_anthropic_client(*, model_name: str) -> Any:
    api_key = os.getenv('ANTHROPIC_API_KEY', '').strip()
    if not api_key:
        raise RuntimeError(
            f"ANTHROPIC_API_KEY is not set; cannot invoke Anthropic model '{model_name}'."
        )
    try:
        import anthropic
    except ImportError as exc:
        raise RuntimeError(
            'anthropic SDK is not installed. Run `pip install -r requirements.txt`.'
        ) from exc
    return anthropic.Anthropic(api_key=api_key)


def _message_text(message: Any) -> str:
    text_parts = [
        block.text
        for block in getattr(message, 'content', []) or []
        if getattr(block, 'type', None) == 'text'
        and isinstance(getattr(block, 'text', None), str)
    ]
    return '\n'.join(text_parts).strip()


def _empty_message_error(message: Any) -> RuntimeError:
    usage = getattr(message, 'usage', None)
    output_tokens = getattr(usage, 'output_tokens', None)
    block_types = [
        str(getattr(block, 'type', type(block).__name__))
        for block in getattr(message, 'content', []) or []
    ]
    return RuntimeError(
        f'Anthropic returned no text (stop_reason={getattr(message, 'stop_reason', None)!r}, output_tokens={output_tokens!r}, content_types={block_types!r})'
    )
