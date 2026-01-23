import calendar
from datetime import datetime, timezone
from typing import Optional


def to_isoformat(value) -> Optional[str]:
    if not value:
        return None

    try:
        timestamp = calendar.timegm(value)
    except (TypeError, ValueError):
        return None

    return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()
