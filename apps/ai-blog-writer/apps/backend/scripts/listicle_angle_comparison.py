#!/usr/bin/env python
"""Run one evaluation case's searches for real, under a stated spend cap.

This is the paid half of the plan's phase 5, and it is a separate script rather
than a route because nothing should be able to start it by accident. It buys
one grounded search per angle per commission, against the same execution layer
the pipeline uses.

It refuses to run without `--i-know-this-costs-money`. That is not ceremony:
the only path in this app that reaches the web is a live Gemini grounding call,
this repository runs live Stripe on the same machine, and a script that quietly
spends is the kind of thing that gets run at three in the morning by someone
who wanted to see what it printed.

Without that flag it produces a MANIFEST: the exact prompts it would send, how
many provider calls that is at worst, and every version and setting the run
would be recorded under. Read the manifest, then authorise the budget, then
run. The verified plan of 2026-09-09 asks for that order explicitly, and it is
the only way the number in the authorisation is a number about this run.

The cap counts PROVIDER CALLS, not angles. `run_one_angle` retries a failed
call up to three times, so eight angles is up to twenty-four requests, and a
cap on angles is a cap on the wrong thing. The counter sits at the dispatch and
raises rather than continuing.

Read before running:

- The plan's own sequencing. Do not buy a quality comparison until identity
  handling and result recording are trustworthy, because otherwise the
  measurement measures the bug.
- The adoption rule. Agree the numerical thresholds BEFORE the run. Thresholds
  chosen afterwards are chosen to flatter whatever came back.
- What this cannot establish: whether a returned place is real, currently open,
  or worth writing about. Receiving a search result is not verification, and
  this script reports discovery only.

    PYTHONPATH=apps/backend:packages/shared/src:packages/utils/src \
        .venv/bin/python apps/backend/scripts/listicle_angle_comparison.py --list

    PYTHONPATH=apps/backend:packages/shared/src:packages/utils/src \
        .venv/bin/python apps/backend/scripts/listicle_angle_comparison.py \
        --case narrow-hotels --label after \
        --angles "aparthotels in Lima with monthly rates and kitchens" \
        --angles "hotels in Lima in converted republican-era casonas" \
        --roles broad,distinctive \
        --i-know-this-costs-money
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = Path(__file__).resolve().parents[3]
# The same three entries `pyproject.toml` puts on pytest's path. `utils` is a
# workspace package, not an installed one, and every import below dies without
# it.
for entry in (ROOT, REPO / "packages" / "shared" / "src", REPO / "packages" / "utils" / "src"):
    if str(entry) not in sys.path:
        sys.path.insert(0, str(entry))

from app.features.listicle_pipeline.evaluation import (  # noqa: E402
    CASES,
    CASES_BY_KEY,
    REPORTED_OUTCOMES,
)
from app.features.listicle_pipeline.search import (  # noqa: E402
    AngleRequest,
    contribution_of,
    role_allowances,
    run_search_order,
)


class BudgetExhausted(RuntimeError):
    """The run reached its provider-call cap and stopped.

    Raised at the dispatch rather than checked between angles, because the
    thing that overruns a budget is the retry inside one angle, not the angle
    count the operator typed.
    """


class Dispatcher:
    """The one path in this app that reaches the web, counted and receipted.

    Every request is recorded before it is sent -- a request whose answer never
    arrives may still have been charged for, and a receipt written only on
    success is a receipt that omits exactly the calls nobody can account for.
    """

    def __init__(self, max_calls: int) -> None:
        self.max_calls = max_calls
        self.calls: list[dict] = []

    def __call__(self, prompt: str) -> tuple[str, list[str], int | None, list[str]]:
        from app.shared.model_calls import grounded_text
        from app.features.listicle_pipeline.search import (
            SEARCH_MAX_TOKENS,
            SEARCH_TIMEOUT_SECONDS,
        )

        if len(self.calls) >= self.max_calls:
            raise BudgetExhausted(
                f"{len(self.calls)} provider calls is the cap for this run."
            )
        receipt = {
            "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "prompt": prompt,
            "outcome": "sent",
            "tokens": None,
            "rows_text": "",
            "source_urls": [],
            "source_titles": [],
        }
        self.calls.append(receipt)
        try:
            result = grounded_text(
                "listicle.search",
                prompt,
                max_tokens=SEARCH_MAX_TOKENS,
                timeout_seconds=SEARCH_TIMEOUT_SECONDS,
                endpoint="generateContent:googleSearch",
            )
        except Exception as error:
            receipt["outcome"] = f"failed: {type(error).__name__}"
            raise
        if result is None:
            receipt["outcome"] = "empty"
            raise RuntimeError("The grounded search returned nothing.")
        receipt.update(
            {
                "outcome": "answered",
                "tokens": result.total_tokens,
                # The raw reply, kept whole. A comparison that cannot be
                # re-read from what the provider actually said is a comparison
                # nobody can check afterwards.
                "rows_text": result.text,
                "source_urls": list(result.source_urls),
                "source_titles": list(getattr(result, "source_titles", []) or []),
            }
        )
        return (
            result.text,
            list(result.source_urls),
            result.total_tokens,
            list(getattr(result, "source_titles", []) or []),
        )


def _resolved_model() -> str:
    """Which model the gateway would actually answer this job with.

    Recorded on the run rather than assumed. "The same model in both arms" is a
    condition of the comparison, and it is only checkable if each arm wrote
    down what it got.
    """
    try:
        from app.shared.model_calls import resolve

        return str(resolve("listicle.search"))
    except Exception:  # pragma: no cover -- the gateway is not always reachable
        return "unknown"


def _requests_for(case, angles: list[str], roles: list[str]):
    allowances = role_allowances(case.target_count, roles)
    return [
        AngleRequest(
            angle_id=f"a{index + 1}",
            text=text,
            role=roles[index],
            wanted=allowances[index],
        )
        for index, text in enumerate(angles)
    ]


def _place_of(case) -> str:
    """Where this case searches, stated.

    Never parsed off the end of the seed. "The 20 best cevicherias in Lima" and
    "The 20 best cevicherias in Lima's old centre" split differently on " in ",
    and a place read wrong is every search in the case run against the wrong
    city.
    """
    if not case.place:
        raise ValueError(
            f"Case {case.key!r} has no place. Add one rather than reading it "
            "off the title."
        )
    return case.place


def _manifest(case, requests, max_calls: int) -> dict:
    """Exactly what a run would send, and the worst it could cost.

    Produced before any authorisation, because a budget agreed against a
    guess is not a budget agreed against this run.
    """
    from app.features.listicle_pipeline.search import (
        POOLING_VERSION,
        SEARCH_ATTEMPTS,
        build_search_prompt,
    )

    place = _place_of(case)
    prompts = [
        build_search_prompt(
            request.text,
            kind=case.kind,
            place=place,
            exclusions=case.exclusions,
            standard=case.standard,
            wanted=request.wanted,
            role=request.role,
            subject=case.subject,
        )
        for request in requests
    ]
    worst = len(requests) * SEARCH_ATTEMPTS
    return {
        "case": case.key,
        "place": place,
        "kind": case.kind,
        "subject": case.subject,
        "target": case.target_count,
        "standard": case.standard,
        "exclusions": case.exclusions,
        "angles": [
            {
                "angle_id": request.angle_id,
                "text": request.text,
                "role": request.role,
                "wanted": request.wanted,
                "prompt": prompt,
            }
            for request, prompt in zip(requests, prompts)
        ],
        "provider_calls_at_best": len(requests),
        # One invocation is up to `SEARCH_ATTEMPTS` requests. This is the number
        # the budget has to cover, and it is not the angle count.
        "provider_calls_at_worst": worst,
        "cap_enforced_at_dispatch": max_calls,
        "resolved_model": _resolved_model(),
        "pooling_version": POOLING_VERSION,
        "search_prompt_version": SEARCH_PROMPT_VERSION,
        "judged_by": list(case.judged_by),
        "outcomes_still_to_be_judged": {
            name: reason
            for name, reason in REPORTED_OUTCOMES
            if name not in {"contribution", "spend"}
        },
    }


# Which version of the search prompt a run was bought under. Bumped by hand
# when the prompt changes, and recorded on every run: two arms compared across
# a prompt change are not two arms of one comparison.
SEARCH_PROMPT_VERSION = "2026-09-09"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--list", action="store_true", help="Show the cases and stop.")
    parser.add_argument("--case", help="Which evaluation case to run.")
    parser.add_argument(
        "--angles",
        action="append",
        default=[],
        help="One angle, as it would be searched. Repeat per angle.",
    )
    parser.add_argument(
        "--roles",
        default="",
        help="Comma-separated roles, one per angle. Defaults to all broad.",
    )
    parser.add_argument(
        "--max-searches",
        type=int,
        default=8,
        help="Hard cap on angles in one invocation.",
    )
    parser.add_argument(
        "--max-calls",
        type=int,
        default=0,
        help=(
            "Hard cap on PROVIDER CALLS, enforced at each dispatch. Defaults to "
            "angles x the retry limit, which is the worst case."
        ),
    )
    parser.add_argument(
        "--label", default="", help="A word for this arm, e.g. 'before' or 'after'."
    )
    parser.add_argument(
        "--i-know-this-costs-money",
        action="store_true",
        dest="confirmed",
        help="Required. Every angle is at least one live grounded search.",
    )
    args = parser.parse_args()

    if args.list or not args.case:
        for case in CASES:
            print(f"{case.key:22} {case.seed}")
            for line in case.judged_by:
                print(f"{'':22} - {line}")
        return 0

    case = CASES_BY_KEY.get(args.case)
    if case is None:
        print(f"No case called {args.case!r}.", file=sys.stderr)
        return 2
    if not args.angles:
        print("Give at least one --angles.", file=sys.stderr)
        return 2
    if len(args.angles) > args.max_searches:
        print(
            f"{len(args.angles)} angles is above the cap of {args.max_searches}.",
            file=sys.stderr,
        )
        return 2

    roles = (
        [r.strip() for r in args.roles.split(",") if r.strip()]
        if args.roles
        else ["broad"] * len(args.angles)
    )
    if len(roles) != len(args.angles):
        print("One role per angle, or none at all.", file=sys.stderr)
        return 2

    requests = _requests_for(case, args.angles, roles)
    from app.features.listicle_pipeline.search import SEARCH_ATTEMPTS

    max_calls = args.max_calls or len(requests) * SEARCH_ATTEMPTS
    manifest = _manifest(case, requests, max_calls)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ")
    out = REPO / "docs" / "audits"
    out.mkdir(parents=True, exist_ok=True)

    if not args.confirmed:
        name = (
            f"listicle-angle-manifest-{case.key}-{args.label or 'run'}-{stamp}.json"
        )
        (out / name).write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
        print(
            f"DRY RUN. {len(requests)} angles, "
            f"{manifest['provider_calls_at_worst']} provider calls at worst, "
            f"model {manifest['resolved_model']}."
        )
        print(f"Manifest written to docs/audits/{name}")
        print("Authorise the budget against that file, then re-run with "
              "--i-know-this-costs-money.")
        return 0

    dispatcher = Dispatcher(max_calls)
    place = _place_of(case)
    stopped = ""
    try:
        candidates, results = run_search_order(
            requests,
            kind=case.kind,
            place=place,
            target_items=case.target_count,
            exclusions=case.exclusions,
            standard=case.standard,
            research=dispatcher,
        )
    except BudgetExhausted as error:
        # Recorded, not swallowed. A run that stopped at its cap has bought
        # everything up to that point, and reporting it as a failed run hides
        # spend that actually happened.
        stopped = str(error)
        candidates, results = [], []

    payload = {
        "case": case.key,
        "label": args.label,
        "ran_at": stamp,
        "manifest": manifest,
        "stopped_at_cap": stopped,
        "target": case.target_count,
        "found": len(candidates),
        "shortfall": max(0, case.target_count - len(candidates)),
        "uncertain_identity": sum(1 for c in candidates if c.possible_duplicates),
        # Every request that reached the provider, in order, with what came
        # back. This is what a later reader checks the numbers against.
        "provider_calls": dispatcher.calls,
        "provider_calls_made": len(dispatcher.calls),
        "angles": [
            {
                "angle_id": result.angle_id,
                "angle": result.angle,
                "role": result.role,
                "wanted": result.wanted,
                "rows": result.rows,
                "sources": result.sources,
                "sources_named": list(result.source_titles),
                "failed": result.failed,
                "reason": result.reason,
                "provider_calls": [
                    {"at": call.at, "outcome": call.outcome, "detail": call.detail}
                    for call in result.provider_calls
                ],
                "found": contribution_of(candidates, result.angle)[0],
                "shared": contribution_of(candidates, result.angle)[1],
                "exclusive": contribution_of(candidates, result.angle)[2],
            }
            for result in results
        ],
        "candidates": [
            {
                "candidate_id": c.candidate_id,
                "name": c.name,
                "district": c.district,
                "found_by": list(c.found_by),
                "possible_duplicates": list(c.possible_duplicates),
                "sightings": [
                    {
                        "sighting_id": s.sighting_id,
                        "angle": s.angle,
                        "name": s.name,
                        "evidence": s.evidence,
                    }
                    for s in c.sightings
                ],
                # Filled by a person, against the source pages rather than
                # against the evidence sentence a search wrote. Unknown is not
                # a pass.
                "judged": {"eligible": "", "why": "", "source": ""},
            }
            for c in candidates
        ],
        # Recorded as unanswered rather than omitted. Every one of these has to
        # be filled in by a person reading the run; a report that silently
        # leaves out the unflattering half is not a report.
        "outcomes_still_to_be_judged": {
            name: reason
            for name, reason in REPORTED_OUTCOMES
            if name not in {"contribution", "spend"}
        },
        "judged_by": list(case.judged_by),
    }

    name = f"listicle-angle-comparison-{case.key}-{args.label or 'run'}-{stamp}.json"
    (out / name).write_text(json.dumps(payload, indent=2, ensure_ascii=False))
    print(
        f"{len(candidates)} places from {len(results)} searches, "
        f"{len(dispatcher.calls)} provider calls -> docs/audits/{name}"
    )
    if stopped:
        print(stopped, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
