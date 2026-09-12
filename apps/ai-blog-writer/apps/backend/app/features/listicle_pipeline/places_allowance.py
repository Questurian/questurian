"""How many free Google place lookups are left this month.

Counted by Google, not by us. Every app that holds the Maps key -- this one,
Location Manager, the Questura site, the laptop running it -- spends the same
monthly allowance, and a counter kept here would only ever see this app's
share. Google's own request count for the project sees all of them.

Deliberately conservative. The free allowance that binds is 1,000 a month:
a legacy text search is billed as Text Search plus Basic, Contact and
Atmosphere Data, and Contact and Atmosphere each allow 1,000. A place-details
call that asks for a rating or reviews spends the same Atmosphere allowance.
So every Places request is counted against the 1,000 -- searches, details,
failures included. That can only say fewer are left than really are, never
more, which is the right way round for a number that decides whether
something is free.

Google's count runs a few minutes behind, and the screen says so.

Reads use the Google login on this machine (application default credentials),
the same one the Vertex calls use. Reading the count is free.
"""

from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

FREE_LOOKUPS_PER_MONTH = 1000

# Google's billing month runs on Pacific time, so the allowance resets at
# midnight in Los Angeles on the 1st, not midnight UTC.
BILLING_TZ = ZoneInfo("America/Los_Angeles")

PLACES_SERVICES = ("places-backend.googleapis.com", "places.googleapis.com")

_CACHE_SECONDS = 120
_cache: dict = {}


def month_start(now: datetime) -> datetime:
    """Midnight on the 1st, Pacific time, as a UTC instant."""
    local = now.astimezone(BILLING_TZ)
    return local.replace(day=1, hour=0, minute=0, second=0, microsecond=0).astimezone(
        timezone.utc
    )


def _projects(default_project: str | None) -> list[str]:
    """The projects whose Places requests spend the allowance.

    `PLACES_USAGE_PROJECTS` (comma-separated) when set; otherwise the project
    this machine's Google login defaults to, which is the one the Maps key
    lives in. The free allowance is per billing account, so a second project
    on the same account that ever calls Places belongs in the setting.
    """
    configured = [
        p.strip() for p in os.getenv("PLACES_USAGE_PROJECTS", "").split(",") if p.strip()
    ]
    if configured:
        return configured
    return [default_project] if default_project else []


def _google_fetch():
    """Requests made as this machine's Google login, and its default project."""
    import google.auth
    from google.auth.transport.requests import AuthorizedSession

    credentials, project = google.auth.default(
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    session = AuthorizedSession(credentials)

    def get(url: str, params: dict) -> dict:
        response = session.get(url, params=params, timeout=15)
        response.raise_for_status()
        return response.json()

    return get, project


def _count(get, project: str, start: datetime, end: datetime) -> dict[str, int]:
    """Places requests in one project over exactly [start, end], by method.

    One alignment bucket the length of the window. A longer bucket reaches
    back before the 1st -- a thirty-two-day bucket counted late-August calls
    as September ones the first time this was measured.
    """
    period = max(1, int((end - start).total_seconds()) + 1)
    services = " OR ".join(f'resource.labels.service="{s}"' for s in PLACES_SERVICES)
    body = get(
        f"https://monitoring.googleapis.com/v3/projects/{project}/timeSeries",
        {
            "filter": (
                'metric.type="serviceruntime.googleapis.com/api/request_count" '
                f'AND resource.type="consumed_api" AND ({services})'
            ),
            "interval.startTime": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "interval.endTime": end.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "aggregation.alignmentPeriod": f"{period}s",
            "aggregation.perSeriesAligner": "ALIGN_SUM",
            "aggregation.crossSeriesReducer": "REDUCE_SUM",
            "aggregation.groupByFields": "resource.labels.method",
        },
    )
    counts: dict[str, int] = {}
    for series in body.get("timeSeries", []) or []:
        method = series.get("resource", {}).get("labels", {}).get("method", "other")
        counts[method] = counts.get(method, 0) + sum(
            int(point.get("value", {}).get("int64Value", 0))
            for point in series.get("points", [])
        )
    return counts


def allowance(*, refresh: bool = False, now: datetime | None = None, fetch=None) -> dict:
    """What is left of this month's free lookups. Never raises.

    Cached for two minutes so a screen that re-renders does not re-ask; a
    screen that has just spent passes `refresh`.
    """
    moment = now or datetime.now(timezone.utc)
    if not refresh and fetch is None and _cache.get("at", 0) > time.monotonic() - _CACHE_SECONDS:
        return _cache["value"]

    start = month_start(moment)
    base = {
        "free": FREE_LOOKUPS_PER_MONTH,
        "month_start": start.isoformat(timespec="seconds"),
        "as_of": moment.isoformat(timespec="seconds"),
    }
    try:
        get, default_project = fetch() if fetch else _google_fetch()
        projects = _projects(default_project)
        if not projects:
            return {**base, "available": False, "reason": "No Google project to count."}
        by_method: dict[str, int] = {}
        for project in projects:
            for method, count in _count(get, project, start, moment).items():
                by_method[method] = by_method.get(method, 0) + count
    except Exception as exc:  # noqa: BLE001 -- a count we cannot read is a state, not a crash
        logger.warning("Could not read the Places allowance: %s", exc)
        return {
            **base,
            "available": False,
            "reason": f"Google's count could not be read ({type(exc).__name__}).",
        }

    used = sum(by_method.values())
    value = {
        **base,
        "available": True,
        "used": used,
        "left": max(0, FREE_LOOKUPS_PER_MONTH - used),
        "by_method": by_method,
        "projects": projects,
    }
    if fetch is None:
        _cache.update(at=time.monotonic(), value=value)
    return value
