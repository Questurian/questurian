# Translation runs through python-alt-text on Vertex, not a dedicated Leads API

**Status:** superseded by [ADR-0005](./0005-remove-review-pipeline.md) (2026-05-18)

Translation only existed to feed the review pipeline. With reviews removed (ADR-0005), translation is no longer needed.

(Original ADR text retained below for historical context. **Original status:** proposed (2026-05-17).)

## Context

The translate-merge stage of the review pipeline ([ADR-0001](./0001-review-pipeline-rewrite.md)) historically called an external "Leads API" service to translate non-English review text and titles into English. The Leads API was a separate Node service running outside this monorepo; the LM server held a `LEADS_API_URL` env var and a `TranslationApiClient` that POSTed `{reviews[], fields_to_translate[], source_language}` to it. The Leads service was the only remaining caller of that external endpoint after `review2blog` was deleted.

By 2026-05-17, three forces converged:

1. **The Leads service had no other reason to exist.** Removing translation from it leaves an empty service to maintain, monitor, and pay for.
2. **`python-alt-text` already owns Vertex.** It runs Gemini calls for alt-text generation and `/field-suggestion`. Adding a translation endpoint there reuses the same Vertex auth, deployment, observability, and rate-limit surface instead of standing up Vertex access in a second service.
3. **The translation cache contract pins the *translator*, not the *transport*.** Per ADR-0001, the SQLite `translations` table is keyed by `(source, review_id)` and scoped by `translator_version`. Changing the translator (Leads API → Vertex/Gemini) is exactly the case the `translator_version` column was designed for — bump the version, the cache invalidates, every cached row gets re-translated through the new translator on next encounter. No migration, no data loss, no per-row decision.

## Decision

Translation moves into `python-alt-text` as a new `/translate/reviews` endpoint backed by Vertex Gemini. The wire contract is preserved verbatim:

- **Request:** `{ reviews: [{id, review_text, title, ...}], fields_to_translate: string[], source_language?: string }`
- **Response:** `{ reviews: [{id, review_text, title, ...}], stats: { total, translated, already_english, errors, skipped }, message: string }`

Same request/response shape as the old Leads API means the LM caller (`TranslationApiClient`, `translation.service.ts`) changes only its base URL, not its logic. The client now points at `ALT_TEXT_API_URL` instead of `LEADS_API_URL`; `LEADS_API_URL` is removed from `env.config.ts` entirely.

Per-batch behaviour:

- **One Vertex call per batch.** The prompt receives the array of `(id, review_text, title)` payloads and returns translated text per review plus an `already_english_ids` list.
- **Pre-filtering stays on the LM side.** `needsTranslation()` continues to filter before the API call; the API does not re-detect English. (The current prompt still asks the model to tag already-English reviews; this is being simplified — see "Translation efficiency" below.)
- **`TRANSLATOR_VERSION` bumped from `v1` → `v2-vertex`.** Every cached Leads-API translation is invalidated; subsequent encounters re-translate through Vertex and write the new row under the new version. No backfill job, no parallel read path — invalidation is version-bump only, per ADR-0001.

Health-check plumbing follows the move:

- LM server route `/api/health/leads-api` → `/api/health/translation-api`; controller renamed to `checkTranslationApiHealth`; pings `${ALT_TEXT_API_URL}/test` instead of the Leads service.
- Client hook `useLeadsApiHealth` → `useTranslationApiHealth`; API method `checkLeadsApiHealth` → `checkTranslationApiHealth`; type `LeadsApiHealthResponse` → `TranslationApiHealthResponse`.

### Translation efficiency

A second pass tightens the per-call cost and reliability now that translation is in our service:

