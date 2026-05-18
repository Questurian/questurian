# Review pipeline rewrite: LM-owned enrichment, not an export bundle

**Status:** superseded by [ADR-0005](./0005-remove-review-pipeline.md) (2026-05-18)

The review pipeline this ADR rewrote has been removed entirely; field suggestions now use grounded Google Search instead. See ADR-0005.

(Original ADR text retained below for historical context. **Original status:** accepted (2026-05-16).)

## Context

The Google + TripAdvisor review pipeline was built to feed AI Blog Writer's `review2blog` flow via a category-specific "AI JSON Export" (`buildAiJsonPayload`). On 2026-05-16, `review2blog` was deleted from AI Blog Writer (commit `3ec90f42`), leaving the export with no downstream consumer. At the same time several long-standing inefficiencies in the merge pipeline became impossible to ignore: filters ran after translation (paying the translation API for reviews destined for the trash), every merge run re-translated from scratch, and there was no explicit handling of locations with too few clean reviews.

## Decision

Reviews are now an **LM-internal asset**, not an export. The pipeline is rewritten as follows:

1. **Filter before translate.** Both the 150-character minimum and the 2023-01-01 date floor run on raw source text before any translation API call. Translating a review only to discard it is forbidden waste.
2. **SQLite translation cache.** A `translations` table keyed by `(source, review_id)` with a `translator_version` column stores translated text + title + detected source language. Translation lookups are scoped by current `translator_version`; misses call the API; hits are reused verbatim. Invalidation is **version bump only** — review text is immutable, so a fixed source always maps to a fixed translation under a fixed model/prompt. No TTL.
3. **Explicit insufficient-reviews gate.** Below `MIN_USABLE_REVIEW_COUNT = 5` clean reviews (after dedup + length + date), the merge step still writes `merged_reviews_*.json` but sets `unusable: true` with a `reason`. Consumers must inspect this flag.
4. **Fallback to pure-AI is the consumer's call.** When `unusable: true`, callers (today: `python-alt-text` field suggestions) omit reviews from the request; the endpoint falls back to grounded-search-only mode. The merge stage never decides "use AI instead" — it only declares the reviews unsuitable.
5. **AI JSON Export removed.** `buildAiJsonPayload` (all 5 category branches), `getAiJsonDownloadPayload`, the `/api/{category}/:id/ai-json/download` route, the `LocationReviewsSection` download button, and the `review2blog-export-v1` schema are deleted. There is no downstream consumer.
6. **Auto-fill replaces review2blog.** `/accommodations-field-suggestion` in `python-alt-text` is generalized to `/field-suggestion`, accepting a `category` param and an optional `reviews?: []`. LM server passes reviews when `unusable: false`; otherwise omits them. Rollout order: accommodations → dining → attractions → nightlife → key_locations. Trigger UI is a per-field "Suggest" button on the location edit form.

## Considered alternatives

- **A new ABW pipeline as direct successor to review2blog.** Rejected: the value of reviews is in the *operator's* workflow (filling Location fields with operator review before sync), not in producing more long-form content. Keeping the consumer on the LM side eliminates a sync boundary and a schema contract.
- **JSON cache file per location instead of SQLite.** Rejected: doesn't fit the existing SQLite-on-the-server decision, and concurrent merges (eventually a multi-operator concern) would race on file writes.
- **TTL-based cache invalidation.** Rejected: review text is immutable; a translation under a fixed model doesn't get "stale" over time. TTL would re-pay for no quality gain.
- **Consumer-side `unusable` threshold (each consumer picks its own floor).** Rejected for now: simpler to reason about one global floor. Can be relaxed if a future feature legitimately wants a different N.
- **Per-category copy-pasted field-suggestion endpoints.** Rejected: I/O shape is identical across categories (`field_key`, `field_label`, `allowed_options`, `reviews?`); only the prompt template differs. Five endpoints would drift.

## Consequences

