import base64

from fastapi.testclient import TestClient

from app.main import app
from tests.images_route_test_support import _auth_headers


def test_flux_edit_requires_bfl_api_key(monkeypatch):
    client = TestClient(app)
    monkeypatch.delenv("BFL_API_KEY", raising=False)

    response = client.post(
        "/images/flux-edit",
        data={"prompt": "Keep the scene composition intact."},
        files={
            "reference_image": ("reference.png", b"reference-bytes", "image/png"),
        },
        headers=_auth_headers(),
    )

    assert response.status_code == 500
    detail = response.json()["detail"]
    assert detail["step"] == "validate_bfl_config"
    assert detail["env_var"] == "BFL_API_KEY"


def test_flux_edit_success(monkeypatch):
    client = TestClient(app)
    monkeypatch.setenv("BFL_API_KEY", "test-bfl-key")
    monkeypatch.setenv("BFL_BASE_URL", "https://api.bfl.ai")
    monkeypatch.setenv("BFL_MODEL_ID", "flux-2-pro-preview")

    calls = {
        "payload": None,
        "poll_count": 0,
    }

    class FakeResponse:
        def __init__(
            self,
            status_code: int,
            *,
            json_body=None,
            text: str = "",
            content: bytes = b"",
            headers: dict | None = None,
        ):
            self.status_code = status_code
            self._json_body = json_body
            self.text = text
            self.content = content
            self.headers = headers or {}

        def json(self):
            if self._json_body is None:
                raise ValueError("No JSON body")
            return self._json_body

    class FakeAsyncClient:
        def __init__(self, timeout: float, follow_redirects: bool = False):
            self.timeout = timeout
            self.follow_redirects = follow_redirects

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url: str, headers: dict, json: dict):
            assert self.timeout == 30.0
            assert url == "https://api.bfl.ai/v1/flux-2-pro-preview"
            assert headers["x-key"] == "test-bfl-key"
            assert headers["Content-Type"] == "application/json"
            calls["payload"] = json
            return FakeResponse(
                200,
                json_body={
                    "id": "task_123",
                    "polling_url": "https://api.bfl.ai/v1/get_result?id=task_123",
                    "cost": 3.5,
                    "input_mp": 1.25,
                    "output_mp": 1.0,
                },
            )

        async def get(self, url: str, headers: dict | None = None):
            if url == "https://api.bfl.ai/v1/get_result?id=task_123":
                assert self.timeout == 15.0
                assert headers is not None
                assert headers["x-key"] == "test-bfl-key"
                calls["poll_count"] += 1
                if calls["poll_count"] == 1:
                    return FakeResponse(
                        200,
                        json_body={"id": "task_123", "status": "Pending"},
                    )
                return FakeResponse(
                    200,
                    json_body={
                        "id": "task_123",
                        "status": "Ready",
                        "result": {"sample": "https://delivery.bfl.ai/result.png"},
                    },
                )

            assert url == "https://delivery.bfl.ai/result.png"
            assert self.timeout == 60.0
            assert self.follow_redirects is True
            return FakeResponse(
                200,
                content=b"png-bytes",
                headers={"content-type": "image/png"},
            )

    monkeypatch.setattr(
        "app.features.images.bfl_client.httpx.AsyncClient",
        FakeAsyncClient,
    )

    response = client.post(
        "/images/flux-edit",
        data={"prompt": "Keep the exact framing and improve realism."},
        files={
            "reference_image": ("reference.png", b"reference-bytes", "image/png"),
        },
        headers=_auth_headers(),
    )

    assert response.status_code == 200
    assert response.content == b"png-bytes"
    assert response.headers["content-type"].startswith("image/png")
    assert response.headers["x-bfl-request-id"] == "task_123"
    assert response.headers["x-bfl-model"] == "flux-2-pro-preview"
    assert response.headers["x-bfl-cost"] == "3.5"
    assert response.headers["x-bfl-input-mp"] == "1.25"
    assert response.headers["x-bfl-output-mp"] == "1.0"
    assert "flux-2-pro-preview-task_123.png" in response.headers["content-disposition"]
    assert calls["poll_count"] == 2

    assert calls["payload"]["prompt"] == "Keep the exact framing and improve realism."
    assert calls["payload"]["disable_pup"] is True
    assert calls["payload"]["safety_tolerance"] == 2
    assert calls["payload"]["output_format"] == "png"
    assert "width" not in calls["payload"]
    assert "height" not in calls["payload"]
    assert "seed" not in calls["payload"]
    assert base64.b64decode(calls["payload"]["input_image"]) == b"reference-bytes"


