"""Where a staff token may come from, and when the cookie is allowed to count."""

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.core.staff_token import (
    PAYLOAD_TOKEN_COOKIE,
    StaffTokenRejected,
    extract_bearer_token,
    resolve_staff_token,
)

TRUSTED = ["https://abw.questurian.com"]


def _resolve(**overrides):
    kwargs = {
        "authorization": None,
        "cookie_token": None,
        "method": "POST",
        "origin": None,
        "allowed_origins": TRUSTED,
    }
    kwargs.update(overrides)
    return resolve_staff_token(**kwargs)


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
    assert extract_bearer_token(header) == expected


def test_no_credential_at_all_is_no_token():
    assert _resolve() is None


class TestHeader:
    """A header cannot be attached by a page the operator did not mean to load,
    so it needs no origin check."""

    def test_header_needs_no_origin(self):
        assert _resolve(authorization="Bearer abc", origin=None) == "abc"

    def test_header_is_accepted_from_an_untrusted_origin(self):
        assert (
            _resolve(authorization="Bearer abc", origin="https://evil.example")
            == "abc"
        )

    def test_header_wins_over_the_cookie(self):
        assert (
            _resolve(
                authorization="Bearer from-header",
                cookie_token="from-cookie",
                origin=TRUSTED[0],
            )
            == "from-header"
        )

    def test_a_malformed_header_falls_through_to_the_cookie(self):
        """`JWT abc` yields no header token, so the cookie is the only
        credential left — and it is then held to the cookie's rules."""
        assert (
            _resolve(
                authorization="JWT abc", cookie_token="from-cookie", origin=TRUSTED[0]
            )
            == "from-cookie"
        )


class TestCookieOnStateChange:
    def test_accepted_from_an_allowlisted_origin(self):
        assert _resolve(cookie_token="abc", origin=TRUSTED[0]) == "abc"

    def test_trailing_slash_on_either_side_still_matches(self):
        assert (
            _resolve(
                cookie_token="abc",
                origin="https://abw.questurian.com/",
                allowed_origins=["https://abw.questurian.com/"],
            )
            == "abc"
        )

    def test_rejected_from_an_unlisted_origin(self):
        with pytest.raises(StaffTokenRejected) as excinfo:
            _resolve(cookie_token="abc", origin="https://evil.example")

        assert excinfo.value.status_code == 403

    def test_rejected_when_the_origin_header_is_absent(self):
        """A cross-site form POST carries no `Origin` in some browsers. Absence
        is not evidence of trust."""
        with pytest.raises(StaffTokenRejected):
            _resolve(cookie_token="abc", origin=None)

    def test_rejected_under_a_wildcard_allowlist(self):
        """A wildcard would mean trusting every site with the operator's
        session. It is also the local-development default, so this is what
        tells an operator to pin ABW_ALLOWED_ORIGINS."""
        with pytest.raises(StaffTokenRejected):
            _resolve(cookie_token="abc", origin=TRUSTED[0], allowed_origins=["*"])

    def test_rejected_under_an_empty_allowlist(self):
        with pytest.raises(StaffTokenRejected):
            _resolve(cookie_token="abc", origin=TRUSTED[0], allowed_origins=[])

    def test_a_subdomain_of_a_trusted_origin_is_not_trusted(self):
        with pytest.raises(StaffTokenRejected):
            _resolve(cookie_token="abc", origin="https://evil.abw.questurian.com")

    def test_a_prefix_of_a_trusted_origin_is_not_trusted(self):
        with pytest.raises(StaffTokenRejected):
            _resolve(cookie_token="abc", origin="https://abw.questurian.com.evil.test")

    @pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE", "post"])
    def test_every_unsafe_method_is_guarded(self, method):
        with pytest.raises(StaffTokenRejected):
            _resolve(cookie_token="abc", method=method, origin="https://evil.example")


class TestCookieOnSafeMethods:
    @pytest.mark.parametrize("method", ["GET", "HEAD", "get"])
    def test_allowed_without_an_origin(self, method):
        """Same-origin GETs legitimately omit `Origin` in some browsers, and
        CORS already stops a cross-site page reading the response."""
        assert _resolve(cookie_token="abc", method=method, origin=None) == "abc"

    def test_a_present_origin_is_still_checked(self):
        with pytest.raises(StaffTokenRejected):
            _resolve(cookie_token="abc", method="GET", origin="https://evil.example")

    def test_allowlisted_origin_passes(self):
        assert _resolve(cookie_token="abc", method="GET", origin=TRUSTED[0]) == "abc"


class TestThroughTheApp:
    """The dependency has to turn a rejection into a response, not a 500."""

    @pytest.fixture(autouse=True)
    def _pinned_origins(self, monkeypatch):
        monkeypatch.delenv("ABW_API_KEY", raising=False)
        monkeypatch.setenv("ABW_ALLOWED_ORIGINS", TRUSTED[0])

    def test_a_forged_origin_gets_403_not_500(self):
        from app.main import app

        client = TestClient(app)
        client.cookies.set(PAYLOAD_TOKEN_COOKIE, "abc")
        response = client.post(
            "/images/composites/preview",
            json={},
            headers={"Origin": "https://evil.example"},
        )

        assert response.status_code == 403
        assert "allowlisted origin" in response.json()["detail"]

    def test_no_credential_keeps_the_structured_image_error_shape(self):
        """The image API has always answered with a `step`-carrying detail;
        adding a second credential source must not change that contract."""
        from app.main import app

        response = TestClient(app).post("/images/composites/preview", json={})

        assert response.status_code == 401
        detail = response.json()["detail"]
        assert detail["step"] == "validate_auth"
        assert "payload-token" in detail["message"]


def test_rejection_carries_a_message_naming_the_variable_to_fix():
    with pytest.raises(StaffTokenRejected) as excinfo:
        _resolve(cookie_token="abc", origin="https://evil.example")

    assert "ABW_ALLOWED_ORIGINS" in excinfo.value.message


def test_staff_auth_still_rejects_a_missing_token(monkeypatch):
    """`require_staff` no longer parses the header itself, so pin that the
    401 survived the move."""
    from app.core import staff_auth

    monkeypatch.setenv(staff_auth.STAFF_AUTH_FLAG, "true")

    with pytest.raises(HTTPException) as excinfo:
        import asyncio

        asyncio.run(staff_auth.require_staff(token=None))

    assert excinfo.value.status_code == 401
