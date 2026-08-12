import httpx
import pytest

from app.core import staff_auth
from fastapi import HTTPException


@pytest.fixture(autouse=True)
def _clear_flag(monkeypatch):
    monkeypatch.delenv(staff_auth.STAFF_AUTH_FLAG, raising=False)
    monkeypatch.setenv("PAYLOAD_API_URL", "http://payload.test")


def test_disabled_by_default():
    assert staff_auth.staff_auth_required() is False


@pytest.mark.parametrize("value", ["1", "true", "TRUE", "yes", "on"])
def test_flag_accepts_truthy_spellings(monkeypatch, value):
    monkeypatch.setenv(staff_auth.STAFF_AUTH_FLAG, value)
    assert staff_auth.staff_auth_required() is True


@pytest.mark.parametrize("value", ["0", "false", "no", "off", "", "  "])
def test_flag_rejects_other_values(monkeypatch, value):
    monkeypatch.setenv(staff_auth.STAFF_AUTH_FLAG, value)
    assert staff_auth.staff_auth_required() is False


@pytest.mark.parametrize(
    "header,expected",
    [
        ("Bearer abc", "abc"),
        ("bearer abc", "abc"),
        ("Bearer   abc  ", "abc"),
        ("JWT abc", None),
        ("Bearer", None),
        ("Bearer ", None),
        ("", None),
        (None, None),
    ],
)
def test_extract_bearer_token(header, expected):
    assert staff_auth.extract_bearer_token(header) == expected


@pytest.mark.asyncio
async def test_passes_through_when_flag_is_off():
    """With the flag off nothing is checked, so existing deployments and local
    development are untouched."""
    assert await staff_auth.require_staff(authorization=None) is None


@pytest.mark.asyncio
async def test_rejects_missing_token_when_enabled(monkeypatch):
    monkeypatch.setenv(staff_auth.STAFF_AUTH_FLAG, "true")

    with pytest.raises(HTTPException) as excinfo:
        await staff_auth.require_staff(authorization=None)

    assert excinfo.value.status_code == 401


@pytest.mark.asyncio
async def test_rejects_non_bearer_scheme_when_enabled(monkeypatch):
    monkeypatch.setenv(staff_auth.STAFF_AUTH_FLAG, "true")

    with pytest.raises(HTTPException) as excinfo:
        await staff_auth.require_staff(authorization="JWT abc")

    assert excinfo.value.status_code == 401


@pytest.mark.asyncio
async def test_refuses_when_enabled_but_payload_url_missing(monkeypatch):
    """Enforcement demanded but impossible must refuse, never silently serve."""
    monkeypatch.setenv(staff_auth.STAFF_AUTH_FLAG, "true")
    monkeypatch.delenv("PAYLOAD_API_URL", raising=False)

    with pytest.raises(HTTPException) as excinfo:
        await staff_auth.require_staff(authorization="Bearer abc")

    assert excinfo.value.status_code == 503


@pytest.mark.asyncio
async def test_accepts_a_session_payload_recognizes(monkeypatch):
    monkeypatch.setenv(staff_auth.STAFF_AUTH_FLAG, "true")

    async def fake_user(token, url):
        assert token == "abc"
        return {"id": 7, "email": "staff@example.com"}

    monkeypatch.setattr(staff_auth, "fetch_payload_user", fake_user)

    user = await staff_auth.require_staff(authorization="Bearer abc")

    assert user["email"] == "staff@example.com"


@pytest.mark.asyncio
async def test_rejects_a_session_payload_does_not_recognize(monkeypatch):
    monkeypatch.setenv(staff_auth.STAFF_AUTH_FLAG, "true")

    async def fake_user(token, url):
        return None

    monkeypatch.setattr(staff_auth, "fetch_payload_user", fake_user)

    with pytest.raises(HTTPException) as excinfo:
        await staff_auth.require_staff(authorization="Bearer abc")

    assert excinfo.value.status_code == 401


@pytest.mark.asyncio
async def test_fetch_payload_user_returns_user_on_200(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == "JWT abc"
        assert request.url.path == "/api/users/me"
        return httpx.Response(200, json={"user": {"id": 1}})

    _stub_transport(monkeypatch, handler)

    user = await staff_auth.fetch_payload_user("abc", "http://payload.test/")

    assert user == {"id": 1}


@pytest.mark.asyncio
async def test_fetch_payload_user_returns_none_for_null_user(monkeypatch):
    """Payload answers 200 with `user: null` for an unauthenticated request,
    so status alone is not proof of a valid session."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"user": None})

    _stub_transport(monkeypatch, handler)

    assert await staff_auth.fetch_payload_user("abc", "http://payload.test") is None


@pytest.mark.asyncio
async def test_fetch_payload_user_returns_none_on_401(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"errors": []})

    _stub_transport(monkeypatch, handler)

    assert await staff_auth.fetch_payload_user("abc", "http://payload.test") is None


@pytest.mark.asyncio
async def test_fetch_payload_user_raises_503_when_payload_unreachable(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    _stub_transport(monkeypatch, handler)

    with pytest.raises(HTTPException) as excinfo:
        await staff_auth.fetch_payload_user("abc", "http://payload.test")

    assert excinfo.value.status_code == 503


@pytest.mark.asyncio
async def test_guarded_route_rejects_anonymous_requests_when_enabled(monkeypatch):
    """End-to-end through the real app: a destructive route must 401 rather
    than delete anything."""
    monkeypatch.setenv(staff_auth.STAFF_AUTH_FLAG, "true")

    async with _app_client() as client:
        response = await client.post("/youtube2blog/clear")

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_guarded_route_is_open_when_flag_is_off(monkeypatch):
    """The default must not change existing behavior."""
    monkeypatch.delenv(staff_auth.STAFF_AUTH_FLAG, raising=False)

    async with _app_client() as client:
        response = await client.post("/youtube2blog/clear")

    assert response.status_code != 401


@pytest.mark.asyncio
async def test_unguarded_route_stays_open_when_enabled(monkeypatch):
    """Only the curated routes are guarded; read paths the UI polls must not
    start failing."""
    monkeypatch.setenv(staff_auth.STAFF_AUTH_FLAG, "true")

    async with _app_client() as client:
        response = await client.get("/health")

    assert response.status_code == 200


def _app_client() -> httpx.AsyncClient:
    import app.main as main_module

    transport = httpx.ASGITransport(app=main_module.app, raise_app_exceptions=False)
    return httpx.AsyncClient(transport=transport, base_url="http://testserver")


def _stub_transport(monkeypatch, handler) -> None:
    """Route httpx through a mock transport instead of the network."""
    real_client = httpx.AsyncClient

    def build(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return real_client(*args, **kwargs)

    monkeypatch.setattr(staff_auth.httpx, "AsyncClient", build)