def test_flux_edit_supports_model_size_and_extra_references(monkeypatch):
    client = TestClient(app)
    monkeypatch.setenv("BFL_API_KEY", "test-bfl-key")
    monkeypatch.setenv("BFL_BASE_URL", "https://api.bfl.ai")
    monkeypatch.setenv("BFL_MODEL_ID", "flux-2-pro-preview")

    calls = {
        "payload": None,
        "poll_count": 0,
    }

    class FakeResponse:
        def __init__(
            self,
            status_code: int,
            *,
            json_body=None,
            text: str = "",
            content: bytes = b"",
            headers: dict | None = None,
        ):
            self.status_code = status_code
            self._json_body = json_body
            self.text = text
            self.content = content
            self.headers = headers or {}

        def json(self):
            if self._json_body is None:
                raise ValueError("No JSON body")
            return self._json_body

    class FakeAsyncClient:
        def __init__(self, timeout: float, follow_redirects: bool = False):
            self.timeout = timeout
            self.follow_redirects = follow_redirects

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url: str, headers: dict, json: dict):
            assert self.timeout == 30.0
            assert url == "https://api.bfl.ai/v1/flux-2-flex"
            assert headers["x-key"] == "test-bfl-key"
            calls["payload"] = json
            return FakeResponse(
                200,
                json_body={
                    "id": "task_flex",
                    "polling_url": "https://api.bfl.ai/v1/get_result?id=task_flex",
                    "cost": 7.2,
                    "input_mp": 1.8,
                    "output_mp": 0.75,
                },
            )

        async def get(self, url: str, headers: dict | None = None):
            if url == "https://api.bfl.ai/v1/get_result?id=task_flex":
                calls["poll_count"] += 1
                if calls["poll_count"] == 1:
                    return FakeResponse(
                        200, json_body={"id": "task_flex", "status": "Pending"}
                    )
                return FakeResponse(
                    200,
                    json_body={
                        "id": "task_flex",
                        "status": "Ready",
                        "result": {"sample": "https://delivery.bfl.ai/flex.png"},
                    },
                )

            assert url == "https://delivery.bfl.ai/flex.png"
            return FakeResponse(
                200,
                content=b"flex-bytes",
                headers={"content-type": "image/png"},
            )

    monkeypatch.setattr(
        "app.features.images.bfl_client.httpx.AsyncClient",
        FakeAsyncClient,
    )

    response = client.post(
        "/images/flux-edit",
        data={
            "prompt": "Keep the room but swap the rug and pull the styling from the other references.",
            "model_id": "flux-2-flex",
            "width": "1200",
            "height": "624",
            "safety_tolerance": "4",
            "prompt_upsampling": "true",
            "seed": "42",
        },
        files=[
            ("reference_image", ("reference.png", b"reference-bytes", "image/png")),
            (
                "additional_reference_images",
                ("texture.png", b"texture-bytes", "image/png"),
            ),
            ("additional_reference_images", ("chair.png", b"chair-bytes", "image/png")),
        ],
        headers=_auth_headers(),
    )

    assert response.status_code == 200
    assert response.content == b"flex-bytes"
    assert response.headers["x-bfl-model"] == "flux-2-flex"
    assert calls["poll_count"] == 2
    assert calls["payload"]["prompt_upsampling"] is True
    assert "disable_pup" not in calls["payload"]
    assert calls["payload"]["width"] == 1200
    assert calls["payload"]["height"] == 624
    assert calls["payload"]["safety_tolerance"] == 4
    assert calls["payload"]["seed"] == 42
    assert base64.b64decode(calls["payload"]["input_image"]) == b"reference-bytes"
    assert base64.b64decode(calls["payload"]["input_image_2"]) == b"texture-bytes"
    assert base64.b64decode(calls["payload"]["input_image_3"]) == b"chair-bytes"


