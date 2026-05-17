# AI-assisted Add Dining: field provenance, two-stage suggestion pipeline, and pending-suggestion side channel

**Status:** proposed (2026-05-17)

## Context

The Add Dining flow (`AddRestaurantLocation` → `AddRestaurantStagedForm` → `ConfirmLocationPhase` → `ReviewsFetchPhase` → `SuccessPhase`) was designed before the field-suggestion infrastructure landed. At Step 1 the operator types name + address, server calls Google Places, and the form auto-fills `placeId`, lat/lng, `locationKey`, `district`, `ianaTimeId`, `phoneNumber`, `website`, `operationHours`. Everything else is manual: cuisine `type` (from a dropdown), `idealFor` tags (1–4 from `DiningIdealForTag`), `tripadvisorUrl`, `menuUrl`, `reservationUrl`, and the confirm-phase `title`.

Meanwhile [ADR-0001](./0001-review-pipeline-rewrite.md) shipped `python-alt-text` `/field-suggestion`: a generalized per-field AI endpoint (`field_key`, `field_label`, `allowed_options`, optional `reviews`) with dining on the rollout roadmap. The trigger today is a per-field "Suggest" button on the **edit** page — i.e. it fires only after the Location row exists and the operator has navigated back to it. Add-time creates of dining Locations still pay full manual cost.

Three forces converge:

1. **Manual work the system can do.** `type` is recoverable from Google `types[]` deterministically. `tripadvisorUrl` is recoverable from name + lat/lng via TripAdvisor Location Search. `menuUrl` / `reservationUrl` are usually one website-scrape away (OpenGraph, link-rel, anchors, known providers: OpenTable, Resy, SevenRooms). `idealFor` and a polished `title` are recoverable from merged reviews via the existing `/field-suggestion` endpoint.
2. **Order of operations matters.** The richest signal (reviews) takes ~15–60s to fetch + translate + merge. The current flow doesn't kick off reviews until after create — too late to influence the form. We want suggestions to flow into the form *during* Add, with a clean story for late-arriving review signal.
3. **Audit and trust calibration.** Once values can come from Google, scraping, AI-on-reviews, AI-on-editorial-summary, or the operator, the question "who decided this?" becomes important — for operator trust at submit time, and for diagnosing bad data in production.

## Decision

### 1. Two-stage suggestion pipeline