1. **Default model: `gemini-2.5-flash-lite`** (overridable via `TRANSLATION_MODEL`). Translation of short user-generated review text doesn't need full Flash reasoning; flash-lite is ~5–7× cheaper at comparable quality on this task.
2. **Trust `needsTranslation()`; drop English-detection from the prompt.** The LM side already filters out English reviews before calling. Asking the model to re-detect doubles the work and inflates output tokens with echoed-English fields. The prompt simplifies to "translate every listed field, no exceptions"; `already_english_ids` is removed from the response. If post-deployment translation-failure rates spike (e.g. mixed-language reviews tagged as non-English then returned as-is and miscounted), the revert path is to restore the safety-net detection — flagged in a code comment.
3. **JSON mode + response schema + `temperature=0`.** Vertex calls switch from "ask nicely for JSON in the prompt" to `response_mime_type="application/json"` with an explicit `response_schema`. Eliminates parse failures, drops the JSON-shape boilerplate from the prompt (input-token savings), and makes translations deterministic across retries.
4. **Chunking + bounded parallelism.** The LM-side caller splits cache-misses into chunks of 20 reviews and dispatches with a concurrency cap of 5. Locations with thousands of non-English reviews previously sent one oversize call that silently truncated at the output-token cap (8K on flash-lite) — chunking eliminates this failure mode and parallelism cuts wall-clock latency.
5. **Fail-soft per chunk + one retry on 429/5xx.** A single bad chunk no longer drops the whole batch as `translation_failed`. Transient Vertex errors (rate limit, 5xx, timeout) retry once with small backoff; 4xx other than 429 fail through. Partial responses (chunk returns 18 of 20 IDs) keep the 18 and mark the missing 2 `translation_failed`, as today.
6. **Strip dead and empty fields from the payload.** `source_language` is removed from both the TS client and the Python request model — it was never read. Per-review serialization drops empty fields (e.g. Google reviews have no `title`) so we don't pay tokens for `"title": ""` round-trips.
7. **Per-call token logging.** Vertex's `usage_metadata` is logged per call (`prompt_tokens`, `output_tokens`, `chunk_size`). Cost regressions from future prompt tweaks become grep-visible. No surfacing to the TS response shape yet — that's a follow-up if the UI ever needs it.

## Considered alternatives

- **Keep the Leads API service and just swap its internals to Vertex.** Rejected: two Vertex callers, two deploy targets, two sets of credentials. The Leads service has no other reason to exist after `review2blog` was deleted (see ADR-0001).
- **A separate new translation microservice.** Rejected: same objection — a second Vertex caller for a thin endpoint is operationally costly. `python-alt-text` is already the Vertex caller for this app.
- **Live-migrate the cache (translate existing Leads-cached rows in-place).** Rejected: ADR-0001 explicitly chose version-bump invalidation over migration. Re-translation under the new translator happens lazily on next encounter, costs nothing up-front, and avoids a write-amplification spike.
- **Change the wire shape while we're here.** Rejected: preserving `{reviews[], fields_to_translate[], source_language?}` keeps the LM caller untouched at the boundary. Wire-shape changes are out of scope for this swap; if we later want per-review source-language hints, that's a separate decision.
- **Run with full `gemini-2.5-flash` to start, drop to lite only if quality holds.** Rejected: flash-lite quality on short review text is well-established; defaulting to the cheaper tier with an env-var override is the safer cost posture, and the `TRANSLATOR_VERSION` mechanism makes a model swap cheap if quality disappoints.
- **Stream translations.** Rejected: we need the full JSON back to write the cache and assemble the merged-reviews output. Streaming buys nothing here.

## Consequences

- `LEADS_API_URL` disappears from `env.config.ts`. Any external deployment configs (docker-compose, `.env.example`, infra repos outside this monorepo) that still reference it need cleanup; the LM codebase no longer reads it.
- The Leads API service has no remaining consumer in this app and can be decommissioned entirely.
- `translator_version = v2-vertex` triggers a one-time re-translation cost across the existing cache. This is expected and bounded by the cache size; subsequent runs are free for cache hits as before.
- `python-alt-text` now owns three Vertex-backed responsibilities: alt-text generation, field suggestions, and translation. The package name continues to misrepresent its scope (already flagged in ADR-0002). Renaming is still deferred.
- Health-check semantics change subtly: the reviews phase now pings `ALT_TEXT_API_URL/test` instead of a dedicated translation service. A failing health check now indicates *python-alt-text* is down, which also takes out alt-text and field-suggestions. Consolidation is intentional — fewer independent failure modes — but the UI message ("Translation API unreachable") should be read as "the alt-text service is unreachable."
- Cost observability becomes a first-class feature of the translation path. Future prompt or model changes that inflate token usage are visible without re-instrumenting.

## Open questions

- Whether `needsTranslation()` is reliable enough across all review sources (Google's heuristic vs. upstream `original_language` tags from Yelp/TripAdvisor/etc.) to permanently drop the LLM-side English safety net. Initial answer: yes, trust it. Revisit if production failure rates show otherwise — the revert is a prompt-and-schema change, no data migration.
- Whether chunk size 20 / concurrency 5 are the right defaults. Picked from a token-budget back-of-envelope; will tune from the new per-call token logs once real traffic hits.
