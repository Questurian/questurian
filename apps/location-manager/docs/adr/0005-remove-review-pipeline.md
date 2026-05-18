# Remove the review pipeline; replace with grounded Google Search

**Status:** accepted (2026-05-18)

**Supersedes:** [ADR-0001](./0001-review-pipeline-rewrite.md), [ADR-0003](./0003-translation-via-vertex-in-python-alt-text.md). Partially supersedes [ADR-0002](./0002-add-dining-auto-fill.md) §1 Stage 2 / §4 / `ReviewsFetchPhase`.

## Context

The Google + TripAdvisor review pipeline (ADR-0001) was rebuilt as an LM-internal asset after AI Blog Writer's `review2blog` was deleted. Today it has exactly two consumers:

1. `accommodations-field-suggestion.service.ts` — passes a 20-review sample to `/field-suggestion` for the AI-branch fields (~14 of the 20 accommodations fields; the other 6 are satisfied from Foursquare/Google prefill before AI runs).
2. `dining-stage2-suggestion.service.ts` — passes a 20-review sample to `/field-suggestion` for `type` (refinement of a deterministic Stage 1 `types[]` mapping) and `idealFor`.

Both call paths already have a designed-in fallback (ADR-0002 §4): when reviews are absent or `unusable: true`, the Python service falls back to grounded Google Search via `Tool(google_search=GoogleSearch())` (`app.py:359-389`), and provenance flips from `ai-reviews` to `ai-google`. The fallback path is real, tested, and lives in production code.

Three things changed the calculus:

