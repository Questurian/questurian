#!/usr/bin/env python
"""Build a listicle run that shows every state the screen can be in.

Offline. Nothing here reaches the web and nothing costs anything: the searches
are answered from a dictionary in this file, and the cut review's verdicts are
written straight to storage.

It exists because the states worth checking are the ones that are hard to
produce on purpose -- a refresh that failed over work that still stands, two
branches carrying one name, a review that covered half the list. Reading them
on a real run means waiting for something to go wrong.

    PYTHONPATH=apps/backend:packages/shared/src:packages/utils/src \
        .venv/bin/python apps/backend/scripts/build_listicle_demo_run.py

Then open http://localhost:3003/listicle-pipeline/zzdemo01.

Run it again to rebuild from scratch. `--remove` deletes it and stops.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = Path(__file__).resolve().parents[3]
for entry in (ROOT, REPO / "packages" / "shared" / "src", REPO / "packages" / "utils" / "src"):
    if str(entry) not in sys.path:
        sys.path.insert(0, str(entry))

from app.core.database import get_db_connection  # noqa: E402
from app.features.listicle_pipeline import cut_review, service, store  # noqa: E402
from app.features.listicle_pipeline.contracts import (  # noqa: E402
    LISTICLE_MARKER_KEYS,
    CutReview,
    CutReviewChunk,
    CutVerdict,
)
from app.features.prompt2blog.contracts_v4 import (  # noqa: E402
    GrillQuestion,
    GrillState,
    GrillTurn,
)

RUN = "zzdemo01"

_TABLES = (
    "listicle_grills",
    "listicle_search_results",
    "listicle_search_orders",
    "listicle_search_attempts",
    "listicle_attempts",
    "listicle_selected_attempts",
    "listicle_pool_snapshots",
    "listicle_angle_selections",
    "listicle_cut_reviews",
    "listicle_cut_reviews_by_pool",
    "listicle_interview_baselines",
    "listicle_search_locks",
)

# Written to show identity handling rather than to be true about Lima. Every
# pair here is one the pooling rules have to get right:
#
#   Hotel Sol / Hotel Sol Palace   one name inside another, same district
#   Hotel Azul (Lobby / Rooftop)   two things inside one building
#   Casa Republicana with and without a district
REPLIES = {
    "Barranco": (
        "Hotel Sol | Centro | a small independent hotel\n"
        "Hotel Sol Palace | Centro | a separate, larger hotel\n"
        "Hotel Azul (Lobby bar) | Centro | the bar off the lobby\n"
        "Hotel Azul (Rooftop bar) | Centro | the rooftop bar, inside a hotel\n"
        "Casa Republicana | Barranco | a converted casona\n"
    ),
    "family": (
        "Hotel Sol | Centro | run by the family who own it\n"
        "Casa Republicana | | written up locally\n"
        "Hostal Miramar | Chorrillos | four rooms, one family\n"
    ),
}


def _turn(marker: str, answer: str, counter=[0]) -> GrillTurn:
    counter[0] += 1
    return GrillTurn(
        question=GrillQuestion(
            question_id=f"demo-{marker}-{counter[0]}",
            topic=marker,
            ask=f"About {marker}?",
            recommendation="-",
            asks_about=marker,
        ),
        answer=answer,
    )


def _research(prompt: str):
    for token, reply in REPLIES.items():
        if token in prompt:
            return reply, ["https://example.test"], 0
    raise AssertionError(f"the demo has no reply for: {prompt[:80]}")


def _research_with_one_failure(prompt: str):
    if "family" in prompt:
        raise TimeoutError("read timed out")
    return _research(prompt)


def remove() -> None:
    with get_db_connection() as conn:
        for table in _TABLES:
            conn.execute(f"DELETE FROM {table} WHERE run_id = ?", (RUN,))


def build() -> dict:
    remove()
    state = GrillState(
        run_id=RUN,
        seed="DEMO -- the 12 best hotels in Lima (built offline, nothing was bought)",
        status="agreed",
        consensus="Twelve hotels in Lima. Built offline to show the screen's states.",
        markers_covered=list(LISTICLE_MARKER_KEYS),
        marker_keys=LISTICLE_MARKER_KEYS,
        turns=[
            _turn("kind", "hotels"),
            _turn("place", "Lima, Peru"),
            _turn("count", "12"),
            _turn("bar", "written up by someone other than the hotel"),
            _turn("cut", "no chains, no bars inside hotels"),
            _turn(
                "angles",
                "hotels in Barranco\nguesthouses run by the family who own them",
            ),
        ],
    )
    store.save(state)
    service.create_order(state)

    # A clean batch, then a refresh where one angle fails. The failure must not
    # take the work it was replacing with it.
    service.search(RUN, _research)
    service.search(RUN, _research_with_one_failure, reuse=False)

    # A review that covered half the pool. Written directly rather than bought:
    # what this shows is the screen's partial state, not a reviewer's judgement.
    order = service.order(RUN)
    payload = service.progress(RUN)
    ids = [c["candidate_id"] for c in payload["candidates"]]
    covered = ids[: max(1, len(ids) // 2)]
    rooftop = next(c for c in payload["candidates"] if "Rooftop" in c["name"])
    store.save_pool_review(
        CutReview(
            run_id=RUN,
            revision=order.revision,
            fingerprint=cut_review.review_fingerprint(order, payload["candidates"]),
            status="partial",
            expected_candidate_ids=ids,
            reviewed_candidate_ids=covered,
            verdicts=(
                [
                    CutVerdict(
                        candidate_id=rooftop["candidate_id"],
                        name=rooftop["name"],
                        why="The evidence says it is the rooftop bar inside a hotel.",
                        confidence="clear",
                    )
                ]
                if rooftop["candidate_id"] in covered
                else []
            ),
            chunks=[
                CutReviewChunk(
                    index=0, candidate_ids=ids, state="failed", reason="TimeoutError"
                )
            ],
            pooling_version="2",
        )
    )
    return service.progress(RUN)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--remove", action="store_true", help="Delete it and stop.")
    args = parser.parse_args()
    if args.remove:
        remove()
        print(f"Removed run {RUN}.")
        return 0

    view = build()
    print(f"Run {RUN} built. http://localhost:3003/listicle-pipeline/{RUN}")
    print(
        f"  {view['found']} candidates, "
        f"{view['uncertain_identity']} with a possible duplicate beside them"
    )
    print(
        f"  cut review: {view['cut_review_status']} "
        f"({view['cut_reviewed_count']} of {view['cut_expected_count']} rows)"
    )
    print(f"  failed refreshes: {view['failed_refreshes'] or 'none'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
