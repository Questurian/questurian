"""Report one external call to the dashboard's usage collector.

Both apps spend money and time in other people's services, and until now only
one of them said so. ai-blog-writer reported five of its call paths; Location
Manager reported none at all, so every alt-text and field-suggestion call it
has ever made is invisible. That was not an oversight anyone could have
avoided: reporting was wired per call site, so a call site nobody remembered
was a call site that reported nothing.

Putting it here fixes the shape of the problem rather than the instance. The
gateway makes the call, so the gateway reports it, and forgetting is no longer
something a caller is able to do.

It is deliberately a *report*, not a dependency:

* Nothing here is on the critical path. The context manager measures a call it
  does not make, and a collector that is down, slow or absent changes nothing
  about the call's result.
* Sending happens on a background thread through a bounded queue. When the
  queue is full events are dropped and counted, because blocking a writing
  model call to record telemetry about it would be an absurd trade.
* Every failure inside this module is swallowed. An observability bug must not
  become a pipeline bug.

Prompt2Blog's per-run token ledger stays exactly where it is. This is a second
reader of the same facts, not a replacement: the ledger's per-run receipt and
the collector's cross-app history answer different questions, and merging them
would make neither trustworthy.

Configuration (all optional -- with no URL set, this module does nothing):

``USAGE_MONITOR_URL``      the collector's ingest endpoint, e.g.
                           ``http://localhost:4500/api/usage/v1/events``
``USAGE_MONITOR_KEY``      sent as ``x-usage-key`` when the collector requires one
``USAGE_MONITOR_SERVICE``  the name this process reports itself as. Defaults to
                           the name for the app whose job is being run, so the
                           two apps stay distinguishable without either having
                           to remember to set it.
``USAGE_MONITOR_TIMEOUT``  per-request timeout in seconds (default 2)
"""


from __future__ import annotations

import atexit
import json
import logging
import os
import queue
import threading
import time
import urllib.error
import urllib.request
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any, Callable, Iterator, Optional

from .faults import provider_fault_kind
from .jobs import APP_ABW, APP_LM, JOBS_BY_ID
from .rates import MODEL_RATES, UNPRICEABLE_PROVIDER_NAMES, estimated_cost
from .tokens import normalize_token_usage

logger = logging.getLogger(__name__)

# What each app calls itself to the collector. ai-blog-writer keeps the name
# its existing rows already carry, so moving to the gateway does not split its
# history in two.
SERVICE_BY_APP = {
    APP_ABW: "abw-backend",
    APP_LM: "lm-alt-text",
}
DEFAULT_SERVICE = "unknown-service"
DEFAULT_TIMEOUT_SECONDS = 2.0

# The queue is bounded so that a stalled collector costs memory once, not
# without limit. 2000 events is minutes of the busiest pipeline.
QUEUE_CAPACITY = 2000
BATCH_SIZE = 100
FLUSH_INTERVAL_SECONDS = 1.0

# The collector truncates too, but sending a megabyte of traceback to be cut
# down at the far end wastes the request.
MAX_ERROR_MESSAGE_CHARS = 1000

PROVIDER_GOOGLE_VERTEX = "google-vertex"
PROVIDER_ANTHROPIC = "anthropic"
PROVIDER_CLAUDE_CLI = "claude-cli"
PROVIDER_UNKNOWN = "unknown"

# Which provider actually served a call, read from the object the LLM factory
# returned. Asking the object is exact; re-deriving it from the model name
# would duplicate `get_vertex_llm`'s routing rule and then drift from it.
_PROVIDER_BY_LLM_CLASS = {
    "ClaudeCliTextLLM": PROVIDER_CLAUDE_CLI,
    "ClaudeTextLLM": PROVIDER_ANTHROPIC,
    "Gemini3ChatTextLLM": PROVIDER_GOOGLE_VERTEX,
    "VertexAI": PROVIDER_GOOGLE_VERTEX,
    "ChatVertexAI": PROVIDER_GOOGLE_VERTEX,
}

# Wire names for the token counts. The values arrive already normalised by
# `app.shared.token_usage`, whose spellings these map onto the contract's.
_TOKEN_WIRE_NAMES = {
    "input": "input_tokens",
    "output": "output_tokens",
    "cachedInput": "cached_input_tokens",
    "reasoning": "reasoning_tokens",
    "total": "total_tokens",
}

COST_BASIS_RATE_TABLE = "rate-table"

# Providers whose calls are never given a price.
#
# The Claude subscription CLI reports a `total_cost_usd`, and it is not a cost.
# It is what those tokens would have cost on the Anthropic API; the actual
# spend is a flat monthly subscription that no per-call figure can be carved
# out of. Reporting it would put a precise, confident, wrong number on the
# dashboard's cost chart and mix it into the same total as real Vertex spend.
# The tokens are real and are reported; the money is not knowable and is not.
UNPRICEABLE_PROVIDERS = UNPRICEABLE_PROVIDER_NAMES

