from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, field
from typing import Any

# Token normalisation, the Vertex rate table and the cost estimator moved to
# app/shared/token_usage.py when the API-usage monitor became a second reader
# of the same provider facts. Re-exported here under the names this module has
# always used, so every existing caller and test is untouched.
from app.shared.token_usage import (  # noqa: F401  (re-exported)
    VERTEX_TOKEN_RATES,
    VertexTokenRate,
    normalize_token_usage,
    token_count as _token_count,
    usage_value as _usage_value,
    estimated_vertex_cost as _estimated_cost,
)

logger = logging.getLogger(__name__)


# What a recorded price is, once there is more than one kind.
COST_BASIS_MEASURED = "measured"
COST_BASIS_RATE_TABLE = "rate-table"

# Set by app/features/prompt2blog/llm.py when the provider reported a price for
# the call it just made. Only the subscription CLI does.
MEASURED_COST_KEY = "measured_cost_usd"


def _measured_cost(raw_usage: Any) -> float | None:
    """A price the provider reported for this exact call, if it reported one.

    Worth preferring over the rate table because it is not an estimate: it is
    what the transport says the call came to. It is still not money leaving an
    account -- subscription calls draw plan allowance rather than billing per
    token -- so it is a notional API-equivalent figure. That distinction belongs
    in what the UI says about the number, not in whether the number is recorded.
    """
    if not isinstance(raw_usage, dict):
        return None
    value = raw_usage.get(MEASURED_COST_KEY)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value) if value >= 0 else None

TOKEN_KEYS = (
    "input_tokens",
    "output_tokens",
    "reasoning_tokens",
    "cached_input_tokens",
    "total_tokens",
)

STAGE_USAGE_KEYS = TOKEN_KEYS + ("calls",)


RATE_TABLE_NOTE = (
    "Standard global Vertex rates checked 2026-08-24; Gemini 3.7 "
    "Flash introductory pricing ends 2026-12-31."
)

# Subscription calls draw the plan holder's allowance rather than billing per
# token, so the CLI's per-call figure is a notional API-equivalent price, not a
# charge. Saying so is the whole point of carrying the basis around: the number
# is real and worth comparing between stacks, and it is not a bill.
MEASURED_COST_NOTE = (
    "Claude figures are the per-call price the Claude Code CLI reported. Those "
    "calls draw your subscription's allowance rather than billing per token, so "
    "the amount is a comparable estimate of what the same work would cost at "
    "API rates -- not a charge."
)


def _cost_basis(bases: set[str]) -> str | None:
    if not bases:
        return None
    if len(bases) == 1:
        return next(iter(bases))
    return "mixed"


def _pricing_note(measured_models: int) -> str:
    if measured_models:
        return f"{RATE_TABLE_NOTE} {MEASURED_COST_NOTE}"
    return RATE_TABLE_NOTE


# Every successful model call appends one entry here and nothing ever replaces
# one. Stage rows, attempt rows and the run total are all sums over these
# entries, so a stage that runs twice cannot overwrite its own first receipt --
# the failure that made a 239,610 token run report 209,545.
UNATTRIBUTED_STAGE = "unattributed"

LEDGER_VERSION = 1

ATTEMPT_USAGE_KEYS = STAGE_USAGE_KEYS


def _empty_usage() -> dict[str, int]:
    return dict.fromkeys(STAGE_USAGE_KEYS, 0)