- The `translations` table becomes load-bearing — a schema migration is required before the new pipeline ships. Existing merged-reviews files keep their embedded translated text; the cache backfills naturally as reviews are re-encountered.
- `JsonExportChecklist` is removed from the LM domain language. Any UI tied to it is dead.
- The `review2blog-export-v1` schema string in the codebase has no successor — its disappearance is the signal that the export concept is gone.
- Operators see a new `unusable` state on `ReviewsChecklist` for locations with sparse review coverage. This is a feature, not a regression: previously these locations silently produced empty or near-empty AI JSON.

---

## Follow-on decisions: prep & handling hygiene (2026-05-16)

**Status:** accepted (2026-05-16)

### Context

Decisions 1-6 above defined *what the pipeline does*. A subsequent grilling session focused on *how cleanly the artifact is prepared and handed off*, because Merged Reviews is now expected to feed multiple consumers over time (today: Accommodations field suggestion; future: other category suggestions, drift detection, possibly operator-facing review summaries). The artifact's job is to be a trustworthy, self-describing, multi-consumer dataset — and several rough edges blocked that.

### Decision

7. **Unified `Refresh Reviews` action.** A single operator action fetches raw Google + TripAdvisor reviews and re-merges in one shot. The merge stage remains independently re-runnable on the server (`POST /api/{category}/:id/reviews/translate-merge`) for the case where raw files exist and `translator_version` bumped — this endpoint rebuilds from cached translations + existing raw files without re-paying the scraper. The unified flow is implemented today via `executePipeline` (`reviews-pipeline/orchestration/pipeline.service.ts`) which composes `fetchSelectedSources` and `runTranslateAndMergeReviews` via `merge-dependency.service.ts`; client UI calls `/reviews/fetch-pipeline` (a job that runs fetch + merge in one operator action). The re-merge-only endpoint has no client UI trigger today — it's reserved for translator-version-bump rebuilds.

8. **Repository returns full review records.** `getLatestMergedReviews*` accessors stop narrowing each review to `{text, rating, date}`. They return the full clean record (`source`, `original_language`, `was_translated`, `title`, `rating`, `review_datetime_utc`, `review_text`, plus author/handle where present). Sampling and projection are consumer concerns, not artifact concerns.

9. **Translation failures excluded from the artifact.** When a review with `needsTranslation === true` fails to translate (API error, API not configured, batch error), it is **not** included in the merged `reviews[]`. It is counted in `stats.translationFailed` and listed in the rejects report under a new action `translation_failed` so it is recoverable on the next run (cache miss → retry). `was_translated` becomes a clean two-state flag (successful translation vs natively in target language); the old third state — original non-English text kept with `was_translated: false` mixed in among native English — is removed. The `MIN_USABLE_REVIEW_COUNT` gate runs on the *clean* count.

10. **Self-describing artifact metadata header.** Each merged file gains the following header alongside existing fields:
    ```
    sources: {
      google:      { fetchedAt, fileFound, reviewCount }
      tripadvisor: { fetchedAt, fileCount, fileLoadErrors, reviewCountRaw, reviewCountUnique }
    }
    pipeline: {
      translatorVersion         // resolved, see decision 13
      filters: { minChars, minReviewDate }   // resolved values, not constants
      schemaVersion: 1
    }
    contentHash                 // sha256 of normalized reviews[] + filters
    ```
    Consumers decide their own freshness/trust/diffing policies from these facts. The artifact carries no policy.

11. **Storage hygiene.** Three sub-decisions:
    - Retain the last 3 merged files per Location. Prune older on successful write (never as a separate sweep).
    - Atomic write: `merged-reviews-{ts}.json.tmp` then `rename` so `latest` can never point to a half-written file.
    - `contentHash` in the header (decision 10) enables cheap "nothing material changed" checks downstream.

12. **Rolling review-age window replaces the absolute date floor.** `MIN_REVIEW_DATE_TIMESTAMP` (frozen at 2023-01-01) is replaced with `MIN_REVIEW_AGE_YEARS = 3`. The cutoff is computed at merge time (`startOfDay(now − 3 years)`) and the resolved ISO date is written into `pipeline.filters.minReviewDate` on the artifact so historical files remain self-explanatory after the constant changes. Rationale for 3: travel content ages slowly; preserves continuity with the existing 2023-01-01 dataset operators already trust; `MIN_USABLE_REVIEW_COUNT` already gates sparseness so the age axis does not need to be aggressive.

