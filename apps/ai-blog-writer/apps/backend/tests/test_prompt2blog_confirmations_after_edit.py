"""What a hand edit does to the checking a person already did.

Dropping a confirmation whose passage changed is right and stays: it is the
one thing on the provenance screen that says a human read this against its
source, and keeping it beside prose that has since moved would be worse than
having none.

Dropping it in silence is the part that was wrong.
"""

from __future__ import annotations

from app.core import write_artifact, write_status
from app.features.prompt2blog.provenance import (
    invalidated_confirmation_count,
    prune_confirmations,
    segment_passages,
)
from tests.prompt2blog_test_support import response_payload

ARTICLE = (
    "The direct answer.\n\n"
    "## Prices\n\nA costs $20.\n\n"
    "## Getting there\n\nThe bus runs hourly.\n"
)
EDITED = ARTICLE.replace("A costs $20.", "A is $20.")


def _confirmations(markdown: str, *hashes: str) -> dict:
    return {
        "confirmations": [
            {
                "passage_hash": passage_hash,
                "source_kind": "claim",
                "source_id": "c1",
                "reviewer": "staff-1",
                "confirmed_at": "2026-09-07T00:00:00Z",
            }
            for passage_hash in hashes
        ]
    }


def _hash_of(markdown: str, needle: str) -> str:
    return next(
        passage.text_hash
        for passage in segment_passages(markdown)
        if needle in passage.text
    )


def test_an_edit_invalidates_the_confirmation_on_that_passage():
    stored = _confirmations(ARTICLE, _hash_of(ARTICLE, "A costs $20."))

    assert len(prune_confirmations(stored, ARTICLE).confirmations) == 1
    assert invalidated_confirmation_count(stored, ARTICLE) == 0

    assert prune_confirmations(stored, EDITED).confirmations == []
    assert invalidated_confirmation_count(stored, EDITED) == 1


def test_confirmations_on_untouched_passages_survive():
    stored = _confirmations(
        ARTICLE,
        _hash_of(ARTICLE, "A costs $20."),
        _hash_of(ARTICLE, "The bus runs hourly."),
    )

    live = prune_confirmations(stored, EDITED)

    assert len(live.confirmations) == 1
    assert invalidated_confirmation_count(stored, EDITED) == 1


def test_an_undo_brings_the_confirmation_back():
    """They are filtered on read, never deleted, so restoring the prose
    restores the checking that was done against it."""
    stored = _confirmations(ARTICLE, _hash_of(ARTICLE, "A costs $20."))

    assert invalidated_confirmation_count(stored, EDITED) == 1
    assert invalidated_confirmation_count(stored, ARTICLE) == 0
    assert len(prune_confirmations(stored, ARTICLE).confirmations) == 1


def test_the_route_reports_how_much_checking_an_edit_undid(isolated_db):
    from app.features.prompt2blog.api import runs as runs_api
    from app.features.prompt2blog.run_recorder import RunRecorder
    from app.features.prompt2blog.provenance import PROVENANCE_STAGE

    write_status(
        "r-conf",
        {
            "run_id": "r-conf",
            "state": "completed",
            "stage": "complete",
            "error": None,
            "updated_at": "2026-09-07T00:00:00Z",
        },
        feature="prompt2blog",
    )
    write_artifact(
        "r-conf", {"markdown": ARTICLE, "pipeline_v3": {"run_id": "r-conf"}}
    )
    from app.core import write_stage_result

    write_stage_result(
        "r-conf",
        "pipeline_input_v3",
        {"data": {"packet": {"facts": [{"claim_id": "c1", "text": "A costs $20."}]}}},
    )
    RunRecorder().record_stage(
        "r-conf",
        PROVENANCE_STAGE,
        _confirmations(ARTICLE, _hash_of(ARTICLE, "A costs $20.")),
    )

    clean = response_payload(runs_api.get_provenance("r-conf"))
    assert clean["summary"]["invalidated_confirmations"] == 0

    # The article is edited, exactly as a hand edit would leave it.
    write_artifact(
        "r-conf", {"markdown": EDITED, "pipeline_v3": {"run_id": "r-conf"}}
    )
    after = response_payload(runs_api.get_provenance("r-conf"))

    assert after["summary"]["invalidated_confirmations"] == 1