@dataclass
class Prompt2BlogTokenUsageTracker:
    run_id: str | None = None
    successful_calls: int = 0
    measured_calls: int = 0
    by_model: dict[str, dict[str, Any]] = field(default_factory=dict)
    # Append-only. Ordered by the sequence the calls were made in.
    calls: list[dict[str, Any]] = field(default_factory=list)
    stage_attempts: dict[str, int] = field(default_factory=dict)
    current_stage: str | None = None
    current_attempt: int = 0
    _lock: Any = field(
        default_factory=threading.Lock, compare=False, repr=False
    )

    @classmethod
    def from_ledger(cls, ledger: Any) -> "Prompt2BlogTokenUsageTracker":
        """Rebuild a tracker from a ledger an earlier leg of this run wrote.

        A resumed run has to keep counting where the failed one stopped. If it
        started from zero the repair budget would hand out an attempt the run
        could not afford, and the finished article's cost receipt would report
        only the cheap tail rather than what the article really cost.

        The stored call rows are replayed rather than re-priced: each row
        already carries the cost and the basis that were decided when the call
        was made, so a rate-table change between the two legs cannot rewrite
        history. A ledger that is missing or malformed yields an empty tracker,
        which under-counts -- the same direction `run_tokens_spent` is already
        allowed to be wrong in.
        """
        tracker = cls()
        rows = ledger.get("calls") if isinstance(ledger, dict) else None
        if not isinstance(rows, list):
            return tracker
        for row in rows:
            if not isinstance(row, dict):
                continue
            stage = str(row.get("stage") or UNATTRIBUTED_STAGE)
            attempt = _token_count(row.get("attempt")) or 1
            model = str(row.get("model") or "")
            cost = row.get("cost_usd")
            basis = row.get("cost_basis")
            tracker.calls.append(
                {
                    "seq": len(tracker.calls) + 1,
                    "stage": stage,
                    "attempt": attempt,
                    "model": model,
                    **{key: _token_count(row.get(key)) for key in TOKEN_KEYS},
                    "calls": 1,
                    "metered": bool(row.get("metered")),
                    "cost_usd": cost,
                    "cost_basis": basis,
                }
            )
            entry = tracker.calls[-1]
            tracker.successful_calls += 1
            # The next `begin_stage` for this stage opens the attempt after the
            # highest one the earlier leg reached, so a stage that ran before
            # the failure keeps its own row instead of being overwritten.
            tracker.stage_attempts[stage] = max(
                tracker.stage_attempts.get(stage, 0), attempt
            )
            if not entry["metered"]:
                continue
            tracker.measured_calls += 1
            totals = tracker.by_model.setdefault(
                model,
                {
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "reasoning_tokens": 0,
                    "cached_input_tokens": 0,
                    "total_tokens": 0,
                    "calls": 0,
                    "estimated_cost_usd": 0.0,
                    "unpriced_calls": 0,
                    "cost_bases": set(),
                },
            )
            totals["calls"] += 1
            for key in TOKEN_KEYS:
                totals[key] += entry[key]
            if isinstance(cost, (int, float)) and basis in {
                COST_BASIS_MEASURED,
                COST_BASIS_RATE_TABLE,
            }:
                totals["estimated_cost_usd"] += float(cost)
                totals["cost_bases"].add(basis)
            else:
                totals["unpriced_calls"] += 1
        return tracker

    def totals(self) -> dict[str, int]:
        return {
            key: sum(item[key] for item in self.by_model.values())
            for key in STAGE_USAGE_KEYS
        }

    def begin_stage(self, stage: str) -> int:
        """Open a numbered attempt of `stage`; later calls are filed under it.

        Numbering is per stage and per run: the second time the pipeline enters
        the quality audit it opens attempt 2, and attempt 1 keeps its own row.
        """
        attempt = self.stage_attempts.get(stage, 0) + 1
        self.stage_attempts[stage] = attempt
        self.current_stage = stage
        self.current_attempt = attempt
        return attempt

    def attempt_usage(self, stage: str, attempt: int) -> dict[str, int]:
        """What one numbered attempt of one stage spent."""
        row = _empty_usage()
        for entry in self.calls:
            if entry["stage"] != stage or entry["attempt"] != attempt:
                continue
            for key in TOKEN_KEYS:
                row[key] += entry[key]
            row["calls"] += 1
        return row

    def ledger(self) -> dict[str, Any]:
        """The durable record: every call, plus the sums derived from them."""
        return {
            "ledger_version": LEDGER_VERSION,
            "calls": [dict(entry) for entry in self.calls],
            "by_attempt": self._attempt_rows(),
            "by_stage": self._stage_rows(),
            "totals": self.totals(),
            "successful_calls": self.successful_calls,
            "unmetered_calls": self.successful_calls - self.measured_calls,
        }

    def record(
        self,
        model_name: str,
        raw_usage: Any,
        *,
        requested_model: str | None = None,
    ) -> None:
        """Append one successful call. Safe to call from several threads.

        ``model_name`` is the model that answered; ``requested_model`` is the
        one the job asked for. They differ whenever a Claude name is served by
        a Gemini substitute, and until now only the answering model was kept --
        so a run whose whole point was "write this on Claude" recorded itself
        as an ordinary Gemini run and nothing in the receipt disagreed.

        Research runs its grounded searches concurrently, and each of them
        records here from a worker thread. Every mutation below is a
        read-modify-write -- the two counters, the `by_model` totals, and an
        append to `calls` whose `seq` comes from the list's own length -- so
        two interleaving calls would lose a call or hand two of them the same
        sequence number.
        """
        with self._lock:
            self._record_call(model_name, raw_usage, requested_model)

    @staticmethod
    def _substitution_fields(
        model_name: str, requested_model: str | None
    ) -> dict[str, str]:
        """``asked_for``, but only on a call that did not get what it asked for.

        Absent on the ordinary call, so its presence in a ledger is the whole
        signal: something rewrote the model between the job and the provider.
        """
        if not requested_model or requested_model == model_name:
            return {}
        return {"asked_for": requested_model}

    def _record_call(
        self,
        model_name: str,
        raw_usage: Any,
        requested_model: str | None = None,
    ) -> None:
        self.successful_calls += 1
        usage = normalize_token_usage(raw_usage)
        stage = self.current_stage or UNATTRIBUTED_STAGE
        attempt = self.current_attempt or self.stage_attempts.setdefault(stage, 1)
        if usage is None:
            # A call that reported nothing is still a call. Recording it keeps
            # "we spent nothing here" apart from "we were not told", which is
            # what `measurement_status` is read for.
            self.calls.append(
                {
                    "seq": len(self.calls) + 1,
                    "stage": stage,
                    "attempt": attempt,
                    "model": model_name,
                    **self._substitution_fields(model_name, requested_model),
                    **_empty_usage(),
                    "calls": 1,
                    "metered": False,
                    "cost_usd": None,
                    "cost_basis": None,
                }
            )
            return
        measured_cost = _measured_cost(raw_usage)
        self.measured_calls += 1
        totals = self.by_model.setdefault(
            model_name,
            {
                "input_tokens": 0,
                "output_tokens": 0,
                "reasoning_tokens": 0,
                "cached_input_tokens": 0,
                "total_tokens": 0,
                "calls": 0,
                "estimated_cost_usd": 0.0,
                "unpriced_calls": 0,
                "cost_bases": set(),
            },
        )
        totals["calls"] += 1
        for key in (
            "input_tokens",
            "output_tokens",
            "reasoning_tokens",
            "cached_input_tokens",
            "total_tokens",
        ):
            totals[key] += usage[key]
        if measured_cost is not None:
            call_cost: float | None = measured_cost
            basis = COST_BASIS_MEASURED
        else:
            call_cost = _estimated_cost(
                model_name=model_name,
                input_tokens=usage["input_tokens"],
                output_tokens=usage["output_tokens"],
                cached_input_tokens=usage["cached_input_tokens"],
            )
            basis = COST_BASIS_RATE_TABLE
        if call_cost is None:
            totals["unpriced_calls"] += 1
        else:
            totals["estimated_cost_usd"] += call_cost
            totals["cost_bases"].add(basis)
        self.calls.append(
            {
                "seq": len(self.calls) + 1,
                "stage": stage,
                "attempt": attempt,
                "model": model_name,
                **self._substitution_fields(model_name, requested_model),
                **{key: usage[key] for key in TOKEN_KEYS},
                "calls": 1,
                "metered": True,
                "cost_usd": round(call_cost, 6) if call_cost is not None else None,
                "cost_basis": basis if call_cost is not None else None,
            }
        )

    def _attempt_rows(self) -> list[dict[str, Any]]:
        rows: dict[tuple[str, int], dict[str, Any]] = {}
        order: list[tuple[str, int]] = []
        for entry in self.calls:
            key = (entry["stage"], entry["attempt"])
            row = rows.get(key)
            if row is None:
                row = {
                    "stage": entry["stage"],
                    "attempt": entry["attempt"],
                    **_empty_usage(),
                    "cost_usd": 0.0,
                    "unpriced_calls": 0,
                    "first_seq": entry["seq"],
                }
                rows[key] = row
                order.append(key)
            for token_key in TOKEN_KEYS:
                row[token_key] += entry[token_key]
            row["calls"] += 1
            if entry["cost_usd"] is None:
                row["unpriced_calls"] += 1
            else:
                row["cost_usd"] += entry["cost_usd"]
        # Chronological: the receipt reads as the run happened, so a second
        # attempt sits under the first rather than replacing it.
        return [
            {
                **{
                    key: value
                    for key, value in rows[key].items()
                    if key not in ("cost_usd", "unpriced_calls", "first_seq")
                },
                "cost_usd": (
                    round(rows[key]["cost_usd"], 6)
                    if not rows[key]["unpriced_calls"]
                    else None
                ),
            }
            for key in sorted(order, key=lambda item: rows[item]["first_seq"])
        ]

    def _stage_rows(self) -> list[dict[str, Any]]:
        # `by_attempt` has carried a per-row price since it was written and this
        # has not, so a receipt could say what one attempt of repair cost but
        # never what repair cost -- the exact number anyone deciding whether a
        # stage is worth its budget wants. Priced the same way, including the
        # abstention: a stage holding even one call the provider would not
        # price reports no cost rather than a total that quietly omits it.
        rows: dict[str, dict[str, Any]] = {}
        for entry in self.calls:
            row = rows.setdefault(
                entry["stage"],
                {
                    "stage": entry["stage"],
                    **_empty_usage(),
                    "attempts": 0,
                    "cost_usd": 0.0,
                    "unpriced_calls": 0,
                },
            )
            for token_key in TOKEN_KEYS:
                row[token_key] += entry[token_key]
            row["calls"] += 1
            if entry["cost_usd"] is None:
                row["unpriced_calls"] += 1
            else:
                row["cost_usd"] += entry["cost_usd"]
        for stage, attempts in self.stage_attempts.items():
            row = rows.setdefault(
                stage,
                {
                    "stage": stage,
                    **_empty_usage(),
                    "attempts": 0,
                    "cost_usd": 0.0,
                    "unpriced_calls": 0,
                },
            )
            row["attempts"] = attempts
        for stage, row in rows.items():
            if not row["attempts"]:
                row["attempts"] = max(
                    (
                        entry["attempt"]
                        for entry in self.calls
                        if entry["stage"] == stage
                    ),
                    default=0,
                )
        # Sorted by spend so the stages worth capping or de-thinking are the
        # ones read first.
        return [
            {
                **{
                    key: value
                    for key, value in row.items()
                    if key not in ("cost_usd", "unpriced_calls")
                },
                "cost_usd": (
                    round(row["cost_usd"], 6) if not row["unpriced_calls"] else None
                ),
            }
            for row in sorted(
                rows.values(),
                key=lambda row: (-row["total_tokens"], row["stage"]),
            )
        ]

    def _model_that_answered(self, stage: str) -> str | None:
        """The model that served this stage's last call, from the ledger.

        The three role names in the receipt were read off the run's requested
        routing, and v4 requests no routing at all -- so a finished run
        reported ``{"worker": null, "writer": null, "judge": null}`` and the
        only place the real models existed was the per-call rows nobody reads.
        """
        for entry in reversed(self.calls):
            if entry["stage"] == stage:
                return str(entry["model"])
        return None

    def _busiest_model(self) -> str | None:
        """The model that answered most of this run, by call count.

        Counted over ``calls`` rather than ``by_model``, because a call the
        provider reported no usage for is still a call this run made and
        ``by_model`` only holds the measured ones.
        """
        counts: dict[str, int] = {}
        for entry in self.calls:
            model = str(entry["model"])
            counts[model] = counts.get(model, 0) + 1
        if not counts:
            return None
        return max(counts.items(), key=lambda item: item[1])[0]

    def summary(
        self,
        *,
        stack_id: str | None,
        worker_model: str | None,
        writing_model: str | None,
        audit_model: str | None,
    ) -> dict[str, Any]:
        measured_models = 0
        input_tokens = sum(item["input_tokens"] for item in self.by_model.values())
        output_tokens = sum(item["output_tokens"] for item in self.by_model.values())
        reasoning_tokens = sum(
            item["reasoning_tokens"] for item in self.by_model.values()
        )
        cached_input_tokens = sum(
            item["cached_input_tokens"] for item in self.by_model.values()
        )
        total_tokens = sum(item["total_tokens"] for item in self.by_model.values())
        model_rows: list[dict[str, Any]] = []
        estimated_cost_usd = 0.0
        fully_priced = True
        for model_name, usage in sorted(self.by_model.items()):
            model_cost = usage["estimated_cost_usd"]
            if usage["unpriced_calls"]:
                fully_priced = False
            else:
                estimated_cost_usd += model_cost
            model_rows.append(
                {
                    "model": model_name,
                    **{
                        key: usage[key]
                        for key in (
                            "input_tokens",
                            "output_tokens",
                            "reasoning_tokens",
                            "cached_input_tokens",
                            "total_tokens",
                            "calls",
                        )
                    },
                    "estimated_cost_usd": (
                        round(model_cost, 6) if not usage["unpriced_calls"] else None
                    ),
                    # Where the figure came from, so a reader can tell a rate
                    # table applied to token counts from a price the provider
                    # reported for the call it made.
                    "cost_basis": _cost_basis(usage["cost_bases"]),
                }
            )
            measured_models += 1 if COST_BASIS_MEASURED in usage["cost_bases"] else 0
        stage_rows = self._stage_rows()
        attempt_rows = self._attempt_rows()
        if self.measured_calls == 0:
            measurement_status = "unavailable"
        elif self.measured_calls < self.successful_calls or not fully_priced:
            measurement_status = "partial"
        else:
            measurement_status = "complete"
        return {
            "stack_id": stack_id or "custom",
            # Named from the run's routing when it named one, and otherwise
            # from what the ledger saw answer. A v4 run names nothing.
            "models": {
                "worker": worker_model or self._busiest_model(),
                "writer": (
                    writing_model or self._model_that_answered("stage_v3_compose")
                ),
                "judge": (
                    audit_model
                    or self._model_that_answered("stage_v3_quality_audit")
                ),
            },
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "reasoning_tokens": reasoning_tokens,
            "cached_input_tokens": cached_input_tokens,
            "total_tokens": total_tokens,
            "successful_calls": self.successful_calls,
            "measured_calls": self.measured_calls,
            # A call the provider told us nothing about. Named rather than
            # folded into the totals, because a run with unmetered calls has a
            # floor, not a total.
            "unmetered_calls": self.successful_calls - self.measured_calls,
            "measurement_status": measurement_status,
            # Both are sums over the same ledger, so they agree by construction.
            # Published anyway: a reader who adds the stage rows up should be
            # able to check the headline figure rather than trust it.
            "attributed_total_tokens": sum(
                row["total_tokens"] for row in stage_rows
            ),
            "ledger_version": LEDGER_VERSION,
            "estimated_cost_usd": (
                round(estimated_cost_usd, 6)
                if self.measured_calls and fully_priced
                else None
            ),
            "currency": "USD",
            "by_model": model_rows,
            "by_stage": stage_rows,
            "by_attempt": attempt_rows,
            "pricing_note": _pricing_note(measured_models),
        }


