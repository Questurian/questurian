import pytest

import app.main as main_module


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
