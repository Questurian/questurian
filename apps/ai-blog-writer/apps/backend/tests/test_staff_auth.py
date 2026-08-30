import httpx
import pytest

from app.core import staff_auth
from app.core.staff_token import resolve_staff_token
from fastapi import HTTPException




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


def test_run_owner_survives_later_status_updates(isolated_db):
    from app.core.storage import read_run_owner, write_status

    write_status(
        "owned-run",
        {"state": "running", "stage": "queued", "updated_at": "2026-08-11"},
        feature="prompt2blog",
        owner_staff_id="7",
    )
    write_status(
        "owned-run",
        {"state": "completed", "stage": "complete", "updated_at": "2026-08-12"},
        feature="prompt2blog",
        owner_staff_id="8",
    )

    assert read_run_owner("owned-run") == "7"


def test_later_status_update_cannot_claim_unowned_run(isolated_db):
    from app.core.storage import read_run_owner, write_status

    write_status(
        "legacy-run",
        {"state": "running", "stage": "queued", "updated_at": "2026-08-11"},
        feature="url2blog",
    )
    write_status(
        "legacy-run",
        {"state": "completed", "stage": "complete", "updated_at": "2026-08-12"},
        feature="url2blog",
        owner_staff_id="7",
    )

    assert read_run_owner("legacy-run") is None


@pytest.mark.asyncio
async def test_passes_through_when_flag_is_off():
    """With the flag off nothing is checked, so existing deployments and local
    development are untouched."""
    assert await staff_auth.require_staff(token=None) is None


@pytest.mark.asyncio
async def test_rejects_missing_token_when_enabled(monkeypatch):
    monkeypatch.setenv(staff_auth.STAFF_AUTH_FLAG, "true")

    with pytest.raises(HTTPException) as excinfo:
        await staff_auth.require_staff(token=None)

    assert excinfo.value.status_code == 401


@pytest.mark.asyncio
async def test_rejects_non_bearer_scheme_when_enabled(monkeypatch):
    """A non-Bearer scheme yields no token, and no token is a 401.

    The scheme check itself now lives in `staff_token.resolve_staff_token`;
    this pins that its "no credential" answer still reaches the caller as 401
    rather than being mistaken for the flag being off.
    """
    monkeypatch.setenv(staff_auth.STAFF_AUTH_FLAG, "true")

    token = resolve_staff_token(
        authorization="JWT abc",
        cookie_token=None,
        method="POST",
        origin=None,
        allowed_origins=["https://abw.questurian.com"],
    )

    with pytest.raises(HTTPException) as excinfo:
        await staff_auth.require_staff(token=token)

    assert excinfo.value.status_code == 401


@pytest.mark.asyncio
async def test_falls_back_to_the_shared_payload_url_default(monkeypatch):
    """Resolution must match every other Payload caller, so a deployment that
    relies on the localhost default keeps working here too."""
    monkeypatch.setenv(staff_auth.STAFF_AUTH_FLAG, "true")
    monkeypatch.delenv("PAYLOAD_API_URL", raising=False)
    seen = {}

    async def fake_user(token, url):
        seen["url"] = url
        return {"id": 1}

    monkeypatch.setattr(staff_auth, "fetch_payload_user", fake_user)

    await staff_auth.require_staff(token="abc")

    assert seen["url"] == "http://localhost:4000"


@pytest.mark.asyncio
async def test_uses_the_configured_payload_url_when_set(monkeypatch):
    monkeypatch.setenv(staff_auth.STAFF_AUTH_FLAG, "true")
    monkeypatch.setenv("PAYLOAD_API_URL", "http://payload.internal:4000")
    seen = {}

    async def fake_user(token, url):
        seen["url"] = url
        return {"id": 1}

    monkeypatch.setattr(staff_auth, "fetch_payload_user", fake_user)

    await staff_auth.require_staff(token="abc")

    assert seen["url"] == "http://payload.internal:4000"


@pytest.mark.asyncio
async def test_accepts_a_session_payload_recognizes(monkeypatch):
    monkeypatch.setenv(staff_auth.STAFF_AUTH_FLAG, "true")

    async def fake_user(token, url):
        assert token == "abc"
        return {"id": 7, "email": "staff@example.com"}

    monkeypatch.setattr(staff_auth, "fetch_payload_user", fake_user)

    user = await staff_auth.require_staff(token="abc")

    assert user["email"] == "staff@example.com"


@pytest.mark.asyncio
async def test_editor_guard_rejects_writer():
    with pytest.raises(HTTPException) as excinfo:
        await staff_auth.require_editor(
            staff_user={"id": 7, "email": "writer@example.com", "role": "writer"}
        )

    assert excinfo.value.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["editor", "admin"])
async def test_editor_guard_accepts_editor_and_admin(role):
    user = {"id": 7, "email": f"{role}@example.com", "role": role}

    assert await staff_auth.require_editor(staff_user=user) == user


def test_article_delete_guard_rejects_writer_who_does_not_own_run():
    with pytest.raises(HTTPException) as excinfo:
        staff_auth.authorize_article_deletion(
            staff_user={"id": 7, "role": "writer"},
            owner_staff_id="8",
        )

    assert excinfo.value.status_code == 403


def test_article_delete_guard_rejects_writer_for_unowned_run():
    with pytest.raises(HTTPException) as excinfo:
        staff_auth.authorize_article_deletion(
            staff_user={"id": 7, "role": "writer"},
            owner_staff_id=None,
        )

    assert excinfo.value.status_code == 403


def test_article_delete_guard_accepts_writer_who_owns_run():
    staff_auth.authorize_article_deletion(
        staff_user={"id": 7, "role": "writer"},
        owner_staff_id="7",
    )