**Stage 1 — inline at Step 1 prefill.** When the operator clicks Continue after entering name + address, the server returns (in addition to today's Google Places fields):

- `type` mapped from Google `types[]` (deterministic table, e.g. `italian_restaurant` → `italian`).
- `tripadvisorUrl` resolved via TripAdvisor Location Search using name + lat/lng (best match, single result).
- `menuUrl` / `reservationUrl` from a website fetch + parse of the Google `website` field (OpenGraph, common `/menu` `/reservations` paths, provider link patterns).
- The reviews pipeline is **kicked off in the background** against the (placeId, tripadvisorUrl) pair. Reviews are persisted against a draft Location row created lazily at end of Step 1 so the existing location-scoped pipeline doesn't need refactoring.

Step 1 prefill latency budget: ~3–5s (Google Places + TripAdvisor search + website scrape, all parallelisable).

**Stage 2 — post-create re-suggest pass.** When `ReviewsFetchPhase` reports merged reviews ready, the LM server calls `/field-suggestion` against the new dining-rollout config for `idealFor`, `title`, and (as a confirmation/refinement) `type`. Behaviour depends on operator state per field:

- If the operator never touched the field after Stage 1, the suggestion is written into the live value with `provenance = ai-reviews` (or `ai-google` — see fallback below).
- If the operator already touched the field, the suggestion is written into `pendingSuggestions.<fieldPath>` (see section 3).

### 2. Field provenance

Every field that can come from multiple sources carries a `FieldProvenance` tag, stored in a sidecar map on the Location row:

```
provenance.type                = "google" | "ai-reviews" | "ai-google" | "operator"
provenance.tripadvisorUrl      = "tripadvisor" | "operator"
provenance.menuUrl             = "scraper" | "operator"
provenance.reservationUrl      = "scraper" | "operator"
provenance.title               = "ai-reviews" | "ai-google" | "operator"
provenance.idealFor[<tag>]     = "ai-reviews" | "ai-google" | "operator"  // per-tag
```

Operator edits flip the corresponding entry to `"operator"`. Provenance renders as a per-field badge in the form (`G` / `TA` / `Scraper` / `AI-R` / `AI-G`); badge disappears the moment the field becomes operator-owned. **Provenance is not synced to Payload** — it's an LM-internal enrichment concept, not a public-facing one.

For `idealFor` specifically: shape on disk stays `string[]` (preserves Payload sync contract), provenance is per-tag in the sidecar map keyed by tag value. This lets a mixed-provenance set (`["date_night" (ai), "groups" (operator)]`) render with mixed badges and survives partial edits without losing audit on the rest.

### 3. Pending-suggestion side channel

When a re-suggest pass produces a value for a field the operator has already touched, the value is written to `pendingSuggestions.<fieldPath>` instead of overwriting the live value. The edit page renders these as ghosted-chip suggestions next to the live field, with an explicit accept/dismiss action.

This preserves three invariants simultaneously:

- Operator decisions are never silently overwritten.
- The system's evolving best-guess is preserved (not lost on first override).
- Re-suggest passes can run as often as needed (new reviews arriving, prompt version bumps) without churning the live record.

### 4. Unusable-reviews fallback

The merged-reviews `unusable: true` flag (ADR-0001) propagates through to suggestion provenance. When reviews are unusable:

- `/field-suggestion` is still called for `idealFor` / `title` but with `reviews` omitted — it falls back to grounded-search-only mode (Google `editorial_summary`, place description).
- Resulting values are tagged `provenance = "ai-google"` instead of `"ai-reviews"`, so the badge tells the operator the signal was thin.

### 5. Service home

The AI re-suggest pass stays in `python-alt-text` via the existing `/field-suggestion` endpoint. The dining rollout from ADR-0001 happens here; no new endpoint. The Stage 1 deterministic suggestions (Google `types[]` mapping, TripAdvisor search, website scrape) live in the LM Node server inside `MapsService.googlePrefill` (extended).

### 6. Renames bundled in the same PR

- `AddRestaurant*` → `AddDining*` across client (`AddRestaurantLocation`, `AddRestaurantStagedForm`, `useAddRestaurantFlow`, `addRestaurantSchema`, `RESTAURANT_DRAFT_STORAGE_KEY`). "Restaurant" leaks an assumption — the dining category covers cafés, bakeries, food carts. The canonical category is `dining`.
- `python-alt-text` package directory rename deferred to a follow-up. The name is misleading (it now does field suggestions for all categories) but renaming a package directory has higher blast radius than the client-side component rename and isn't on the Add Dining critical path.

## Considered alternatives

- **Suggestion chips instead of auto-fill.** Rejected: every field becomes a two-step (suggest → accept). The same end state (operator review before submit) is achievable with auto-fill + visible provenance badges in fewer clicks.
- **Per-field provenance only (whole `idealFor` array as one tag).** Rejected: when the operator adds one operator-picked tag to an otherwise-AI set, per-field provenance forces a choice — flip the whole field to `operator` (loses audit on the AI-picked tags) or stay `ai-reviews` (lies about the operator-picked one). Per-tag avoids the dilemma.
- **Lock the field on first operator edit (no re-suggest after touch).** Rejected: review datasets evolve (new reviews land, translator version bumps). Locking on first touch means the system can never offer an improved suggestion later. The side channel is the cost of staying useful.
- **Overwrite-always until explicit operator confirm.** Rejected: surprises operators who edited intentionally and walked away. The side channel respects the operator's last action while still surfacing the new suggestion.
- **Block submit until background reviews finish.** Rejected: reviews can take a minute. Forcing operators to wait at submit time defeats the speed-up that motivated the change.
- **Scrape menu/reservation in the background instead of inline at Step 1.** Rejected: deterministic single-page HTTP fetch is fast enough to fit in the prefill round-trip budget; running it inline means the Optional section is already filled when the operator reaches it, instead of needing a re-suggest pass for fields the operator could trivially fill themselves.
- **A new dedicated `dining-suggestions` endpoint in python-alt-text.** Rejected: `/field-suggestion` is already generalized per ADR-0001. Adding a category-specific endpoint reintroduces the per-category drift that ADR-0001 explicitly avoided.

## Consequences

- The Location row schema grows two sidecar maps: `provenance` and `pendingSuggestions`. Both are LM-internal; neither is synced to Payload. Migration is additive.
- Step 1 prefill latency increases from "Google call" to "Google + TripAdvisor + website scrape" — ~3–5s budget. Operators will perceive Continue as slower; the trade is they reach Optional with menu/reservation already filled.
- The reviews pipeline must accept a draft Location row created at end of Step 1 instead of after the manual submit. This is a re-ordering, not a refactor — the pipeline is still location-scoped.
- A new "pending suggestions" UI surface appears on the edit page. Operators who never edit a field will never see it; operators who do see ghost-chips for any AI re-suggestion that arrived after their edit.
- Provenance badges are the operator's only signal that a field is system-suggested. Operators who skim the form will accept Google `types[]` → cuisine mapping silently; the badge ensures *that fact is recoverable* during incident review even if the operator didn't notice at the time.
- Once dining ships this pattern, accommodations / attractions / nightlife / key-locations become candidates for the same treatment. Each one is the same shape change: extend `MapsService.googlePrefill` with category-specific deterministic enrichment, add the re-suggest hookup to its post-create flow.

## Open questions

- Whether `pendingSuggestions` should expire (e.g. drop after 30 days uncollected) or persist indefinitely. Indefinite is simpler; expiry avoids stale-prompt suggestions lingering on records the operator clearly doesn't intend to revisit. Deferred until usage data exists.
- Whether `provenance = "ai-google"` (low-signal fallback) should additionally render a louder visual treatment than `ai-reviews`. Same badge for now; revisit if operators report missed bad-signal cases.
