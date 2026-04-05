import subprocess

import app.core.http_ssl as http_ssl


def _clear_cache() -> None:
    http_ssl.resolve_httpx_verify.cache_clear()


def test_resolve_httpx_verify_prefers_explicit_ca_bundle_env(monkeypatch):
    _clear_cache()
    monkeypatch.setenv("SSL_CERT_FILE", "/tmp/custom-ca.pem")

    assert http_ssl.resolve_httpx_verify() == "/tmp/custom-ca.pem"

    _clear_cache()


def test_resolve_httpx_verify_exports_macos_keychain_bundle(monkeypatch, tmp_path):
    _clear_cache()
    bundle_path = tmp_path / "macos-certs.pem"

    monkeypatch.delenv("SSL_CERT_FILE", raising=False)
    monkeypatch.delenv("REQUESTS_CA_BUNDLE", raising=False)
    monkeypatch.delenv("CURL_CA_BUNDLE", raising=False)
    monkeypatch.setenv("QUESTURIAN_MACOS_CA_BUNDLE_PATH", str(bundle_path))
    monkeypatch.setattr(http_ssl.sys, "platform", "darwin")

    def _fake_run(*args, **kwargs):
        del kwargs
        return subprocess.CompletedProcess(args=args, returncode=0, stdout="PEM DATA")

    monkeypatch.setattr(http_ssl.subprocess, "run", _fake_run)

    assert http_ssl.resolve_httpx_verify() == str(bundle_path)
    assert bundle_path.read_text(encoding="utf-8") == "PEM DATA"

    _clear_cache()


def test_resolve_httpx_verify_falls_back_when_macos_bundle_generation_fails(
    monkeypatch,
    tmp_path,
):
    _clear_cache()
    bundle_path = tmp_path / "macos-certs.pem"

    monkeypatch.delenv("SSL_CERT_FILE", raising=False)
    monkeypatch.delenv("REQUESTS_CA_BUNDLE", raising=False)
    monkeypatch.delenv("CURL_CA_BUNDLE", raising=False)
    monkeypatch.setenv("QUESTURIAN_MACOS_CA_BUNDLE_PATH", str(bundle_path))
    monkeypatch.setattr(http_ssl.sys, "platform", "darwin")

    def _raise(*args, **kwargs):
        del args, kwargs
        raise subprocess.CalledProcessError(returncode=1, cmd=["security"])

    monkeypatch.setattr(http_ssl.subprocess, "run", _raise)

    assert http_ssl.resolve_httpx_verify() is True

    _clear_cache()
