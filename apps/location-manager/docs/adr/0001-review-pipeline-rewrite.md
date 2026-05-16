# Review pipeline rewrite: LM-owned enrichment, not an export bundle

**Status:** accepted (2026-05-16)

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
