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

import app.features.youtube2blog.routes as youtube2blog_routes
from app.features.youtube2blog.api import testing as youtube2blog_testing
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


@pytest.mark.asyncio
async def test_youtube_test_stage1_runtime_error_returns_502_with_cors(monkeypatch):
    app = _build_cors_client(router=youtube2blog_routes.router)

    def _raise_runtime(_record):
        raise RuntimeError("boom")

    monkeypatch.setattr(
        youtube2blog_testing,
        "stage_1_clean_transcript",
        _raise_runtime,
    )

    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as client:
        response = await client.post(
            "/youtube2blog/test-stage1",
            headers={"Origin": "http://localhost:3003"},
        )

    assert response.status_code == 502
    assert response.json()["detail"] == "YouTube2Blog stage 1 test failed"
    assert response.headers.get("access-control-allow-origin")


@pytest.mark.asyncio
async def test_youtube_test_pipeline_runtime_error_returns_502_with_cors(monkeypatch):
    app = _build_cors_client(router=youtube2blog_routes.router)

    def _raise_runtime(_record):
        raise RuntimeError("boom")

    monkeypatch.setattr(
        youtube2blog_testing,
        "stage_1_clean_transcript",
        _raise_runtime,
    )

    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as client:
        response = await client.post(
            "/youtube2blog/test",
            headers={"Origin": "http://localhost:3003"},
        )

    assert response.status_code == 502
    assert response.json()["detail"] == "YouTube2Blog pipeline test failed"
    assert response.headers.get("access-control-allow-origin")
