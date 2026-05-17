# Context: Location Manager

## Scope

Internal admin platform. Operators use it to:

- Create and edit canonical `Location` records (country / city / neighborhood).
- Aggregate external reviews from Google and TripAdvisor.
- Generate alt text and prose with Vertex AI.
- Apply taxonomy corrections.
- Process and prepare image variants.
- Push enriched records into Payload at Questura.

Owns the **enrichment workflow** and the **canonical Location store** for everything that hasn't reached production yet.

## Out of Scope

- Public rendering of locations / guides — Questura.
- Generating article body content — AI Blog Writer.
- Identity for end users (only operator login).

## Purpose

Questura's Payload is the public source of truth, but populating it from scratch (with reviews, ratings, alt text, taxonomies) is slow and human-intensive. Location Manager exists so operators can stage and quality-check enrichment **before** it goes live. It also coordinates the Vertex AI alt-text microservice and the image variant pipeline.

## Tech Stack

- Bun + Hono + Zod (server)
- React 19 + Vite + TanStack Query + Radix UI + Tailwind (client)
- TypeScript-only shared types
- Python 3 + FastAPI + Vertex AI Gemini (alt-text microservice)
- Turbo

## Glossary

### Location

The core entity. One row per place at one `LocationLevel`. Identified by `country|city|neighborhood` key.
Code references: `packages/server/src/features/locations`, `packages/shared/src/types/location.ts`.

### `LocationHierarchy`

Flat row holding the three geo parts. Helpers: `parseLocationValue`, `buildNestedHierarchy`, `filterCitiesByCountry`, `filterNeighborhoodsByCity`, `getCountries`.

### `LocationCategory`

`"dining" | "accommodations" | "attractions" | "nightlife" | "key_locations"`.

### `IdealForTag`

Category-specific taxonomy of who/what the location suits. Five variants: `DiningIdealForTag`, `NightlifeIdealForTag`, `AccommodationsIdealForTag`, `AttractionsIdealForTag`, `KeyLocationsIdealForTag`.
Do not confuse with: Questura's `PerfectForTag` — the public-facing equivalent. The two must stay coordinated, but they live in different stores.

### `ChecklistField` / `PayloadSyncChecklist`

Field-level completion tracking before Payload sync. Each field tags `status` as `complete` / `missing` / `invalid`, with optional `recommended`.

### `ReviewsChecklist`

Progress for the Google + TripAdvisor fetch + merge pipeline.

### Merged Reviews

Location-scoped file of Google and TripAdvisor reviews after deduplication, length filtering, date filtering, translation, and sorting (filters run on raw source text before translation). The file carries an `unusable: true` flag with a `reason` when the clean review count falls below `MIN_USABLE_REVIEW_COUNT` (currently 5); consumers must inspect this flag and fall back to pure-AI mode when set. Reviews that needed translation but where translation failed are **excluded** from the file (not retained with raw foreign text) and surfaced in the rejects report under action `translation_failed`. Each file carries a self-describing metadata header (`schemaVersion`, `contentHash`, `sources.{google,tripadvisor}` with `fetchedAt` and counts, `pipeline.translatorVersion`, `pipeline.filters` with resolved `minChars` and `minReviewDate`) so consumers can independently judge freshness and detect content drift via the hash. Writes are atomic (`.tmp` + rename) and retained as the latest three per Location. Merged Reviews are the canonical review dataset — there is no separate extracted artifact today.
Do not confuse with: public article text or Questura's production collection fields.

### Translation Cache

SQLite table keyed by `(source, review_id)` storing translated text + title + detected source language plus a `translator_version` tag. The translation step looks up cache hits scoped to the current `translator_version` and only calls the translation API for misses. Invalidation is by **version bump only** — a given source text translates to the same target text, so bumping the version when the model/prompt changes is the sole invalidation path. No TTL. `translator_version` is owned by whoever owns the prompt/model: currently a hand-typed constant on the LM side (`TRANSLATOR_VERSION`), pending the external Leads API emitting a derived (prompt-+-model hash) version per response — at which point LM becomes a passive consumer storing whatever came back. No proactive pruning of old-version rows until cache size becomes a problem. Required because re-running the merge pipeline (e.g., when a new TripAdvisor language file lands) used to re-translate every non-English review from scratch.