def test_flux_edit_supports_flux_max_model(monkeypatch):
    client = TestClient(app)
    monkeypatch.setenv("BFL_API_KEY", "test-bfl-key")
    monkeypatch.setenv("BFL_BASE_URL", "https://api.bfl.ai")

    calls = {
        "payload": None,
        "poll_count": 0,
    }

    class FakeResponse:
        def __init__(
            self,
            status_code: int,
            *,
            json_body=None,
            text: str = "",
            content: bytes = b"",
            headers: dict | None = None,
        ):
            self.status_code = status_code
            self._json_body = json_body
            self.text = text
            self.content = content
            self.headers = headers or {}

        def json(self):
            if self._json_body is None:
                raise ValueError("No JSON body")
            return self._json_body

    class FakeAsyncClient:
        def __init__(self, timeout: float, follow_redirects: bool = False):
            self.timeout = timeout
            self.follow_redirects = follow_redirects

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url: str, headers: dict, json: dict):
            assert self.timeout == 30.0
            assert url == "https://api.bfl.ai/v1/flux-2-max"
            assert headers["x-key"] == "test-bfl-key"
            calls["payload"] = json
            return FakeResponse(
                200,
                json_body={
                    "id": "task_max",
                    "polling_url": "https://api.bfl.ai/v1/get_result?id=task_max",
                },
            )

        async def get(self, url: str, headers: dict | None = None):
            if url == "https://api.bfl.ai/v1/get_result?id=task_max":
                calls["poll_count"] += 1
                return FakeResponse(
                    200,
                    json_body={
                        "id": "task_max",
                        "status": "Ready",
                        "result": {"sample": "https://delivery.bfl.ai/max.png"},
                    },
                )

            assert url == "https://delivery.bfl.ai/max.png"
            return FakeResponse(
                200,
                content=b"max-bytes",
                headers={"content-type": "image/png"},
            )

    monkeypatch.setattr(
        "app.features.images.bfl_client.httpx.AsyncClient",
        FakeAsyncClient,
    )

    response = client.post(
        "/images/flux-edit",
        data={
            "prompt": "Preserve the base scene and blend styling from the other references.",
            "model_id": "flux-2-max",
        },
        files={
            "reference_image": ("reference.png", b"reference-bytes", "image/png"),
        },
        headers=_auth_headers(),
    )

    assert response.status_code == 200
    assert response.content == b"max-bytes"
    assert response.headers["x-bfl-model"] == "flux-2-max"
    assert calls["poll_count"] == 1
    assert calls["payload"]["disable_pup"] is True
    assert "prompt_upsampling" not in calls["payload"]
    assert base64.b64decode(calls["payload"]["input_image"]) == b"reference-bytes"


