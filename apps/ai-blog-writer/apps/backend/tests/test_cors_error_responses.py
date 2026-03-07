import sys
import types

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import pytest
import httpx

# Avoid importing heavyweight external LLM clients during route-module import.
utils_stub = types.ModuleType("utils")


class _StubPresetLLM:
    def invoke(self, _prompt: str) -> str:
        return "{}"


class _StubLLMPresets:
    @staticmethod
    def transcript_cleaning() -> _StubPresetLLM:
        return _StubPresetLLM()

    @staticmethod
    def classification() -> _StubPresetLLM:
        return _StubPresetLLM()

    @staticmethod
    def article_composition() -> _StubPresetLLM:
        return _StubPresetLLM()

    @staticmethod
    def title_generation() -> _StubPresetLLM:
        return _StubPresetLLM()


utils_stub.get_vertex_llm = lambda *args, **kwargs: _StubPresetLLM()
utils_stub.parse_json_response = lambda *_args, **_kwargs: {}
utils_stub.LLMPresets = _StubLLMPresets
sys.modules["utils"] = utils_stub

import app.features.review2blog.routes as review2blog_routes
import app.features.youtube2blog.routes as youtube2blog_routes
import app.main as main_module


class _RaisingLLM:
    def invoke(self, _prompt: str) -> str:
        raise RuntimeError("llm boom")


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
        getattr(route, "path", "")
        for route in main_module.app.router.routes
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
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
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
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get(path, headers={"Origin": "http://localhost:3003"})

    assert response.status_code == 500
    payload = response.json()
    assert "boom-test" in payload["detail"]
    assert isinstance(payload.get("error_id"), str)
    assert payload["error_id"]
    assert response.headers.get("access-control-allow-origin")


def test_review2blog_invalid_max_tokens_env_falls_back(monkeypatch):
    monkeypatch.setenv("REVIEW2BLOG_MAX_TOKENS", "not-a-number")
    assert (
        review2blog_routes._resolve_max_tokens(None)
        == review2blog_routes.DEFAULT_REVIEW2BLOG_MAX_TOKENS
    )

@pytest.mark.asyncio
async def test_review2blog_upload_runtime_error_returns_502_with_cors(monkeypatch):
    app = _build_cors_client(router=review2blog_routes.router)
    monkeypatch.setattr(
        review2blog_routes,
        "get_vertex_llm",
        lambda **_kwargs: _RaisingLLM(),
    )

    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/review2blog/upload",
            files={
                "file": (
                    "reviews.json",
                    b'{"reviews":[{"text":"great","rating":5,"date":"2025-01-01"}]}',
                    "application/json",
                )
            },
            headers={"Origin": "http://localhost:3003"},
        )

    assert response.status_code == 502
    assert response.json()["detail"] == "Review2Blog phase 1 request failed"
    assert response.headers.get("access-control-allow-origin")


@pytest.mark.asyncio
async def test_review2blog_phase2_runtime_error_returns_502_with_cors(monkeypatch):
    app = _build_cors_client(router=review2blog_routes.router)
    monkeypatch.setattr(
        review2blog_routes,
        "get_vertex_llm",
        lambda **_kwargs: _RaisingLLM(),
    )

    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/review2blog/phase2",
            json=[{"d": "2025-01-01", "r": 5, "s": 1}],
            headers={"Origin": "http://localhost:3003"},
        )

    assert response.status_code == 502
    assert response.json()["detail"] == "Review2Blog phase 2 request failed"
    assert response.headers.get("access-control-allow-origin")


@pytest.mark.asyncio
async def test_review2blog_phase3_runtime_error_returns_502_with_cors(monkeypatch):
    app = _build_cors_client(router=review2blog_routes.router)
    monkeypatch.setattr(
        review2blog_routes,
        "get_vertex_llm",
        lambda **_kwargs: _RaisingLLM(),
    )

    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/review2blog/phase3",
            json={
                "aggregated_profile": {"review_count": 1},
                "restaurant_context": {"name": "Test Spot"},
                "listicle": {
                    "listicle_type": "Date Night",
                    "listicle_title": "Top Date Spots",
                    "listicle_goal": "Romantic dining picks",
                },
            },
            headers={"Origin": "http://localhost:3003"},
        )

    assert response.status_code == 502
    assert response.json()["detail"] == "Review2Blog phase 3 request failed"
    assert response.headers.get("access-control-allow-origin")


@pytest.mark.asyncio
async def test_youtube_test_stage1_runtime_error_returns_502_with_cors(monkeypatch):
    app = _build_cors_client(router=youtube2blog_routes.router)

    def _raise_runtime(_record):
        raise RuntimeError("boom")

    monkeypatch.setattr(
        youtube2blog_routes,
        "stage_1_clean_transcript",
        _raise_runtime,
    )

    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
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
        youtube2blog_routes,
        "stage_1_clean_transcript",
        _raise_runtime,
    )

    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/youtube2blog/test",
            headers={"Origin": "http://localhost:3003"},
        )

    assert response.status_code == 502
    assert response.json()["detail"] == "YouTube2Blog pipeline test failed"
    assert response.headers.get("access-control-allow-origin")
