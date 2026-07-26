"""Focused test doubles shared by Payload client upload tests."""

import json
from collections.abc import Callable
from typing import Any

import pytest

from app.features.images.image_processor import ImageVariantType, ProcessedVariant


def processed_variant(variant_type: ImageVariantType) -> ProcessedVariant:
    dimensions = {
        ImageVariantType.THUMBNAIL: (1200, 800),
        ImageVariantType.SQUARE: (1080, 1080),
        ImageVariantType.WIDE: (1920, 1080),
        ImageVariantType.PORTRAIT: (1200, 1500),
        ImageVariantType.HERO: (2100, 900),
        ImageVariantType.OPEN_GRAPH: (1200, 630),
        ImageVariantType.EDITORIAL: (1600, 1200),
    }
    width, height = dimensions[variant_type]
    return ProcessedVariant(
        variant_type=variant_type,
        buffer=b"test-image-bytes",
        filename=f"sample_{variant_type.value}.webp",
        width=width,
        height=height,
        content_type="image/webp",
        file_size=16,
    )


def install_stub_async_client(
    monkeypatch: pytest.MonkeyPatch,
    *,
    status_code: int,
    response_text: str,
    on_post: Callable[[], None] | None = None,
) -> None:
    class StubResponse:
        text = response_text

        def __init__(self) -> None:
            self.status_code = status_code

        def json(self) -> dict[str, Any]:
            return json.loads(self.text)

    class StubAsyncClient:
        def __init__(self, *_args: Any, **_kwargs: Any) -> None:
            pass

        async def __aenter__(self) -> "StubAsyncClient":
            return self

        async def __aexit__(
            self,
            _exc_type: object,
            _exc: object,
            _tb: object,
        ) -> bool:
            return False

        async def post(self, *_args: Any, **_kwargs: Any) -> StubResponse:
            if on_post:
                on_post()
            return StubResponse()

    monkeypatch.setattr(
        "app.features.images.payload_client.httpx.AsyncClient",
        StubAsyncClient,
    )