def run_billed_cost_usd(llm: Any) -> float | None:
    """Money this run has actually spent, or None when nothing is counting.

    Only `rate-table` calls. A `measured` price comes from the Claude Code CLI
    and is what the same work would have cost at API rates -- the calls draw the
    plan holder's allowance rather than billing per token, so counting them here
    would refuse a run its repair over money nobody was charged.

    Measured on two full runs: chifa 3750891f spent $0.36 billed beside $2.29
    notional, and ceviche 8a7e9aa4 $0.38 beside $1.97. Both were refused their
    repair by a budget denominated in tokens, in which the free two thirds of
    the run counted the same as the paid third.

    None rather than 0.0 for a caller with no tracker, for the same reason
    `run_tokens_spent` returns None: nothing counting is not nothing spent.
    """
    tracker = getattr(llm, "usage_tracker", None)
    ledger = getattr(tracker, "ledger", None)
    if not callable(ledger):
        return None
    try:
        return sum(
            float(call.get("cost_usd") or 0.0)
            for call in ledger().get("calls", [])
            if call.get("cost_basis") == COST_BASIS_RATE_TABLE
        )
    except Exception as exc:  # pragma: no cover -- telemetry only
        logger.warning("Prompt2Blog cost read failed: %s", exc)
        return None


def run_tokens_spent(llm: Any) -> int | None:
    """Tokens this run has spent so far, or None when nothing is counting.

    The budget gate reads this. It returns None rather than 0 for a caller
    with no tracker -- every test double, and any caller that builds its own
    LLM adapter -- because 0 would read as "nothing spent yet" and hand out an
    attempt the gate was never asked to judge.

    The figure is a floor, not a total: a provider that reports no usage (the
    Claude CLI's subscription calls) contributes a metered zero. Under-counting
    spends an attempt the old code would also have spent, which is the safe
    direction to be wrong in.
    """
    tracker = getattr(llm, "usage_tracker", None)
    totals = getattr(tracker, "totals", None)
    if not callable(totals):
        return None
    try:
        return int(totals().get("total_tokens", 0))
    except Exception as exc:  # pragma: no cover -- telemetry only
        logger.warning("Prompt2Blog token budget read failed: %s", exc)
        return None
