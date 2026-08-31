"""Replay a recorded research failure against the contract, offline and free.

Structuring failures used to cost a run each to diagnose: the only way to see
what the model sent was to send it again. Every stage now records the payload
it choked on, so the payload can be pushed through the real normaliser and the
real contract here, in a second, for nothing.

    PYTHONPATH=apps/backend:packages/shared/src:packages/utils/src \\
        .venv/bin/python apps/backend/scripts/replay_dossier.py [run_id]

Prints either what it validates to, or every distinct violation with a count.
Recorded payloads are truncated, so a trailing record may be cut off; the
recovery below closes the JSON at the last complete one.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from pydantic import ValidationError

from app.core import read_stage_result
from app.features.prompt2blog.contracts_v4 import EvidencePackage
from app.features.prompt2blog.research_v4 import RESEARCH_STAGE, _normalised_evidence


def _recovered(raw: str) -> dict:
    for cut in range(len(raw), 200, -1):
        for tail in ("", "]}", '"}]}', '"}]}}'):
            try:
                return json.loads(raw[:cut] + tail)
            except Exception:
                continue
    raise SystemExit("Could not recover any JSON from the recorded payload.")


def main() -> None:
    if len(sys.argv) > 1:
        stored = (read_stage_result(sys.argv[1], RESEARCH_STAGE) or {}).get("data") or {}
        raw = stored.get("unusable_response") or ""
    else:
        raw = Path("/tmp/dossier_raw.txt").read_text()
    if not raw:
        raise SystemExit("No recorded payload on that run.")

    payload = _normalised_evidence(_recovered(raw))
    payload["schema_version"] = 4
    payload["work_order_fingerprint"] = "wo-replay"
    try:
        package = EvidencePackage.model_validate(payload)
    except ValidationError as error:
        counts: dict[tuple[str, str], int] = {}
        for item in error.errors():
            where = ".".join(str(part) for part in item["loc"][:1] + item["loc"][2:])
            counts[(where, item["msg"])] = counts.get((where, item["msg"]), 0) + 1
        print(f"{len(error.errors())} errors, {len(counts)} distinct:")
        for (where, message), count in sorted(counts.items(), key=lambda kv: -kv[1]):
            print(f"  x{count:<4} {where}: {message[:110]}")
        raise SystemExit(1)

    print(
        f"VALIDATES: {len(package.sources)} sources, {len(package.claims)} claims, "
        f"{len(package.requirements)} questions"
    )


if __name__ == "__main__":
    main()