### Tour

A bookable offering tied to a `locationKey`. Has its own `PayloadSyncState` (`TourPayloadSyncState`).

### `ImageSet` / `ImageVariant`

A multi-variant image bundle (e.g. thumbnail / preview / full). LM generates variant files before Payload sync (per ADR `0001-mediaset-as-public-image-source` in Questura).

### `InstagramEmbed`

Curated social post linked to a Location.

### `TaxonomyCorrection` / `CorrectionRule`

Operator-defined spelling/normalization rules, keyed by `part_type` (`country` / `city` / `neighborhood`).

### `PayloadSyncState`

Per-collection record of last sync result + Payload doc id. Tracks drift between LM and Questura.

### `FieldProvenance`

Per-field tag recording who supplied a value: `google` | `tripadvisor` | `scraper` | `ai-reviews` | `ai-google` | `operator`. Stored as a sidecar map on the Location (e.g. `provenance.type = "google"`, `provenance.idealFor["date_night"] = "ai-reviews"`). For set-valued fields like `idealFor`, provenance is per-element keyed by tag value. Cleared to `operator` when the operator edits the field. **Not synced to Payload** — provenance is an enrichment-pipeline concept, not a public-facing one. Renders in the operator UI as a per-field badge.

### Pending Suggestion

An AI-derived value that the suggestion pipeline produced *after* the operator already touched the live field. Held in `pendingSuggestions.<fieldPath>` rather than overwriting operator-supplied values. Surfaces on the edit page as a ghosted chip the operator can manually accept. Distinguishes the system's evolving best-guess from the operator's committed choice; lets re-suggest passes run safely without churning confirmed data.

## Relationships

- A **Location** has one **LocationHierarchy** and zero or more **IdealForTag**s (scoped by category).
- A **Location** has one **PayloadSyncState** per target collection (`dining`, `accommodations`, `attractions`, `nightlife`, `key-locations`).
- A **Tour** belongs to one Location via `locationKey`; it has its own `TourPayloadSyncState`.
- A **ReviewsChecklist** belongs to one Location; sources include Google Reviews, TripAdvisor Reviews, TripAdvisor Place Data.
- **Merged Reviews** belong to one Location and feed AI field suggestions (via `python-alt-text`). When `unusable: true`, callers omit reviews and fall back to pure-AI/grounded-search mode.
- **Translation Cache** rows belong to one Location; rows persist across merge runs.
- A **CorrectionRule** applies to many `LocationHierarchy` rows.

## Domain Rules

- Two Locations may **not** share the same `country|city|neighborhood` key.
- A Location cannot be synced to Payload while its `PayloadSyncChecklist` reports a required field as `missing`/`invalid`.
- Merged Reviews keep only reviews with at least `MIN_REVIEW_CHAR_COUNT` characters (currently 150) and a review date no older than `MIN_REVIEW_AGE_YEARS` (currently 3, computed at merge time as `now − N years`). **Both filters are applied to the raw source text before translation** — translating a review only to discard it later is forbidden waste. The resolved cutoff date is written into the artifact's `pipeline.filters.minReviewDate` so historical files remain self-explanatory after the constant changes.
- Reviews that needed translation but for which translation failed (API not configured, API error, missing-from-response) are **excluded** from Merged Reviews — they are not retained with raw foreign text. They are surfaced in the rejects report under action `translation_failed` and remain recoverable on a future re-run via cache miss → retry.
- Merged Reviews are flagged `unusable: true` when the **clean** post-filter post-translation count is below `MIN_USABLE_REVIEW_COUNT` (5). Consumers must check this flag; review-grounded AI calls require it to be `false`.
- At most one merge runs per Location at a time. A second concurrent call against the same Location returns `409 Conflict`.
- The translation step must consult the SQLite translation cache before calling the translation API; cache hits are reused verbatim.
- Image variant files are generated **on the LM side** before sync — Questura validates and serves, but does not produce variants (per the MediaSet ADR).
- TaxonomyCorrections apply uniformly: an applied rule must update all matching rows, not only newly imported ones.
- `IdealForTag` selections are category-bound; an `AccommodationsIdealForTag` may not appear on a `dining` Location.

## Naming Conventions