def test_flux_edit_rejects_partial_dimensions():
    client = TestClient(app)

    response = client.post(
        "/images/flux-edit",
        data={
            "prompt": "Keep the architecture as-is.",
            "width": "1200",
        },
        files={
            "reference_image": ("reference.png", b"reference-bytes", "image/png"),
        },
        headers=_auth_headers(),
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["step"] == "validate_flux_dimensions"
    assert detail["width"] == 1200
    assert "height" not in detail


def test_flux_edit_returns_structured_moderation_error(monkeypatch):
    client = TestClient(app)
    monkeypatch.setenv("BFL_API_KEY", "test-bfl-key")

    class FakeResponse:
        def __init__(self, status_code: int, *, json_body=None):
            self.status_code = status_code
            self._json_body = json_body
            self.text = ""
            self.headers = {}
            self.content = b""

        def json(self):
            return self._json_body

    class FakeAsyncClient:
        def __init__(self, timeout: float, follow_redirects: bool = False):
            self.timeout = timeout
            self.follow_redirects = follow_redirects

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url: str, headers: dict, json: dict):
            return FakeResponse(
                200,
                json_body={
                    "id": "task_456",
                    "polling_url": "https://api.bfl.ai/v1/get_result?id=task_456",
                },
            )

        async def get(self, url: str, headers: dict | None = None):
            return FakeResponse(
                200,
                json_body={
                    "id": "task_456",
                    "status": "Request Moderated",
                    "result": None,
                },
            )

    monkeypatch.setattr(
        "app.features.images.bfl_client.httpx.AsyncClient",
        FakeAsyncClient,
    )

    response = client.post(
        "/images/flux-edit",
        data={"prompt": "Replace the landmark with something unsafe."},
        files={
            "reference_image": ("reference.png", b"reference-bytes", "image/png"),
        },
        headers=_auth_headers(),
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["message"] == "BFL moderated this request"
    assert detail["step"] == "poll_flux_edit"
    assert detail["bfl_status"] == "Request Moderated"


def test_flux_edit_preserves_upstream_rate_limit_status(monkeypatch):
    client = TestClient(app)
    monkeypatch.setenv("BFL_API_KEY", "test-bfl-key")

    class FakeResponse:
        status_code = 429
        text = '{"detail":"Rate limit exceeded"}'
        headers = {}
        content = b""

        def json(self):
            return {"detail": "Rate limit exceeded"}

    class FakeAsyncClient:
        def __init__(self, timeout: float, follow_redirects: bool = False):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url: str, headers: dict, json: dict):
            return FakeResponse()

    monkeypatch.setattr(
        "app.features.images.bfl_client.httpx.AsyncClient",
        FakeAsyncClient,
    )

    response = client.post(
        "/images/flux-edit",
        data={"prompt": "Keep the architecture as-is."},
        files={
            "reference_image": ("reference.png", b"reference-bytes", "image/png"),
        },
        headers=_auth_headers(),
    )

    assert response.status_code == 429
    detail = response.json()["detail"]
    assert detail["message"] == "BFL request failed"
    assert detail["step"] == "submit_flux_edit"
    assert detail["provider_status_code"] == 429


def test_flux_edit_preserves_upstream_service_unavailable_status(monkeypatch):
    client = TestClient(app)
    monkeypatch.setenv("BFL_API_KEY", "test-bfl-key")

    class FakeResponse:
        def __init__(self, status_code: int, *, json_body=None):
            self.status_code = status_code
            self._json_body = json_body
            self.text = '{"detail":"BFL maintenance"}' if status_code == 503 else ""
            self.headers = {}
            self.content = b""

        def json(self):
            if self._json_body is not None:
                return self._json_body
            return {"detail": "BFL maintenance"}

    class FakeAsyncClient:
        def __init__(self, timeout: float, follow_redirects: bool = False):
            self.timeout = timeout
            self.follow_redirects = follow_redirects

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url: str, headers: dict, json: dict):
            return FakeResponse(
                200,
                json_body={
                    "id": "task_789",
                    "polling_url": "https://api.bfl.ai/v1/get_result?id=task_789",
                },
            )

        async def get(self, url: str, headers: dict | None = None):
            if "get_result" in url:
                return FakeResponse(503)
            raise AssertionError(url)

    monkeypatch.setattr(
        "app.features.images.bfl_client.httpx.AsyncClient",
        FakeAsyncClient,
    )

    response = client.post(
        "/images/flux-edit",
        data={"prompt": "Keep the architecture as-is."},
        files={
            "reference_image": ("reference.png", b"reference-bytes", "image/png"),
        },
        headers=_auth_headers(),
    )

    assert response.status_code == 503
    detail = response.json()["detail"]
    assert detail["message"] == "BFL request failed"
    assert detail["step"] == "poll_flux_edit"
    assert detail["provider_status_code"] == 503
