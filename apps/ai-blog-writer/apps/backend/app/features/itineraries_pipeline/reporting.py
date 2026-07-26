"""Timing helper for consistent Itinerary Autobuild report evidence."""

from __future__ import annotations

import time


def elapsed_ms(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)