# Why a call carries no price, recorded so the reason survives to the UI.
UNPRICED_REASON_KEY = "unpricedReason"
UNPRICED_SUBSCRIPTION = "subscription-flat-rate"
UNPRICED_NO_RATE = "no-rate-for-model"


def provider_for_llm(llm: Any, model_name: Optional[str] = None) -> str:
    """Name the provider behind an LLM object, falling back to its model name."""
    class_name = type(llm).__name__
    resolved = _PROVIDER_BY_LLM_CLASS.get(class_name)
    if resolved is not None:
        return resolved
    name = (model_name or getattr(llm, "model_name", "") or "").lower()
    if name.startswith("claude"):
        return PROVIDER_ANTHROPIC
    if name.startswith("gemini"):
        return PROVIDER_GOOGLE_VERTEX
    return PROVIDER_UNKNOWN


def normalize_tokens(raw_usage: Any) -> dict[str, int]:
    """Provider token counts, under the contract's field names.

    The counting itself is `app.shared.token_usage.normalize_token_usage` --
    the same function the run ledger uses. This only renames its output for
    the wire. Two provider quirks are why that function is worth deferring to:
    LangChain reports thinking tokens outside `output_tokens` (Google bills
    them at the output rate), and Anthropic's `input_tokens` excludes the
    cache figures that sit beside it. Both mistakes undercount.
    """
    normalized = normalize_token_usage(raw_usage)
    if not normalized:
        return {}
    return {
        wire: normalized[source]
        for wire, source in _TOKEN_WIRE_NAMES.items()
        if normalized.get(source)
    }


@dataclass(frozen=True)
class UsageMonitorConfig:
    url: Optional[str]
    key: Optional[str]
    service: str
    timeout_seconds: float

    @property
    def enabled(self) -> bool:
        return bool(self.url)


def config_from_env() -> UsageMonitorConfig:
    raw_timeout = os.getenv("USAGE_MONITOR_TIMEOUT", "").strip()
    try:
        timeout = float(raw_timeout) if raw_timeout else DEFAULT_TIMEOUT_SECONDS
    except ValueError:
        timeout = DEFAULT_TIMEOUT_SECONDS

    url = os.getenv("USAGE_MONITOR_URL", "").strip() or None
    return UsageMonitorConfig(
        url=url,
        key=os.getenv("USAGE_MONITOR_KEY", "").strip() or None,
        service=os.getenv("USAGE_MONITOR_SERVICE", "").strip() or DEFAULT_SERVICE,
        timeout_seconds=timeout if timeout > 0 else DEFAULT_TIMEOUT_SECONDS,
    )


def service_for(config: UsageMonitorConfig, job_id: Optional[str] = None) -> str:
    """What this process calls itself for one event.

    An explicitly exported ``USAGE_MONITOR_SERVICE`` always wins -- it is the
    only way to name a process the job registry cannot know about. Otherwise
    the name comes from the app that owns the job, so neither app has to
    remember to set it and the two never collapse into one row.
    """
    if config.service != DEFAULT_SERVICE:
        return config.service
    entry = JOBS_BY_ID.get(job_id or "")
    if entry is not None:
        return SERVICE_BY_APP.get(entry.app, DEFAULT_SERVICE)
    return DEFAULT_SERVICE


Transport = Callable[[list[dict[str, Any]]], None]


def http_transport(config: UsageMonitorConfig) -> Transport:
    """POST a batch of events. Raises; the worker decides what to do about it."""

    def send(events: list[dict[str, Any]]) -> None:
        if not config.url:
            return
        body = json.dumps({"events": events}).encode("utf-8")
        request = urllib.request.Request(
            config.url,
            data=body,
            method="POST",
            headers={"content-type": "application/json"},
        )
        if config.key:
            request.add_header("x-usage-key", config.key)
        with urllib.request.urlopen(request, timeout=config.timeout_seconds) as response:
            response.read()

    return send


