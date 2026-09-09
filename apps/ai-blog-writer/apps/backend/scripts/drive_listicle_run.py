#!/usr/bin/env python
"""Drive one real listicle run from the command line, a turn at a time.

The same code the HTTP routes call -- `service` plus `api._base_dependencies()`
-- with no server, no auth and no browser. This is how both real runs of
2026-09-08 were driven, and it is the fastest way to exercise the pipeline
against a live model.

It spends real money: the seed lookup, every interview turn, and one grounded
web search per angle. There is no confirmation prompt, because every command
here is one the operator typed deliberately. `search` is the expensive one.

    cd apps/ai-blog-writer
    set -a && . ./apps/backend/.env && set +a
    export PYTHONPATH=apps/backend:packages/shared/src:packages/utils/src

    .venv/bin/python apps/backend/scripts/drive_listicle_run.py \
        start "The 40 best cevicherias in Lima"
    .venv/bin/python apps/backend/scripts/drive_listicle_run.py \
        answer <run_id> "the answer, written as a statement"
    .venv/bin/python apps/backend/scripts/drive_listicle_run.py order <run_id>
    .venv/bin/python apps/backend/scripts/drive_listicle_run.py search <run_id>

Answering the angle question sends the picker's records alongside the text, as
the screen does. Build them from `options` in the previous turn's output:

    answer <run_id> "$(cat lines.txt)" "$(cat selections.json)"

where `selections.json` is a list of
`{text, angle_id, shape_key, group, role, edited, custom}`. `group` may be left
empty -- the catalogue fills it, and a value from a model is not trusted.

Two things to know before driving one:

**Answer as a statement, never as a reply.** The answer is stored verbatim and
reaches the searches as the operator's own words. "Yes, that" and "as you said"
are recorded as the brief material, and they say nothing.

**The recommendation is an answer, not part of the question.** It arrives in
the operator's box for them to accept or correct. Read the question, decide
what is true, and write that.
"""

from __future__ import annotations

import json
import sys
import textwrap
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = Path(__file__).resolve().parents[3]
for entry in (
    ROOT,
    REPO / "packages" / "shared" / "src",
    REPO / "packages" / "utils" / "src",
):
    if str(entry) not in sys.path:
        sys.path.insert(0, str(entry))


def _deps():
    import app.features.listicle_pipeline.api as api

    return api._base_dependencies()


def _wrap(text: str, indent: str = "    ") -> str:
    out: list[str] = []
    for para in str(text).split("\n"):
        out.extend(
            textwrap.wrap(para, 96, initial_indent=indent, subsequent_indent=indent)
            or [indent.rstrip()]
        )
    return "\n".join(out)


def show(state) -> None:
    print(f"\nRUN {state.run_id}   status={state.status}")
    print(f"covered: {', '.join(state.markers_covered) or '(none)'}")
    missing = [k for k in state.marker_keys if k not in state.markers_covered]
    print(f"missing: {', '.join(missing) or '(none)'}")
    if state.lookups:
        print(f"lookups so far: {state.lookups}")
    if state.pending is not None:
        pending = state.pending
        print(f"\nASKS ABOUT: {pending.asks_about}")
        print("QUESTION:")
        print(_wrap(pending.ask))
        if pending.pushback:
            print("PUSHBACK:")
            print(_wrap(pending.pushback))
        # Printed as what it is: a proposed answer, not a second question.
        print("ITS PROPOSED ANSWER (accept it or write your own):")
        print(_wrap(pending.recommendation))
        if pending.options:
            print(f"\nOPTIONS ({len(pending.options)}):")
            for option in pending.options:
                flag = "PICKED" if option.recommended else "      "
                print(
                    f"  [{flag}] shape={option.shape or '-':<20} "
                    f"role={option.role or '-':<12}"
                )
                print(_wrap(option.text, "           "))
    if state.status == "agreed":
        print("\nCONSENSUS:")
        print(_wrap(state.consensus))


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    command = sys.argv[1]

    from app.features.listicle_pipeline import service, spec

    if command == "start":
        state = service.start(sys.argv[2], _deps())
        print("=== WHAT IT LOOKED UP BEFORE ASKING ANYTHING ===")
        print(_wrap(state.research_digest[:3000] or "(nothing)"))
        show(state)
    elif command == "answer":
        run_id, text = sys.argv[2], sys.argv[3]
        selections = json.loads(sys.argv[4]) if len(sys.argv) > 4 else None
        show(service.answer(run_id, text, _deps(), selections))
    elif command == "show":
        show(service.get(sys.argv[2]))
    elif command == "digest":
        print(service.get(sys.argv[2]).research_digest)
    elif command == "order":
        order = service.order(sys.argv[2])
        if order is None:
            print("This interview has not agreed a search order yet.")
            return 1
        print(spec.summary_of(order))
        print(
            f"\nplanned capacity: {spec.planned_capacity(order)} "
            f"vs target {order.target_count}"
        )
        for angle in order.angles:
            print(
                f"  {angle.shape_key or '(custom)':<20} {angle.group or '-':<12} "
                f"{angle.role:<12} asks {angle.wanted}"
            )
    elif command == "search":
        import app.features.listicle_pipeline.api as api

        only = sys.argv[3].split(",") if len(sys.argv) > 3 and sys.argv[3] else None
        payload = service.search(sys.argv[2], api._search_call, only=only)
        print(json.dumps(payload, indent=2, ensure_ascii=False))
    elif command == "report":
        # The three numbers worth reading, without the whole payload.
        found = service.progress(sys.argv[2])
        if found is None:
            print("Nothing has been searched for this run yet.")
            return 1
        print(
            f"found {found['found']} of {found['target']} | "
            f"shortfall {found['shortfall']} | rows {found['rows_returned']} | "
            f"uncertain identity {found['uncertain_identity']}"
        )
        print(f"\n{'rows':>4} {'shared':>6} {'ONLY':>4}  {'role':<12} angle")
        for angle in found["angles"]:
            print(
                f"{angle['rows']:>4} {angle['shared']:>6} {angle['exclusive']:>4}  "
                f"{angle['role']:<12} {angle['angle'][:60]}"
            )
        named = sorted({t for a in found["angles"] for t in a.get("sources_named", [])})
        print(f"\n{len(named)} publications: {', '.join(named)}")
        print()
        for index, candidate in enumerate(found["candidates"], 1):
            duplicate = (
                "  [dup? " + ", ".join(candidate["possible_duplicates"]) + "]"
                if candidate["possible_duplicates"]
                else ""
            )
            print(
                f"{index:>3}. x{candidate['overlap']}  {candidate['name']} "
                f"({candidate['district'] or '-'}){duplicate}"
            )
    else:
        print(f"unknown command {command!r}")
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