- Backend modules: `features/<domain>/{controllers,services,repositories,models,utils,validation,routes,types}`.
- Frontend features: `features/location-{create,browse,edit}`, `features/admin`, `features/tours`, `features/health`.
- Shared types: `packages/shared/src/types/<name>.ts`.
- REST: kebab-case under feature root.

## Decisions

- **SQLite on the server** — single-operator workflow today; multi-user can come later.
- **TypeScript shared types only**, not codegen, because client and server are both TS.
- **Alt text is a separate Python service** to keep PyTorch / Vertex out of the Bun process and let the model warm-load.
- **MediaSet ownership split**: LM generates variant files; Questura owns placement-readiness rules (see `apps/questura/docs/adr/0001-mediaset-as-public-image-source.md`).
- **Review enrichment is LM-owned, not exported.** AI Blog Writer's `review2blog` pipeline (the only historic consumer of the AI JSON Export) was removed; reviews now feed `python-alt-text` field suggestions on the LM side directly. There is no longer a downstream review pipeline.
- **Translations are cached in SQLite**, not embedded only in merged-reviews files, so re-runs are idempotent in API cost.
- **Merged Reviews are self-describing**: each file carries a metadata header (`schemaVersion`, `contentHash`, `sources`, `pipeline.filters`, `pipeline.translatorVersion`) so consumers — current and future — can independently judge freshness, detect content drift, and refuse to read incompatible shapes. Sampling and projection live on the consumer side. Writes are atomic and retention is the last 3 per Location. See `docs/adr/0001-review-pipeline-rewrite.md`.
- **Per-Location merge concurrency** is guarded by an in-process mutex; a second concurrent call returns `409 Conflict`. Cross-Location merges run in parallel.
- → **Suggest ADR**: mirror the MediaSet decision on the LM side to document variant-generation responsibilities (which sizes, which formats, who owns the catalogue of placements).

## AI Guidance

- **Inspect first:** `packages/shared/src/types/*.ts` (the contract), then the relevant `features/<domain>` folder on server + client.
- **Preserve verbatim:** `Location`, `LocationHierarchy`, `LocationCategory`, `IdealForTag`, `PayloadSyncChecklist`, `ReviewsChecklist`, `PayloadSyncState`, `Tour`, `ImageVariant`, `CorrectionRule`, `Translation Cache`.
- **Do not** rename `IdealForTag` to match Questura's `PerfectForTag` — they live in different stores and the difference is intentional today.
- **Do not** introduce a code-level dependency on Questura. Coupling is HTTP (`/api/collections/*`) and `/location-guide-contract.json`.
- **Do not** generate MediaSet variant catalogues unilaterally — coordinate with Questura's MediaPlacement rules.
- Ask before changing the `country|city|neighborhood` key shape — it crosses the contract boundary.

## Open Questions

- `IdealForTag` (LM) vs `PerfectForTag` (Questura) — are these intentionally parallel, or should one rename to converge?
- Where is the catalogue of required image variants documented end-to-end? Questura's ADR talks about MediaPlacements; LM has `ImageVariant` types but no placement awareness.
- Should `Tour` have its own CONTEXT.md inside `packages/server`? It has its own PayloadSyncState shape and is the only non-Location entity here.
- Taxonomy corrections feel like they could be a top-level admin module — currently it's split across services.
- (Implemented 2026-05-16) Auto-fill endpoint generalized: `/field-suggestion` accepting `category` + optional `locationId` + optional `reviews?`. LM server fetches latest merged reviews when `locationId` is set, checks `unusable` flag, passes top-20 (`REVIEW_SAMPLE_FOR_AI`) to the Python service when usable. Accommodations branch implemented; other categories return 400 until rollout. Per-field "Suggest" button live on both Create (`AddAccommodationsLocation.tsx`) and Edit (`EditAccommodationsLocation.tsx`) forms.
- (Resolved 2026-05-16) Translation cache invalidation is version-bump only via a `translator_version` column. No TTL, no manual purge.

## Child Contexts

- [packages/server](./packages/server/CONTEXT.md) — Bun + Hono API + SQLite
- [packages/client](./packages/client/CONTEXT.md) — React admin UI
- [packages/shared](./packages/shared/CONTEXT.md) — TS types
- [packages/python-alt-text](./packages/python-alt-text/CONTEXT.md) — Vertex AI alt-text microservice
