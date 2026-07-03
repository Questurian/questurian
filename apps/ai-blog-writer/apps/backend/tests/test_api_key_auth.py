import httpx
import pytest

import app.main as main_module


def _client() -> httpx.AsyncClient:
    transport = httpx.ASGITransport(
        app=main_module.app, raise_app_exceptions=False
    )
    return httpx.AsyncClient(transport=transport, base_url="http://testserver")


@pytest.mark.asyncio
async def test_requests_pass_when_no_api_key_configured(monkeypatch):
    monkeypatch.delenv("ABW_API_KEY", raising=False)

    async with _client() as client:
        response = await client.get("/health")

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_request_without_key_is_rejected(monkeypatch):
    monkeypatch.setenv("ABW_API_KEY", "secret-key")

    async with _client() as client:
        response = await client.get("/article-types")

    assert response.status_code == 401
    assert "X-API-Key" in response.json()["detail"]


@pytest.mark.asyncio
async def test_request_with_wrong_key_is_rejected(monkeypatch):
    monkeypatch.setenv("ABW_API_KEY", "secret-key")

    async with _client() as client:
        response = await client.get(
            "/article-types", headers={"X-API-Key": "wrong-key"}
        )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_request_with_correct_key_passes(monkeypatch):
    monkeypatch.setenv("ABW_API_KEY", "secret-key")

    async with _client() as client:
        response = await client.get(
            "/article-types", headers={"X-API-Key": "secret-key"}
        )

    assert response.status_code != 401


@pytest.mark.asyncio
async def test_health_stays_open_with_key_configured(monkeypatch):
    monkeypatch.setenv("ABW_API_KEY", "secret-key")

    async with _client() as client:
        response = await client.get("/health")

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_preflight_stays_open_with_key_configured(monkeypatch):
    monkeypatch.setenv("ABW_API_KEY", "secret-key")

    async with _client() as client:
        response = await client.options(
            "/article-types",
            headers={
                "Origin": "http://localhost:3003",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "x-api-key",
            },
        )

    assert response.status_code == 200