@dataclass
class CallObservation:
    """The mutable half of one observation, filled in while the call runs."""

    provider: str
    feature: Optional[str] = None
    model: Optional[str] = None
    endpoint: Optional[str] = None
    correlation_id: Optional[str] = None
    metadata: dict[str, Any] = field(default_factory=dict)
    tokens: dict[str, int] = field(default_factory=dict)
    cost_usd: Optional[float] = None
    cost_basis: Optional[str] = None
    http_status: Optional[int] = None

    def record_usage(self, raw_usage: Any) -> None:
        """Take the provider's token counts, and price the call if it can be.

        Accepts the same dict Prompt2Blog's tracker is given, so a call site
        that already computed it passes it to both without reshaping it.

        Pricing follows one rule: **report a number only when it means money
        actually owed.** That gives three outcomes, and the third is the one
        that matters.

        1. A rate exists for the model -> priced from the table, basis
           `rate-table`. This is the real Vertex bill.
        2. No rate for the model -> unpriced, with the reason recorded. Better
           an obvious hole than a plausible zero.
        3. The provider cannot be priced at all -> unpriced on purpose. The
           subscription CLI's own `total_cost_usd` is deliberately ignored
           here; see UNPRICEABLE_PROVIDERS.
        """
        self.tokens.update(normalize_tokens(raw_usage))

        if self.provider in UNPRICEABLE_PROVIDERS:
            self.metadata.setdefault(UNPRICED_REASON_KEY, UNPRICED_SUBSCRIPTION)
            return

        model = self.model
        if not model:
            return
        if model not in MODEL_RATES:
            self.metadata.setdefault(UNPRICED_REASON_KEY, UNPRICED_NO_RATE)
            return

        cost = estimated_cost(
            model_name=model,
            input_tokens=self.tokens.get("input", 0),
            output_tokens=self.tokens.get("output", 0),
            cached_input_tokens=self.tokens.get("cachedInput", 0),
        )
        if cost is None:
            self.metadata.setdefault(UNPRICED_REASON_KEY, UNPRICED_NO_RATE)
            return
        self.cost_usd = cost
        self.cost_basis = COST_BASIS_RATE_TABLE

    def set_model(self, model_name: Optional[str]) -> None:
        if model_name:
            self.model = str(model_name)

    def set_provider(self, provider: Optional[str]) -> None:
        if provider:
            self.provider = provider

    def add_metadata(self, **entries: Any) -> None:
        self.metadata.update({key: value for key, value in entries.items() if value is not None})


class UsageEmitter:
    """Queues events and sends them in batches on a background thread.

    Synchronous mode exists for the tests: it removes the thread, so a test
    asserts on what a fake transport received without waiting on a flush.
    """

    def __init__(
        self,
        config: UsageMonitorConfig,
        transport: Optional[Transport] = None,
        synchronous: bool = False,
        queue_capacity: int = QUEUE_CAPACITY,
    ) -> None:
        self._config = config
        self._transport = transport or http_transport(config)
        self._synchronous = synchronous
        self._queue: "queue.Queue[dict[str, Any]]" = queue.Queue(maxsize=queue_capacity)
        self._worker: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        self._stopping = threading.Event()
        self.dropped = 0
        self.failed_batches = 0

    @property
    def enabled(self) -> bool:
        return self._config.enabled or self._synchronous

    @property
    def config(self) -> UsageMonitorConfig:
        return self._config

    def emit(self, event: dict[str, Any]) -> None:
        if not self.enabled:
            return
        if self._synchronous:
            self._send([event])
            return
        self._ensure_worker()
        try:
            self._queue.put_nowait(event)
        except queue.Full:
            # Losing telemetry is the correct outcome here. Counting the loss
            # keeps it from being invisible.
            self.dropped += 1
            if self.dropped % 100 == 1:
                logger.warning(
                    "usage monitor queue full; dropped %d event(s) so far", self.dropped
                )

    def flush(self, timeout: float = 2.0) -> None:
        """Drain the queue. Used at interpreter exit and by the tests."""
        if self._synchronous:
            return
        deadline = time.monotonic() + timeout
        while not self._queue.empty() and time.monotonic() < deadline:
            time.sleep(0.02)

    def _ensure_worker(self) -> None:
        with self._lock:
            if self._worker is not None and self._worker.is_alive():
                return
            worker = threading.Thread(
                target=self._run,
                name="usage-monitor",
                daemon=True,
            )
            self._worker = worker
            worker.start()
            atexit.register(self.flush)

    def _run(self) -> None:
        while not self._stopping.is_set():
            batch = self._collect_batch()
            if batch:
                self._send(batch)

    def _collect_batch(self) -> list[dict[str, Any]]:
        try:
            first = self._queue.get(timeout=FLUSH_INTERVAL_SECONDS)
        except queue.Empty:
            return []
        batch = [first]
        while len(batch) < BATCH_SIZE:
            try:
                batch.append(self._queue.get_nowait())
            except queue.Empty:
                break
        return batch

    def _send(self, batch: list[dict[str, Any]]) -> None:
        try:
            self._transport(batch)
        except (urllib.error.URLError, OSError, ValueError) as error:
            self.failed_batches += 1
            if self.failed_batches % 20 == 1:
                logger.warning(
                    "usage monitor unreachable (%s); %d batch(es) lost",
                    error,
                    self.failed_batches,
                )
        except Exception:  # noqa: BLE001 - telemetry must never raise upward
            self.failed_batches += 1
            logger.debug("usage monitor send failed", exc_info=True)


