import calendar
from datetime import datetime, timezone
import re
from typing import Optional


def to_isoformat(value) -> Optional[str]:
    if not value:
        return None

    try:
        timestamp = calendar.timegm(value)
    except (TypeError, ValueError):
        return None

    return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()


_DD_MM_YYYY_RE = re.compile(
    r"^\s*(\d{2})/(\d{2})/(\d{4})(?:\s*[_-]?\s*(\d{2}):(\d{2}))?\s*$"
)


def normalize_published_at(value: Optional[str]) -> Optional[str]:
    """
    Normalize source publish timestamps to ISO 8601 UTC.

    Supports:
    - El Comercio format: DD/MM/YYYY
    - El Comercio format with time: DD/MM/YYYY _ HH:MM
    - ISO-like datetimes (including trailing Z)
    - ISO-like dates (YYYY-MM-DD)
    """
    if not value:
        return None

    raw = value.strip()
    if not raw:
        return None

    dmy_match = _DD_MM_YYYY_RE.match(raw)
    if dmy_match:
        day = int(dmy_match.group(1))
        month = int(dmy_match.group(2))
        year = int(dmy_match.group(3))
        hour = int(dmy_match.group(4) or 0)
        minute = int(dmy_match.group(5) or 0)
        try:
            return datetime(year, month, day, hour, minute, tzinfo=timezone.utc).isoformat()
        except ValueError:
            return None

    normalized_raw = raw
    if normalized_raw.endswith("Z"):
        normalized_raw = normalized_raw[:-1] + "+00:00"

    try:
        parsed = datetime.fromisoformat(normalized_raw)
    except ValueError:
        return None

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    else:
        parsed = parsed.astimezone(timezone.utc)

    return parsed.isoformat()
