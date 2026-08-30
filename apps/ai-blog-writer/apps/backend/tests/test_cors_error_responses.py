import sys
import types
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import pytest
import httpx

from utils import parse_json_response as _canonical_parse_json_response


# Keep route-module imports light for the full backend suite while preserving
# the canonical JSON parser used by url2blog parser tests.
utils_stub = types.ModuleType("utils")
utils_stub.__path__ = [
    str(Path(__file__).resolve().parents[3] / "packages" / "utils" / "src" / "utils")
]


class _StubPresetLLM:
    model_name = "stub-model"

    def invoke(self, _prompt: str) -> str:
        return "{}"


utils_stub.get_vertex_llm = lambda *args, **kwargs: _StubPresetLLM()
utils_stub.parse_json_response = _canonical_parse_json_response
utils_stub.invoke_google_grounded_text = lambda *args, **kwargs: None
utils_stub.invoke_anthropic_structured_tool = lambda *args, **kwargs: ({}, "stub-model")
utils_stub.get_vertex_generative_model = lambda *args, **kwargs: None
utils_stub.vertex_part_from_data = lambda **kwargs: kwargs
utils_stub.invoke_vertex_multimodal_text = lambda *args, **kwargs: "stub text"
sys.modules["utils"] = utils_stub

import app.main as main_module


def _build_cors_client(*, router) -> FastAPI:
    app = FastAPI()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router)
    return app


def _ensure_global_boom_route() -> str:
    path = "/__test__/global-error-boom"
    existing_paths = {
        getattr(route, "path", "") for route in main_module.app.router.routes
    }
    if path in existing_paths:
        return path

    @main_module.app.get(path)
    async def _boom() -> dict[str, str]:
        raise RuntimeError("boom-test")

    return path


@pytest.mark.asyncio
async def test_global_unhandled_exception_returns_json_with_cors(monkeypatch):
    monkeypatch.setenv("API_EXPOSE_ERROR_DETAILS", "false")
    path = _ensure_global_boom_route()

    transport = httpx.ASGITransport(app=main_module.app, raise_app_exceptions=False)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as client:
        response = await client.get(path, headers={"Origin": "http://localhost:3003"})

    assert response.status_code == 500
    payload = response.json()
    assert payload["detail"] == "Internal server error"
    assert isinstance(payload.get("error_id"), str)
    assert payload["error_id"]
    assert response.headers.get("access-control-allow-origin")


@pytest.mark.asyncio
async def test_global_unhandled_exception_can_expose_details_in_debug(monkeypatch):
    monkeypatch.setenv("API_EXPOSE_ERROR_DETAILS", "true")
    path = _ensure_global_boom_route()

    transport = httpx.ASGITransport(app=main_module.app, raise_app_exceptions=False)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as client:
        response = await client.get(path, headers={"Origin": "http://localhost:3003"})

    assert response.status_code == 500
    payload = response.json()
    assert "boom-test" in payload["detail"]
    assert isinstance(payload.get("error_id"), str)
    assert payload["error_id"]
    assert response.headers.get("access-control-allow-origin")

