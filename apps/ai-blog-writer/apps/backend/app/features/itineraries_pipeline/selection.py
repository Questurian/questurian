"""Legacy deterministic selection utilities retained for pure planning tests.

Active Itinerary Autobuild now fills operator-selected Day Shell slots in
`graph.py` (ADR 0016). `pick_lodging_anchor` remains in use; `select_stops` and
`distribute_across_days` describe the pre-shell strategy and are kept until old
tests/callers are retired.
"""

from __future__ import annotations

from .schemas import Category, IntentSpec, ScoredCandidate


def pick_lodging_anchor(accommodations: list[ScoredCandidate]) -> ScoredCandidate | None:
    """Highest-fit accommodation is the trip's anchor; None when there are
    none (graceful fallback — the day then orders from its centroid)."""
    if not accommodations:
        return None
    return max(accommodations, key=lambda s: s.fit_score)


def select_stops(
    scored_by_category: dict[Category, list[ScoredCandidate]],
    intent: IntentSpec,
    total_slots: int,
) -> list[ScoredCandidate]:
    """Pick `total_slots` stops across the requested non-lodging categories.

    Round-robins across categories (each drawn best-fit-first) so variety is
    preserved; when a category runs dry the remaining slots fall through to
    whatever else has the highest fit. Deduplicated by record id.
    """
    categories: list[Category] = [c for c in getattr(intent, "categories", []) if c != "accommodations"]
    if not categories:
        categories = [c for c in scored_by_category if c != "accommodations"]

    queues: dict[Category, list[ScoredCandidate]] = {
        c: sorted(scored_by_category.get(c, []), key=lambda s: s.fit_score, reverse=True)
        for c in categories
    }

    selected: list[ScoredCandidate] = []
    seen: set[int] = set()

    def _take(cat: Category) -> bool:
        queue = queues.get(cat) or []
        while queue:
            cand = queue.pop(0)
            if cand.candidate.id not in seen:
                seen.add(cand.candidate.id)
                selected.append(cand)
                return True
        return False

    # Round-robin pass across categories, best-fit first within each.
    progressed = True
    while len(selected) < total_slots and progressed:
        progressed = False
        for cat in categories:
            if len(selected) >= total_slots:
                break
            if _take(cat):
                progressed = True

    return selected[:total_slots]


def distribute_across_days(
    stops: list[ScoredCandidate],
    day_count: int,
) -> list[list[ScoredCandidate]]:
    """Group selected stops into `day_count` days, clustered by neighborhood.

    Stops are sorted so same-neighborhood records sit adjacently (best-fit
    neighborhoods first), then sliced into contiguous, near-even day buckets —
    keeping each day in one area without an expensive clustering pass.
    """
    if day_count < 1:
        day_count = 1
    if not stops:
        return [[] for _ in range(day_count)]

    # Rank neighborhoods by aggregate fit so the strongest area leads day 1.
    fit_by_hood: dict[str, int] = {}
    for s in stops:
        key = s.candidate.neighborhood_key or ""
        fit_by_hood[key] = fit_by_hood.get(key, 0) + s.fit_score

    ordered = sorted(
        stops,
        key=lambda s: (
            -fit_by_hood.get(s.candidate.neighborhood_key or "", 0),
            s.candidate.neighborhood_key or "",
            -s.fit_score,
        ),
    )

    # Near-even contiguous chunks: first `remainder` days get one extra stop.
    base, remainder = divmod(len(ordered), day_count)
    days: list[list[ScoredCandidate]] = []
    cursor = 0
    for day_index in range(day_count):
        size = base + (1 if day_index < remainder else 0)
        days.append(ordered[cursor:cursor + size])
        cursor += size
    return days