_emitter: Optional[UsageEmitter] = None
_emitter_lock = threading.Lock()


def get_emitter() -> UsageEmitter:
    """The process-wide emitter, built from the environment on first use."""
    global _emitter
    with _emitter_lock:
        if _emitter is None:
            _emitter = UsageEmitter(config_from_env())
        return _emitter


def set_emitter(emitter: Optional[UsageEmitter]) -> None:
    """Replace the process-wide emitter. For tests and for explicit wiring."""
    global _emitter
    with _emitter_lock:
        _emitter = emitter


def _error_fields(error: BaseException) -> dict[str, Any]:
    fault = provider_fault_kind(error)
    message = str(error) or type(error).__name__
    return {
        "errorKind": fault or type(error).__name__,
        "errorMessage": message[:MAX_ERROR_MESSAGE_CHARS],
    }


def build_event(
    observation: CallObservation,
    *,
    service: str,
    started_at: float,
    ended_at: float,
    error: Optional[BaseException],
) -> dict[str, Any]:
    event: dict[str, Any] = {
        "eventId": str(uuid.uuid4()),
        "ts": int(started_at * 1000),
        "service": service,
        "provider": observation.provider or PROVIDER_UNKNOWN,
        "status": "error" if error is not None else "ok",
        "durationMs": max(0, int((ended_at - started_at) * 1000)),
    }
    if observation.feature:
        event["feature"] = observation.feature
    if observation.model:
        event["model"] = observation.model
    if observation.endpoint:
        event["endpoint"] = observation.endpoint
    if observation.correlation_id:
        event["correlationId"] = observation.correlation_id
    if observation.http_status is not None:
        event["httpStatus"] = observation.http_status
    if observation.tokens:
        event["tokens"] = dict(observation.tokens)
    if observation.cost_usd is not None:
        event["costUsd"] = observation.cost_usd
        if observation.cost_basis:
            event["costBasis"] = observation.cost_basis
    if observation.metadata:
        event["metadata"] = dict(observation.metadata)
    if error is not None:
        event.update(_error_fields(error))
    return event


@contextmanager
def observe_external_call(
    *,
    provider: str,
    feature: Optional[str] = None,
    model: Optional[str] = None,
    endpoint: Optional[str] = None,
    correlation_id: Optional[str] = None,
    emitter: Optional[UsageEmitter] = None,
    service: Optional[str] = None,
    **metadata: Any,
) -> Iterator[CallObservation]:
    """Time one external call and report it, however it ends.

    The failure path is the point. A stage that catches its own exceptions
    still leaves this block by raising, so an error is recorded with its
    duration and its classified kind before the caller ever sees it -- which is
    what makes the failure rate in the dashboard real rather than a count of
    the failures somebody remembered to log.

    Wrap the provider call and nothing else. Everything inside the block is
    counted as that call's duration.
    """
    observation = CallObservation(
        provider=provider,
        feature=feature,
        model=model,
        endpoint=endpoint,
        correlation_id=correlation_id,
        metadata={key: value for key, value in metadata.items() if value is not None},
    )
    active = emitter or get_emitter()
    started_at = time.time()
    error: Optional[BaseException] = None
    try:
        yield observation
    except BaseException as raised:  # noqa: BLE001 - recorded, then re-raised
        error = raised
        raise
    finally:
        if active.enabled:
            try:
                event = build_event(
                    observation,
                    service=service or active.config.service,
                    started_at=started_at,
                    ended_at=time.time(),
                    error=error,
                )
                active.emit(event)
            except Exception:  # noqa: BLE001 - never let reporting break a call
                logger.debug("usage monitor could not build an event", exc_info=True)


@contextmanager
def observe_job_call(
    job_id: str,
    *,
    provider: str,
    model: Optional[str] = None,
    endpoint: Optional[str] = None,
    correlation_id: Optional[str] = None,
    emitter: Optional[UsageEmitter] = None,
    **metadata: Any,
) -> Iterator[CallObservation]:
    """Observe one call, reported under the job that asked for it.

    The job id is the ``feature``, so the usage history and the settings table
    line up on the same word: an operator who changes ``lm.alt_text`` in the
    dashboard can then filter the usage chart by ``lm.alt_text`` and see what
    the change did. That is the whole point of naming jobs.

    The service name comes from the job's app, so ai-blog-writer and Location
    Manager stay distinguishable without either process having to remember to
    configure it.
    """
    active = emitter or get_emitter()
    with observe_external_call(
        provider=provider,
        feature=job_id,
        model=model,
        endpoint=endpoint,
        correlation_id=correlation_id,
        emitter=active,
        service=service_for(active.config, job_id),
        **metadata,
    ) as observation:
        yield observation