@pytest.mark.parametrize("role", ["editor", "admin"])
def test_article_delete_guard_accepts_editor_and_admin_for_other_run(role):
    staff_auth.authorize_article_deletion(
        staff_user={"id": 7, "role": role},
        owner_staff_id="8",
    )


def test_article_delete_guard_is_open_when_flag_is_off():
    staff_auth.authorize_article_deletion(staff_user=None, owner_staff_id=None)


@pytest.mark.asyncio
async def test_rejects_a_session_payload_does_not_recognize(monkeypatch):
    monkeypatch.setenv(staff_auth.STAFF_AUTH_FLAG, "true")

    async def fake_user(token, url):
        return None

    monkeypatch.setattr(staff_auth, "fetch_payload_user", fake_user)

    with pytest.raises(HTTPException) as excinfo:
        await staff_auth.require_staff(token="abc")

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
        response = await client.delete("/staged-drafts?storageKey=test-key")

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_clear_route_rejects_writer_when_enabled(monkeypatch, isolated_db):
    _mock_payload_user(
        monkeypatch,
        {"id": 7, "email": "writer@example.com", "role": "writer"},
    )

    async with _app_client() as client:
        response = await client.delete(
            "/claude/prompt2blog-credential",
            headers={"Authorization": "Bearer writer-token"},
        )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_clear_route_accepts_editor_when_enabled(monkeypatch, isolated_db):
    # Asserted as "not refused by the guard" rather than 200: the only
    # surviving editor-only route reaches the Claude credential system, which
    # is absent on a CI runner and answers 502 there. Authorization is what
    # this test is for, and a 502 means the request already got past it.
    _mock_payload_user(
        monkeypatch,
        {"id": 8, "email": "editor@example.com", "role": "editor"},
    )

    async with _app_client() as client:
        response = await client.delete(
            "/claude/prompt2blog-credential",
            headers={"Authorization": "Bearer editor-token"},
        )

    assert response.status_code not in (401, 403)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "feature,path",
    [
        ("prompt2blog", "/prompt2blog/articles/other-run"),
    ],
)
async def test_article_delete_routes_reject_non_owner_writer(
    monkeypatch, isolated_db, feature, path
):
    from app.core.storage import write_status

    write_status(
        "other-run",
        {"state": "completed", "stage": "complete", "updated_at": "2026-08-11"},
        feature=feature,
        owner_staff_id="8",
    )
    _mock_payload_user(
        monkeypatch,
        {"id": 7, "email": "writer@example.com", "role": "writer"},
    )

    async with _app_client() as client:
        response = await client.delete(
            path,
            headers={"Authorization": "Bearer writer-token"},
        )

    assert response.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "feature,path",
    [
        ("prompt2blog", "/prompt2blog/articles/owned-run"),
    ],
)
async def test_article_delete_routes_accept_owner_writer(
    monkeypatch, isolated_db, feature, path
):
    from app.core.storage import write_status

    write_status(
        "owned-run",
        {"state": "completed", "stage": "complete", "updated_at": "2026-08-11"},
        feature=feature,
        owner_staff_id="7",
    )
    _mock_payload_user(
        monkeypatch,
        {"id": 7, "email": "writer@example.com", "role": "writer"},
    )

    async with _app_client() as client:
        response = await client.delete(
            path,
            headers={"Authorization": "Bearer writer-token"},
        )

    assert response.status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "method,path",
    [
        ("POST", "/itineraries-pipeline/generate"),
        ("POST", "/itineraries-pipeline/generate-titles"),
        ("POST", "/images/flux-edit"),
        ("POST", "/prompt2blog/synthesize"),
        ("POST", "/prompt2blog/classify"),
        ("DELETE", "/article-types/1"),
        ("DELETE", "/itineraries-pipeline/day-shells/custom-shell"),
        ("DELETE", "/staged-drafts/draft-1?storageKey=prompt2blog"),
        ("DELETE", "/staged-drafts?storageKey=prompt2blog"),
        ("POST", "/images/generate-alt-text"),
        ("POST", "/images/describe-scene"),
        ("POST", "/images/build-edit-prompt"),
        ("POST", "/images/describe-subject"),
        ("POST", "/images/build-insert-prompt"),
        ("POST", "/images/generate-alt-text-from-url"),
        ("POST", "/editor-assist/generate-title"),
        ("POST", "/editor-assist/rewrite-block"),
        ("POST", "/editor-assist/compose-itinerary-brief"),
        ("POST", "/editor-assist/compose-itinerary-intro"),
        ("POST", "/editor-assist/compose-itinerary-day-blurbs"),
        ("POST", "/editor-assist/compose-itinerary-stop-reason"),
        ("POST", "/editor-assist/generate-listicle-content"),
        ("POST", "/editor-assist/generate-seo-metadata"),
    ],
)
async def test_costly_and_destructive_routes_reject_invalid_staff_session(
    monkeypatch, method, path
):
    _mock_payload_user(monkeypatch, None)

    async with _app_client() as client:
        response = await client.request(
            method,
            path,
            headers={"Authorization": "Bearer invalid-token"},
        )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid or expired session"


@pytest.mark.asyncio
async def test_guarded_route_is_open_when_flag_is_off(monkeypatch, isolated_db):
    """The default must not change existing behavior.

    This one reaches the real handler, which deletes rows — hence isolated_db.
    """
    monkeypatch.delenv(staff_auth.STAFF_AUTH_FLAG, raising=False)

    async with _app_client() as client:
        response = await client.delete("/staged-drafts?storageKey=test-key")

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


def _mock_payload_user(monkeypatch, user) -> None:
    monkeypatch.setenv(staff_auth.STAFF_AUTH_FLAG, "true")

    async def fake_user(token, url):
        return user

    monkeypatch.setattr(staff_auth, "fetch_payload_user", fake_user)