1. **Scale.** Launch corpus is ~500 Locations, curated by a small operator team. The amortisation argument for a cached review file disappears at this N.
2. **Cost.** SerpAPI is the actual paid external provider — Google Reviews and TripAdvisor are both scraped through it. The plan floor (~$50–75/mo) is the dominant cost line whether the pipeline runs or not; per-Location SerpAPI usage is paginated and adds tens of cents per Location. Replacing reviews with grounded Gemini queries costs ~$0.035 per grounded call (Vertex's grounding fee, separate from token cost) — a full 500-Location backfill is roughly **$245 one-time** vs **~$600–900/yr** in standing SerpAPI subscription.
3. **Trust signal is recoverable.** The operator-trust loop today is "click `AI-R` badge → open reviews dialog → read passages." Grounded search returns citations with passages; `AccommodationsSuggestionSource.snippet` already exists in the response shape but is rarely populated. Wiring grounded-citation snippets into that field replaces the reviews dialog in the same UI affordance.

The review pipeline is also a meaningful maintenance surface: SerpAPI scraping is flaky for TripAdvisor; translation cache versioning needs care; the `unusable` flag and its consumers exist precisely because thin-coverage Locations were a recurring failure mode.

## Decision

Remove the review pipeline entirely. Replace review-grounded field suggestion with grounded Google Search via the existing Vertex `GoogleSearch` tool.

### 1. Field suggestion goes grounded-only

`/field-suggestion` in `python-alt-text` collapses to a single mode: always grounded Google Search, no `reviews` branch, no `guest_reviews` block in the prompt. Citations from the grounded response populate `sources[].snippet` so operators can read the passages the model relied on.

`accommodations-field-suggestion.service.ts` and `dining-stage2-suggestion.service.ts` lose `loadReviewSampleIfUsable`, `reviews` on the request, and `reviewsUsed` on the response.

### 2. `FieldProvenance` collapses

`"ai-reviews" | "ai-google"` → `"ai"`. A migration rewrites existing rows (`ai-reviews` → `ai`, `ai-google` → `ai`). The provenance badge surface shrinks correspondingly: `G`, `TA`, `Scraper`, `AI`, `Operator`.

### 3. Add Dining Stage 2 simplifies

`ReviewsFetchPhase` is removed from the Add Dining flow. Stage 2 fires immediately after the draft Location row is created, calling `/field-suggestion` for `type` and `idealFor` in grounded mode. The pending-suggestion side channel (ADR-0002 §3) is retained — it remains useful for re-suggest passes after operator edits, even without reviews as the trigger.

### 4. TripAdvisor URL search is kept

`tripadvisor-url-search.ts` is **not** review fetching — it resolves the canonical TripAdvisor URL for a place from name + lat/lng. It stays. The SerpAPI client stays for that one call. The deletions below are review-fetch and translation only.

### 5. Audit trail moves to grounded-search citations

The Python service is updated to extract citation snippets from `Tool(google_search=GoogleSearch())` responses and populate `sources[].snippet` on every suggestion. The client surfaces these snippets in the same place the reviews dialog used to live — clicking the `AI` badge on a suggested field shows the cited passages.

### 6. The `unusable: true` signal is dropped

Today "this Location had < 5 clean reviews" was a real operator signal that a place has low public footprint. At 500 curated entries the operators already know which Locations are obscure; the signal isn't worth the infrastructure that produced it. If we ever need it back, a "fewer than N distinct grounded-search citations" heuristic recovers most of it without the pipeline.

### Removal surface (concrete)

*Server (LM):*
- `services/content/reviews-pipeline/` (folder)
- `services/content/translate-merge/` (folder)
- `services/content/reviews-digest.service.ts`
- `repositories/content/merged-reviews.repository.ts`, `translate-merge-reviews.repository.ts`
- `controllers/content/translate-merge-reviews.controller.ts`
- `types/translate-merge-reviews.types.ts`, `reviews-pipeline.types.ts`
- `constants/translate-merge-reviews.constants.ts`
- `data/reviews/` (on-disk merged-reviews artifacts)
- `translation_cache` SQLite table + migration
- Routes under `/reviews-pipeline`, `/translate-merge-reviews`, `/merged-reviews` in `location.routes.ts`

*Client:*
- `LocationReviewsSection.tsx`, `ReviewsReportDialog.tsx`
- `useMergedReviews.ts`, `useReviewsPipeline.ts`
- `locations-merged-reviews.api.ts`, `merged-reviews.types.ts`, `reviews-pipeline.types.ts`
- `ReviewsFetchPhase` and its references in the Add Dining flow

*Python service:*
- `translate_reviews_with_vertex` and the `/translate-reviews` endpoint
- The reviews branch of the field-suggestion prompt (`app.py:267-272`)

*Docs:*
- ADR-0001 and ADR-0003 marked **Superseded** (this ADR).
- ADR-0002 §1 Stage 2 / §4 / `ReviewsFetchPhase` references annotated as superseded.
- ADR-0004 Reviews tab/section references removed.
- LM `CONTEXT.md` glossary: drop `Merged Reviews`, `ReviewsChecklist`, `Translation Cache`, `MIN_REVIEW_CHAR_COUNT`, `MIN_REVIEW_AGE_YEARS`, `MIN_USABLE_REVIEW_COUNT`, `REVIEW_SAMPLE_FOR_AI`, `translator_version`. `FieldProvenance` enum updated.
- Root `CONTEXT.md` LM row: scope rewritten — drop "aggregate Google + TripAdvisor reviews"; add "AI field suggestions via grounded search."

## Considered alternatives

- **Keep reviews for `vibe` / `idealFor` / `walkability` only; route the rest to grounded search.** Rejected: leaves the entire review pipeline in place (fetch + translate + cache + merge + UI) to feed three fields. The infrastructure cost is binary — you either pay for the pipeline or you don't.
- **Keep the review pipeline behind a feature flag for re-enablement.** Rejected: dead code drift. If grounded search proves insufficient in production, the pipeline can be reconstructed from git history — it doesn't need to be carried as a dormant subsystem.
- **Keep merged reviews as a read-only operator inspection tool (no AI consumer).** Rejected: maintenance cost without a system function. Operators who want to read reviews can open Google Maps or TripAdvisor directly.

## Consequences

- **Cost:** standing SerpAPI subscription can be downgraded (URL search has lower volume than review pagination). Vertex grounding fees become a new linear-in-suggestions line item, manageable at current scale.
- **Quality:** `idealFor` for dining is the field most exposed to quality regression — first-person "great date spot" evidence is replaced by whatever grounded Google Search surfaces (restaurant marketing, listicles, blog posts). Operator override via the pending-suggestion channel remains the safety net.
- **Operator workflow:** the "open reviews dialog" affordance disappears. The replacement is "expand the `AI` badge to see cited passages." Same number of clicks, different source.
- **`provenance` shape change:** existing Locations carry `ai-reviews`/`ai-google` tags today; the migration is one-shot and idempotent.
- **`ReviewsFetchPhase` removal** makes Add Dining noticeably faster — the 15–60s background fetch is gone. Stage 2 fires inline.
- **Reversibility:** medium-low. Code can be restored from git, but on-disk merged-reviews artifacts and translation-cache rows are deleted as part of the cutover. If reviews come back, they re-fetch from scratch.

## Open questions

- Should the grounded-citation snippet UI live in the same drawer/dialog as the old reviews view, or inline under the field with a "show evidence" toggle? Defer to whoever implements the UI swap.
- Foursquare's `perfectFor` array (used in the existing-data branch of accommodations) is unaffected by this ADR but is the same shape of "curated tag list from a third party." Worth a follow-up audit on whether Foursquare data is still worth pulling, separately from this decision.
