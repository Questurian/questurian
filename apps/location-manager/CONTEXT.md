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

### Review Evidence Export

Location-scoped export of normalized raw reviews plus category facts for downstream AI use. Location Manager owns the raw review evidence and export shape; downstream systems should not treat the export itself as public content.
Related terms: ReviewsChecklist, JsonExportChecklist, LocationCategory.
Do not confuse with: public article text or Questura's production collection fields.
Code references: `packages/server/src/features/locations/types/tripadvisor-place.types.ts`, `packages/server/src/features/locations/utils/tripadvisor-ai-json.utils.ts`.

### Usable Review Evidence

Filtered review evidence with at least three clean, recent, long-form reviews, enough to support review-backed downstream AI use.
Do not confuse with: the existence of a merged reviews file.

### Legacy Review Evidence

Review evidence produced before the usable-review gate and pre-translation clean-review filtering existed.
_Avoid_: old way

### Review Evidence Refresh

Operator-facing operation that refetches selected external review sources, reruns the review merge, saves a versioned evidence file, and updates review-evidence status.

### Review Evidence Reprocess

Debugging operation that reruns review merge logic against already-saved raw review files without refetching external sources.

### `JsonExportChecklist`

Export-readiness gate before pushing to Payload.

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

## Relationships

- A **Location** has one **LocationHierarchy** and zero or more **IdealForTag**s (scoped by category).
- A **Location** has one **PayloadSyncState** per target collection (`dining`, `accommodations`, `attractions`, `nightlife`, `key-locations`).
- A **Tour** belongs to one Location via `locationKey`; it has its own `TourPayloadSyncState`.
- A **ReviewsChecklist** belongs to one Location; sources include Google Reviews, TripAdvisor Reviews, TripAdvisor Place Data.
- A **Review Evidence Export** belongs to one Location and is the starting point for any future review-derived editorial intelligence.
- **Usable Review Evidence** is a quality gate over a **Review Evidence Export**; below the minimum usable-review count, downstream AI may use location facts but must not treat reviews as evidence.
- A **Review Evidence Refresh** replaces **Legacy Review Evidence** with the newest review-evidence state.
- A **Review Evidence Reprocess** is cheaper than a **Review Evidence Refresh**, but it does not prove the external source data is current.
- A **CorrectionRule** applies to many `LocationHierarchy` rows.

## Domain Rules

- Two Locations may **not** share the same `country|city|neighborhood` key.
- A Location cannot be synced to Payload while its `PayloadSyncChecklist` reports a required field as `missing`/`invalid`.
- Review-backed exports must be gated in the review merge/export layer; UI warnings alone are not sufficient.
- A Review Evidence Export with insufficient usable reviews may still be saved for diagnostics, but downstream AI consumers must receive a structured `insufficient_review_evidence` status instead of treating it as review-backed evidence.
- AI JSON export should represent insufficient usable reviews as a valid JSON state, not an HTTP failure; it may still include location and category facts, but must expose `insufficient_review_evidence` and an empty reviews array.
- AI JSON export should include compact review-evidence diagnostics, such as usable count and required minimum; full rejected-review detail belongs in the diagnostics/report file.
- AI JSON export should reflect the newest review merge state; it should not silently reuse an older usable export after a newer merge produces insufficient usable evidence.
- Operator-facing rerun should mean **Review Evidence Refresh** by default: refetch selected external sources, rerun merge, save a versioned evidence file, and update status.
- Reprocessing existing raw review files is allowed for debugging, but it should not be the default operator-facing rerun.
- A clean review is currently one with at least 150 characters and a valid review date on or after 2023-01-01.
- Clean-review filters that do not require translation, such as text length and review date, should run before translation work where possible.
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
- → **Suggest ADR**: mirror the MediaSet decision on the LM side to document variant-generation responsibilities (which sizes, which formats, who owns the catalogue of placements).

## AI Guidance

- **Inspect first:** `packages/shared/src/types/*.ts` (the contract), then the relevant `features/<domain>` folder on server + client.
- **Preserve verbatim:** `Location`, `LocationHierarchy`, `LocationCategory`, `IdealForTag`, `PayloadSyncChecklist`, `ReviewsChecklist`, `JsonExportChecklist`, `PayloadSyncState`, `Tour`, `ImageVariant`, `CorrectionRule`.
- **Do not** rename `IdealForTag` to match Questura's `PerfectForTag` — they live in different stores and the difference is intentional today.
- **Do not** introduce a code-level dependency on Questura. Coupling is HTTP (`/api/collections/*`) and `/location-guide-contract.json`.
- **Do not** generate MediaSet variant catalogues unilaterally — coordinate with Questura's MediaPlacement rules.
- Ask before changing the `country|city|neighborhood` key shape — it crosses the contract boundary.

## Open Questions

- `IdealForTag` (LM) vs `PerfectForTag` (Questura) — are these intentionally parallel, or should one rename to converge?
- Where is the catalogue of required image variants documented end-to-end? Questura's ADR talks about MediaPlacements; LM has `ImageVariant` types but no placement awareness.
- Should `Tour` have its own CONTEXT.md inside `packages/server`? It has its own PayloadSyncState shape and is the only non-Location entity here.
- Taxonomy corrections feel like they could be a top-level admin module — currently it's split across services.

## Child Contexts

- [packages/server](./packages/server/CONTEXT.md) — Bun + Hono API + SQLite
- [packages/client](./packages/client/CONTEXT.md) — React admin UI
- [packages/shared](./packages/shared/CONTEXT.md) — TS types
- [packages/python-alt-text](./packages/python-alt-text/CONTEXT.md) — Vertex AI alt-text microservice
