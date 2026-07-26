from fastapi.testclient import TestClient

from app.main import app


def test_pexels_search_requires_api_key(monkeypatch):
    client = TestClient(app)
    monkeypatch.delenv("PEXELS_API_KEY", raising=False)

    response = client.get("/images/pexels/search", params={"query": "beach"})

    assert response.status_code == 500
    detail = response.json()["detail"]
    assert detail["step"] == "validate_pexels_key"
    assert detail["env_var"] == "PEXELS_API_KEY"


def test_pexels_search_returns_mapped_results(monkeypatch):
    client = TestClient(app)
    monkeypatch.setenv("PEXELS_API_KEY", "test-pexels-key")

    class FakePexelsResponse:
        status_code = 200

        def json(self):
            return {
                "page": 1,
                "per_page": 2,
                "total_results": 999,
                "photos": [
                    {
                        "id": 123,
                        "width": 3000,
                        "height": 2000,
                        "url": "https://www.pexels.com/photo/123/",
                        "photographer": "Jane Doe",
                        "photographer_url": "https://www.pexels.com/@janedoe",
                        "alt": "Mountain lake",
                        "src": {
                            "medium": "https://images.pexels.com/photos/123/medium.jpeg",
                            "large2x": "https://images.pexels.com/photos/123/large2x.jpeg",
                            "portrait": "https://images.pexels.com/photos/123/portrait.jpeg",
                        },
                    }
                ],
            }

    class FakeAsyncClient:
        def __init__(self, timeout: float):
            assert timeout == 15.0

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def get(self, url: str, params: dict, headers: dict):
            assert url == "https://api.pexels.com/v1/search"
            assert headers["Authorization"] == "test-pexels-key"
            assert params["query"] == "mountains"
            assert params["per_page"] == 2
            assert params["page"] == 1
            assert params["orientation"] == "portrait"
            return FakePexelsResponse()

    monkeypatch.setattr(
        "app.features.images.providers.routes.httpx.AsyncClient",
        FakeAsyncClient,
    )

    response = client.get(
        "/images/pexels/search",
        params={"query": "mountains", "per_page": 2, "orientation": "portrait"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["query"] == "mountains"
    assert payload["per_page"] == 2
    assert payload["total_results"] == 999
    assert len(payload["photos"]) == 1
    assert payload["photos"][0]["id"] == 123
    assert payload["photos"][0]["photographer"] == "Jane Doe"
    assert payload["photos"][0]["image_url"].endswith("medium.jpeg")


def test_pexels_search_rejects_invalid_orientation(monkeypatch):
    client = TestClient(app)
    monkeypatch.setenv("PEXELS_API_KEY", "test-pexels-key")

    response = client.get(
        "/images/pexels/search",
        params={"query": "mountains", "orientation": "diagonal"},
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["step"] == "validate_pexels_query"
    assert detail["orientation"] == "diagonal"


def test_unsplash_search_requires_access_key(monkeypatch):
    client = TestClient(app)
    monkeypatch.delenv("UNSPLASH_ACCESS_KEY", raising=False)

    response = client.get("/images/unsplash/search", params={"query": "beach"})

    assert response.status_code == 500
    detail = response.json()["detail"]
    assert detail["step"] == "validate_unsplash_key"
    assert detail["env_var"] == "UNSPLASH_ACCESS_KEY"


def test_unsplash_search_returns_mapped_results(monkeypatch):
    client = TestClient(app)
    monkeypatch.setenv("UNSPLASH_ACCESS_KEY", "test-unsplash-key")

    class FakeUnsplashResponse:
        status_code = 200

        def json(self):
            return {
                "total": 321,
                "results": [
                    {
                        "id": "abc123",
                        "width": 4000,
                        "height": 2600,
                        "description": "Sunset cliffs",
                        "alt_description": "Orange sky over ocean cliffs",
                        "urls": {
                            "small": "https://images.unsplash.com/photo-small",
                            "regular": "https://images.unsplash.com/photo-regular",
                            "full": "https://images.unsplash.com/photo-full",
                        },
                        "links": {
                            "html": "https://unsplash.com/photos/abc123",
                        },
                        "user": {
                            "name": "Alex Lens",
                            "links": {
                                "html": "https://unsplash.com/@alexlens",
                            },
                        },
                    }
                ],
            }

    class FakeAsyncClient:
        def __init__(self, timeout: float):
            assert timeout == 15.0

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def get(self, url: str, params: dict, headers: dict):
            assert url == "https://api.unsplash.com/search/photos"
            assert headers["Authorization"] == "Client-ID test-unsplash-key"
            assert headers["Accept-Version"] == "v1"
            assert params["query"] == "coastline"
            assert params["per_page"] == 12
            assert params["page"] == 1
            assert params["orientation"] == "squarish"
            return FakeUnsplashResponse()

    monkeypatch.setattr(
        "app.features.images.providers.routes.httpx.AsyncClient",
        FakeAsyncClient,
    )

    response = client.get(
        "/images/unsplash/search",
        params={"query": "coastline", "per_page": 12, "orientation": "square"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["query"] == "coastline"
    assert payload["per_page"] == 12
    assert payload["total_results"] == 321
    assert len(payload["photos"]) == 1
    assert payload["photos"][0]["id"] == "abc123"
    assert payload["photos"][0]["photographer"] == "Alex Lens"
    assert payload["photos"][0]["image_url"].endswith("photo-small")


def test_unsplash_search_rejects_invalid_orientation(monkeypatch):
    client = TestClient(app)
    monkeypatch.setenv("UNSPLASH_ACCESS_KEY", "test-unsplash-key")

    response = client.get(
        "/images/unsplash/search",
        params={"query": "coastline", "orientation": "diagonal"},
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["step"] == "validate_unsplash_query"
    assert detail["orientation"] == "diagonal"
