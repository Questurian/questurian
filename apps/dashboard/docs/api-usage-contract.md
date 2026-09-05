# API usage contract, v1

The wire format the Dashboard's collector accepts. Written for whoever adds the
next emitter, in whatever language.

The authoritative definition is [`src/usage/contract.ts`](../src/usage/contract.ts).
This document explains it; that file enforces it.

## Ingest

The collector runs whenever the repo's dev processes do — root `pnpm dev` starts it on 4500 along with everything else.

```
POST http://localhost:4500/api/usage/v1/events
content-type: application/json
x-usage-key: <only when the collector requires one>

{ "events": [ … ] }
```

- At most **500 events** per batch. A larger batch is rejected whole.
- Replies **202** with `{ accepted, duplicates, rejected, errors[] }`.
- One bad event does not sink the batch: the good ones land and the bad ones
  come back by index with a readable reason.
- `GET /api/usage/v1` reports the schema version, the batch cap and the
  vocabularies (dimensions, buckets, metrics), so an emitter can check what it
  is talking to.

### Who may write

- With `DASHBOARD_INGEST_KEY` set on the collector, the `x-usage-key` header
  must match it. Nothing else is accepted.
- With it unset, **loopback callers only**. That is the laptop default: my own
  apps may write, anything that can reach the port may not.

## One event

```jsonc
{
  "eventId": "9f8c…",             // optional; replaying it is a no-op
  "ts": 1757000000000,            // REQUIRED, epoch milliseconds
  "service": "abw-backend",       // REQUIRED, which of OUR apps called out
  "provider": "google-vertex",    // REQUIRED, the external service
  "status": "ok",                 // REQUIRED, "ok" | "error"

  "feature": "prompt2blog",       // what we were doing
  "endpoint": "/v1/places:searchText",  // for non-AI calls
  "model": "gemini-3.1-pro-preview",    // for AI calls
  "durationMs": 8421,
  "httpStatus": 200,
  "errorKind": "quota_exhausted", // a short, groupable label
  "errorMessage": "…",            // truncated to 1 KB
  "tokens": { "input": 12000, "output": 3400, "cachedInput": 0, "reasoning": 0, "total": 15400 },
  "costUsd": 0.0648,
  "costBasis": "measured",        // "measured" | "rate-table"
  "correlationId": "run-849ae5aa",// ties several calls to one unit of work
  "metadata": { "attempt": 2 }    // free-form JSON
}
```

### Rules worth knowing before you write an emitter

**Only four fields are required.** A non-AI call has no model, a failed call
has no tokens, and a provider that reports no price gets no `costUsd`. Send
what you have.

**Unknown fields are kept, not rejected.** Anything the collector does not
recognise is preserved under `metadata._unknown`. An emitter newer than the
collector never loses data, so emitters and collector can be deployed in
either order.

**`ts` is milliseconds.** A value that looks like seconds is rejected, because
silently accepting it puts the event in 1970 and quietly ruins every chart.

**Never invent a cost.** Send `costUsd` only when the provider told you what
the call cost, and say which kind of figure it is:

| `costBasis` | meaning |
|---|---|
| `rate-table` | you computed it from a published rate table you own. This is what Vertex calls send. |
| `measured` | the provider billed you exactly this for this call. **No emitter uses this today** — see below. |
| omitted | you have no price. The UI shows the call as *unpriced* and excludes it from cost totals. |

A guessed price is worse than no price: it makes the cost chart look
authoritative while being wrong, and nothing downstream can tell.

### Two providers you must not price

**A flat-rate subscription.** The Claude Code CLI reports a `total_cost_usd`
per call, and it is *not* a cost — it is what those tokens would have cost on
the Anthropic API. The actual spend is a flat monthly subscription that no
per-call figure can be carved out of. Reporting it would drop a precise,
confident, wrong number into the same total as real metered spend. Send the
tokens; omit the price; set `metadata.unpricedReason` to
`subscription-flat-rate`.

**A model you have no rate for.** Omit the price and set
`metadata.unpricedReason` to `no-rate-for-model`. An obvious hole is worth
more than a plausible zero — a missing rate must never read as a free call.

**`total` tokens is trusted when you send it.** Providers disagree about
whether the total includes reasoning or cached reads, and you saw the response,
so your figure wins. Omit it and the collector derives
`input + output + reasoning`.

**Counting tokens is harder than it looks.** Two quirks cost real money and
both undercount if you take the obvious field at face value:

- **Thinking tokens are output.** Google bills reasoning at the output rate,
  but LangChain reports it in `output_token_details.reasoning`, *outside*
  `output_tokens` (raw Vertex uses `thoughts_token_count`, outside
  `candidates_token_count`). Reading `output_tokens` alone charges you for the
  visible answer and nothing for the thinking that produced it.
- **Anthropic's `input_tokens` excludes its own cache.**
  `cache_read_input_tokens` and `cache_creation_input_tokens` sit beside it and
  must be added in. Google does the opposite: `input_tokens` is gross, with the
  cached share nested under `input_token_details`.

Do not re-derive this. In Python, use
`app.shared.token_usage.normalize_token_usage` — the same function the run
ledger uses, so a receipt and the dashboard cannot disagree.

**`errorKind` is for grouping, `errorMessage` is for reading.** Keep the kind
short and stable (`quota_exhausted`, `rate_limited`, `timeout`, `http_502`);
put the detail in the message.

**`eventId` buys you retries.** With one, a resend after a timeout is a
duplicate and is dropped. Without one, it is a second row.

## Reads

Every read takes the same filter as query parameters:

| parameter | meaning |
|---|---|
| `window` | `15m`, `24h`, `7d` — measured back from now |
| `from` / `to` | epoch ms or ISO dates. `window` and `from` together are a 400 |
| `service`, `provider`, `feature`, `model`, `correlationId` | exact match |
| `status` | `ok` or `error` |

| route | returns |
|---|---|
| `GET /summary` | calls, errors, error rate, cost, priced/unpriced counts, token totals, p50/p95/max duration, data bounds |
| `GET /series?bucket=&metric=&groupBy=` | `{ keys, rows }` ready to chart. `bucket`: `minute\|hour\|day`. `metric`: `calls\|cost\|tokens\|errors` |
| `GET /breakdown?groupBy=` | one row per provider/service/feature/model |
| `GET /events?limit=&cursor=` | raw events, newest first, keyset paginated |
| `GET /facets` | distinct values, for filter dropdowns |

A misspelled parameter is a **400**, never a silently unfiltered answer.

## A reference emitter

[`app/shared/api_usage.py`](../../ai-blog-writer/apps/backend/app/shared/api_usage.py)
in the AI Blog Writer backend is the working example: a context manager that
times a call, a bounded queue, a daemon thread, and every failure swallowed.
Copy its shape rather than importing it — nested monorepos here do not import
each other's code.

Whatever the language, an emitter must:

1. **Never block the call it measures.** Queue and send elsewhere; drop when
   the queue is full and count the drops.
2. **Never raise.** A collector that is down, slow or absent changes nothing.
3. **Do nothing when unconfigured.** No URL, no emitter, no cost.
4. **Report failures.** The failure rate in the dashboard is only real if the
   error path reports too, which means recording the exception before the
   caller's own handler sees it.
5. **Wrap the provider call and nothing else.** Everything inside the timed
   block becomes that call's duration.