13. **Translator version is owned by whoever owns the prompt/model.** Currently the translation prompt and model live in the external Leads API service, so:
    - The Leads API derives `translator_version` as a hash of (prompt template + model id) and returns it on every translation response.
    - LM is a passive consumer: it stores whatever the Leads API returned, keyed alongside each cached translation, and uses it as the cache scope.
    - **Dependency:** `TranslateReviewsResponse` does not currently include this field. The Leads API must add it before LM can rely on it. Until then, LM keeps the existing hand-typed version constant.
    - No proactive cache pruning until cache size is an actual problem.

14. **Per-location concurrency guard.** An in-process per-`locationId` mutex wraps `runTranslateAndMergeReviews`. A second concurrent call for the same Location returns `409 Conflict — merge already running for this location` rather than waiting. Cross-location merges still run in parallel.

### Considered alternatives

- **Keep fetch and merge as separate operator clicks.** Rejected: no human decision lives between fetch and merge; separation only creates stale-merge-against-newer-fetch bugs the system can't detect.
- **Tag translation-failed reviews with a third `was_translated` state and keep them in the artifact.** Rejected: consumers — especially AI groundings — cannot reliably distinguish "natively English" from "tried and failed, raw foreign text retained." The cost of letting garbled text leak into grounding outweighs the small loss of carrying failed rows; the rejects report makes them recoverable anyway.
- **Per-location filter overrides (minChars / minReviewDate per Location).** Deferred: no concrete need yet, and the artifact's resolved-filter header preserves the option without doing the work.
- **Hand-typed `translator_version` constant inside the Leads API.** Rejected: the existing 2023-01-01 date floor is the cautionary tale — hand-discipline rots. A derived hash is correct by construction.
- **In-LM `translator_version` ownership** (LM declares the version, perhaps for testability). Rejected: LM does not own the prompt or model. A version owned away from the inputs it claims to describe is fiction.
- **Cache-size-based proactive pruning of old `translator_version` rows.** Rejected for now: cache size is not currently a problem; revisit when it is.
- **Serial wait (rather than 409) on concurrent merge calls for the same Location.** Rejected: in an operator UI the right behavior is to tell the user "already running" immediately, not to silently queue.
- **Idempotency keys for merge requests.** Rejected: no client-side retry semantics worth supporting yet.
- **SQLite row-level lock instead of in-process mutex.** Deferred: LM runs as a single Bun process today. Promote when LM scales horizontally.

### Consequences

- `getLatestMinimalMergedReviews` and `getLatestMergedReviewsAiSample` change shape. The Accommodations field-suggestion path must project down to whatever fields it actually needs.
- The merged-file JSON shape gains the metadata header; this is the moment `schemaVersion: 1` is established. Consumers may refuse to read missing/older shapes rather than silently mis-parse.
- The rejects report grows a new action: `translation_failed`. Existing consumers (none today read it programmatically) must accept the new variant.
- `MIN_USABLE_REVIEW_COUNT` is re-anchored to the clean count after dropping failed translations. Some Locations that were `unusable: false` under the old counting will become `unusable: true` under the new counting — this is intended, not a regression: those Locations were already feeding noisy data to the AI.
- `MIN_REVIEW_DATE_TIMESTAMP` and `MIN_REVIEW_AGE_YEARS` cannot coexist; the constant rename and the recomputation logic are a single coordinated change.
- Until the Leads API emits `translator_version`, the cache continues to use the existing hand-typed constant; the new field on the response is the trigger to switch the cache key.
- Two unrelated processes hitting "Refresh Reviews" on the same Location is now an observable error (409) rather than a silent double-spend on the translation API.

### Deferred follow-ups (explicitly out of scope here)

- **Cross-source dedupe.** Same human posting the same review on both Google and TripAdvisor is currently double-counted. Fuzzy matching (author handle + date + text similarity) is plausible but neither well-scoped nor blocking the current consumer.
- **Google source partial-coverage signaling.** TripAdvisor has `fileLoadErrors` in the new metadata header; the Google source fetcher has no equivalent "partial" concept yet because it loads a single file. Worth revisiting if Google fetching becomes multi-region or paginated.
