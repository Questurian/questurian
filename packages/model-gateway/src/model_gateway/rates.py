"""What each model costs, and the evidence that it costs that.

This is the rate table. Until now there were three, and they disagreed: the
Python table that actually prices a call, the dashboard's published card, and
a third that labels a button in the Prompt2Blog UI. The 3.x-to-2.5 sweep left
one of them holding 3.x prices under 2.5 names -- quoting $2.00 per million
for a model that costs $1.25 -- and nothing caught it, because nothing
compared them.

Every rate carries the date it was checked and the page it was checked
against. A rate nobody has verified is a number that looks like evidence, and
an unverified rate that happens to be wrong makes every cost built on it
wrong in the same direction, silently.

Two caveats that outlive any single verification:

* Gemini 2.5 Flash is on introductory pricing **through 2026-12-31**, after
  which input and output both double. This table will silently understate
  every Flash call from 2027-01-01 until someone edits it.
* These are Gemini API list rates. Calls go through Vertex AI, which bills
  under its own SKUs. The two have matched for these models but are not
  guaranteed to.

Rates that nothing calls any more stay here, marked ``in_use=False``. Stored
runs were priced with them, and a rate table that forgets is a receipt that
changes after the fact.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

GEMINI_API_PRICING = "https://ai.google.dev/gemini-api/docs/pricing"
GOOGLE_MAPS_PRICING = "https://developers.google.com/maps/billing-and-pricing/pricing"

# When every rate below was last checked against its source.
VERIFIED_ON = "2026-09-04"

# Input tokens above which a tiering model switches to its large-context
# rates. Google applies one threshold across the models that tier at all.
LARGE_CONTEXT_THRESHOLD = 200_000


@dataclass(frozen=True)
class ModelRate:
    """USD per million tokens, plus the provenance of those numbers."""

    model: str
    input_per_million: float
    output_per_million: float
    cached_input_per_million: float
    large_input_per_million: float | None = None
    large_output_per_million: float | None = None
    large_cached_input_per_million: float | None = None
    large_context_threshold: int | None = None
    verified_on: str = VERIFIED_ON
    source: str = GEMINI_API_PRICING
    # False for models nothing calls any more, kept to price stored runs.
    in_use: bool = True
    # Set when the rate is known to change on a date.
    note: str | None = None


_RATES: tuple[ModelRate, ...] = (
    ModelRate(
        model="gemini-2.5-pro",
        input_per_million=1.25,
        output_per_million=10.0,
        cached_input_per_million=0.125,
        large_input_per_million=2.5,
        large_output_per_million=15.0,
        large_cached_input_per_million=0.25,
        large_context_threshold=LARGE_CONTEXT_THRESHOLD,
    ),
    ModelRate(
        model="gemini-2.5-flash",
        input_per_million=0.3,
        output_per_million=2.5,
        cached_input_per_million=0.03,
    ),
    ModelRate(
        model="gemini-2.5-flash-lite",
        input_per_million=0.1,
        output_per_million=0.4,
        cached_input_per_million=0.01,
    ),
    # Below here: nothing calls these any more.
    ModelRate(
        model="gemini-3.1-pro-preview",
        input_per_million=2.0,
        output_per_million=12.0,
        cached_input_per_million=0.2,
        large_input_per_million=4.0,
        large_output_per_million=18.0,
        large_cached_input_per_million=0.4,
        large_context_threshold=LARGE_CONTEXT_THRESHOLD,
        in_use=False,
    ),
    ModelRate(
        model="gemini-3.7-flash",
        input_per_million=0.75,
        output_per_million=3.75,
        cached_input_per_million=0.075,
        in_use=False,
        note="Introductory rate. Doubles to $1.50 / $7.50 on 2027-01-01.",
    ),
    ModelRate(
        model="gemini-3.5-flash",
        input_per_million=1.5,
        output_per_million=9.0,
        cached_input_per_million=0.15,
        in_use=False,
    ),
    ModelRate(
        model="gemini-3.5-flash-lite",
        input_per_million=0.3,
        output_per_million=2.5,
        cached_input_per_million=0.03,
        in_use=False,
    ),
    ModelRate(
        model="gemini-3.1-flash-lite",
        input_per_million=0.25,
        output_per_million=1.5,
        cached_input_per_million=0.025,
        in_use=False,
    ),
)

MODEL_RATES: dict[str, ModelRate] = {rate.model: rate for rate in _RATES}


@dataclass(frozen=True)
class UnpriceableProvider:
    """A provider whose calls are reported with a duration and no cost.

    Listed because absence from the rate table is otherwise indistinguishable
    from an oversight.
    """

    provider: str
    reason: str
    source: str = ""


UNPRICEABLE_PROVIDERS: tuple[UnpriceableProvider, ...] = (
    UnpriceableProvider(
        provider="google-places",
        reason=(
            "Billed per request and per field group, not per token. Atmosphere "
            "fields (rating, reviews, price_level) are charged on top of the "
            "basic lookup."
        ),
        source=GOOGLE_MAPS_PRICING,
    ),
    UnpriceableProvider(
        provider="claude-cli",
        reason=(
            "Runs on a Claude subscription, not per-token billing. The CLI "
            "reports a cost figure that does not correspond to money owed, so "
            "it is ignored."
        ),
    ),
)

UNPRICEABLE_PROVIDER_NAMES = frozenset(
    entry.provider for entry in UNPRICEABLE_PROVIDERS
)


def rate_for(model_name: str) -> ModelRate | None:
    """The rate for a model, or None when the table has never been told."""
    return MODEL_RATES.get(model_name)


def estimated_cost(
    *,
    model_name: str,
    input_tokens: int,
    output_tokens: int,
    cached_input_tokens: int,
) -> float | None:
    """What a call cost, or None when no rate exists for the model.

    None rather than 0.0 on purpose. A zero is a claim that the call was free;
    the absence of a rate is a claim that nobody knows, and those must not
    look the same on a cost chart.
    """
    rate = MODEL_RATES.get(model_name)
    if rate is None:
        return None

    threshold = rate.large_context_threshold
    use_large = threshold is not None and input_tokens > threshold

    input_rate = (
        rate.large_input_per_million
        if use_large and rate.large_input_per_million is not None
        else rate.input_per_million
    )
    output_rate = (
        rate.large_output_per_million
        if use_large and rate.large_output_per_million is not None
        else rate.output_per_million
    )
    cached_input_rate = (
        rate.large_cached_input_per_million
        if use_large and rate.large_cached_input_per_million is not None
        else rate.cached_input_per_million
    )

    uncached_input_tokens = max(0, input_tokens - cached_input_tokens)
    return (
        uncached_input_tokens * input_rate
        + cached_input_tokens * cached_input_rate
        + output_tokens * output_rate
    ) / 1_000_000


def rates_payload() -> dict[str, Any]:
    """The whole table, shaped for the dashboard's Rates tab."""
    return {
        "verifiedOn": VERIFIED_ON,
        "models": [
            {
                "model": rate.model,
                "input": rate.input_per_million,
                "output": rate.output_per_million,
                "cachedInput": rate.cached_input_per_million,
                "largeInput": rate.large_input_per_million,
                "largeOutput": rate.large_output_per_million,
                "largeCachedInput": rate.large_cached_input_per_million,
                "largeContextThreshold": rate.large_context_threshold,
                "verifiedOn": rate.verified_on,
                "source": rate.source,
                "inUse": rate.in_use,
                "note": rate.note,
            }
            for rate in _RATES
        ],
        "unpriceable": [
            {
                "provider": entry.provider,
                "reason": entry.reason,
                "source": entry.source,
            }
            for entry in UNPRICEABLE_PROVIDERS
        ],
        "appliedBy": "packages/model-gateway/src/model_gateway/rates.py",
    }
