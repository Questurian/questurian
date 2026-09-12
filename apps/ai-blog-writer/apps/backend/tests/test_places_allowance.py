"""The free-lookup countdown: Google's count, read conservatively.

Google is faked. What is pinned down is the arithmetic and the window: every
Places request counts, the month starts at midnight Pacific on the 1st, the
window never reaches back into last month, and a count that cannot be read
says so instead of claiming the full allowance is left.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.features.listicle_pipeline import places_allowance
from app.features.listicle_pipeline.places_allowance import allowance, month_start

NOW = datetime(2026, 9, 11, 19, 0, tzinfo=timezone.utc)


def _series(method: str, *counts: int) -> dict:
    return {
        "resource": {"labels": {"method": method}},
        "points": [{"value": {"int64Value": str(c)}} for c in counts],
    }


class FakeMonitoring:
    def __init__(self, per_project: dict[str, list[dict]], default_project="vertex"):
        self.per_project = per_project
        self.default_project = default_project
        self.asked: list[tuple[str, dict]] = []

    def __call__(self):
        def get(url: str, params: dict) -> dict:
            project = url.split("/projects/")[1].split("/")[0]
            self.asked.append((project, params))
            return {"timeSeries": self.per_project.get(project, [])}

        return get, self.default_project


@pytest.fixture(autouse=True)
def no_configured_projects(monkeypatch):
    monkeypatch.delenv("PLACES_USAGE_PROJECTS", raising=False)


def test_every_places_request_counts_against_the_thousand():
    google = FakeMonitoring(
        {
            "vertex": [
                _series("google.places.TextSearch.Http", 16),
                _series("google.places.Details.Http", 12),
            ]
        }
    )

    result = allowance(now=NOW, fetch=google)

    assert result["available"] is True
    assert result["used"] == 28
    assert result["left"] == 972
    assert result["free"] == 1000


def test_left_never_goes_below_zero():
    google = FakeMonitoring({"vertex": [_series("google.places.TextSearch.Http", 1500)]})

    assert allowance(now=NOW, fetch=google)["left"] == 0


def test_the_month_starts_at_midnight_pacific():
    # 1 Sept 00:00 in Los Angeles is 07:00 UTC in summer time.
    assert month_start(NOW) == datetime(2026, 9, 1, 7, 0, tzinfo=timezone.utc)
    # At 03:00 UTC on 1 Sept it is still 31 Aug in Los Angeles.
    early = datetime(2026, 9, 1, 3, 0, tzinfo=timezone.utc)
    assert month_start(early) == datetime(2026, 8, 1, 7, 0, tzinfo=timezone.utc)


def test_the_window_is_exactly_this_month():
    """One bucket the length of the window: a longer one counted August."""
    google = FakeMonitoring({"vertex": []})

    allowance(now=NOW, fetch=google)

    params = google.asked[0][1]
    assert params["interval.startTime"] == "2026-09-01T07:00:00Z"
    assert params["interval.endTime"] == "2026-09-11T19:00:00Z"
    window = (NOW - month_start(NOW)).total_seconds()
    assert params["aggregation.alignmentPeriod"] == f"{int(window) + 1}s"
    assert "places-backend.googleapis.com" in params["filter"]
    assert "places.googleapis.com" in params["filter"]


def test_every_configured_project_is_added_up(monkeypatch):
    monkeypatch.setenv("PLACES_USAGE_PROJECTS", "vertex, other")
    google = FakeMonitoring(
        {
            "vertex": [_series("google.places.TextSearch.Http", 10)],
            "other": [_series("google.places.TextSearch.Http", 5)],
        }
    )

    result = allowance(now=NOW, fetch=google)

    assert result["used"] == 15
    assert result["projects"] == ["vertex", "other"]


def test_a_count_that_cannot_be_read_does_not_claim_the_allowance_is_free():
    def broken():
        raise RuntimeError("no login")

    result = allowance(now=NOW, fetch=broken)

    assert result["available"] is False
    assert "left" not in result
    assert "could not be read" in result["reason"]


def test_the_route_reports_the_countdown(monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    import app.features.listicle_pipeline.api as listicle_api

    google = FakeMonitoring({"vertex": [_series("google.places.TextSearch.Http", 40)]})
    monkeypatch.setattr(places_allowance, "_google_fetch", google)
    places_allowance._cache.clear()
    app = FastAPI()
    app.include_router(listicle_api.router)

    body = TestClient(app).get("/api/listicle-pipeline/google-allowance?refresh=true").json()

    assert body["left"] == 960
    places_allowance._cache.clear()
