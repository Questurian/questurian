import logging

import pytest

import app.main as main_module


@pytest.mark.asyncio
async def test_lifespan_refuses_to_start_when_cors_config_invalid(monkeypatch):
    """A rejected origin policy must stop the boot, not just log."""
    failure = ValueError("bad origins")
    monkeypatch.setattr(main_module, "_cors_config_error", failure)

    with pytest.raises(ValueError):
        async with main_module.lifespan(main_module.app):
            pass


@pytest.mark.asyncio
async def test_lifespan_starts_normally_when_cors_config_valid(monkeypatch):
    monkeypatch.setattr(main_module, "_cors_config_error", None)
    monkeypatch.setattr(main_module, "fail_stale_runs", lambda: 0)

    async with main_module.lifespan(main_module.app):
        pass


@pytest.mark.asyncio
async def test_lifespan_warns_when_staff_auth_is_disabled(monkeypatch, caplog):
    monkeypatch.setattr(main_module, "_cors_config_error", None)
    monkeypatch.setattr(main_module, "fail_stale_runs", lambda: 0)
    monkeypatch.delenv("ABW_REQUIRE_STAFF_AUTH", raising=False)

    with caplog.at_level(logging.WARNING, logger=main_module.__name__):
        async with main_module.lifespan(main_module.app):
            pass

    assert "ABW_REQUIRE_STAFF_AUTH is disabled" in caplog.text


@pytest.mark.asyncio
async def test_lifespan_does_not_warn_when_staff_auth_is_enabled(monkeypatch, caplog):
    monkeypatch.setattr(main_module, "_cors_config_error", None)
    monkeypatch.setattr(main_module, "fail_stale_runs", lambda: 0)
    monkeypatch.setenv("ABW_REQUIRE_STAFF_AUTH", "true")

    with caplog.at_level(logging.WARNING, logger=main_module.__name__):
        async with main_module.lifespan(main_module.app):
            pass

    assert "ABW_REQUIRE_STAFF_AUTH is disabled" not in caplog.text


def test_rejected_config_fails_closed_instead_of_raising_at_import():
    """Import must stay safe: a half-configured local .env would otherwise
    break collection for every test that imports this module. The served
    list must be deny-all, never the wildcard that was refused."""
    origins, error = main_module.resolve_cors_config(
        api_key="secret-key", raw_origins=""
    )

    assert origins == []
    assert isinstance(error, ValueError)


def test_accepted_config_reports_no_error():
    origins, error = main_module.resolve_cors_config(
        api_key="secret-key", raw_origins="https://abw.example.com"
    )

    assert origins == ["https://abw.example.com"]
    assert error is None


def test_wildcard_allowed_when_no_api_key_configured():
    """Local development has no API key, so the open default is kept."""
    assert main_module.resolve_cors_origins(api_key="", raw_origins="") == ["*"]


def test_explicit_origins_parsed_without_api_key():
    origins = main_module.resolve_cors_origins(
        api_key="", raw_origins="http://localhost:3003, https://abw.example.com"
    )

    assert origins == ["http://localhost:3003", "https://abw.example.com"]


def test_explicit_origins_parsed_with_api_key():
    origins = main_module.resolve_cors_origins(
        api_key="secret-key", raw_origins="https://abw.example.com"
    )

    assert origins == ["https://abw.example.com"]


def test_api_key_without_origins_is_rejected():
    """A configured key means the API is reachable beyond localhost.

    Wildcard CORS there is incoherent: it disables credentialed requests and
    lets any page issue the preflight the X-API-Key header requires.
    """
    with pytest.raises(ValueError) as excinfo:
        main_module.resolve_cors_origins(api_key="secret-key", raw_origins="")

    assert "ABW_ALLOWED_ORIGINS" in str(excinfo.value)


def test_api_key_with_explicit_wildcard_is_rejected():
    """Pinning must be real; `*` must not be smuggled through as a value."""
    with pytest.raises(ValueError):
        main_module.resolve_cors_origins(api_key="secret-key", raw_origins="*")


def test_api_key_with_wildcard_among_origins_is_rejected():
    with pytest.raises(ValueError):
        main_module.resolve_cors_origins(
            api_key="secret-key", raw_origins="https://abw.example.com,*"
        )


def test_whitespace_only_origins_treated_as_unset():
    with pytest.raises(ValueError):
        main_module.resolve_cors_origins(api_key="secret-key", raw_origins="   ")


def test_whitespace_only_api_key_treated_as_unset():
    assert main_module.resolve_cors_origins(api_key="   ", raw_origins="") == ["*"]


def test_explicit_none_denies_all_origins_with_api_key():
    """An instance with no browser client must be able to say so, rather than
    being forced to invent a dummy origin to satisfy the guard."""
    assert (
        main_module.resolve_cors_origins(api_key="secret-key", raw_origins="none") == []
    )


def test_explicit_none_is_case_insensitive():
    assert (
        main_module.resolve_cors_origins(api_key="secret-key", raw_origins="  NONE  ")
        == []
    )


def test_explicit_none_denies_all_origins_without_api_key():
    assert main_module.resolve_cors_origins(api_key="", raw_origins="none") == []


def test_malformed_value_keeps_denying_all_without_api_key():
    """Regression: emptiness is judged on the raw string, not the parsed
    list, so a comma-only value must not widen to a wildcard."""
    assert main_module.resolve_cors_origins(api_key="", raw_origins=",") == []


def test_malformed_value_is_rejected_with_api_key():
    with pytest.raises(ValueError):
        main_module.resolve_cors_origins(api_key="secret-key", raw_origins=",")
