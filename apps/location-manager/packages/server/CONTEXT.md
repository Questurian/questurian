# Context: Location Manager / packages / server

## Scope

Bun + Hono REST API. The canonical store for Location enrichment-in-progress. Owns:

- Location CRUD and the geo hierarchy store.
- Reviews fetch + merge pipelines (Google, TripAdvisor).
- Image processing via Sharp.
- Taxonomy corrections.
- Payload sync state per collection and per Tour.

## Out of Scope

- Alt-text inference → delegated to `python-alt-text` over HTTP.
- Final publishing → Payload at Questura (`/api/collections/{dining|accommodations|attractions|nightlife|key-locations}`).
- UI rendering → client.

## Purpose

A single Bun process holds the operator-side state machine so the React client can stay thin and the Vertex side can stay isolated. SQLite is the local store; outbound HTTP is the only way data leaves.

## Tech Stack

- Bun runtime.
- Hono 4.10 + Zod 3.
- Sharp 0.34 (image variants).
- SQLite (local store).
- `@questurian/lm-shared` (type contract).

## Glossary

### Location

Canonical record. Carries enrichment fields: `idealFor`, `nightlifeDetails`, `accommodationsDetails`, `attractionsDetails`, `keyLocationsDetails`, `tripadvisorMealTypes`, `tripadvisorCuisines`, `tripadvisorFeatures`.

### `LocationHierarchy`

Flat country/city/neighborhood row. Helpers: `parseLocationValue`, `buildNestedHierarchy`, `filterCitiesByCountry`, `filterNeighborhoodsByCity`, `getCountries`.

### `InstagramEmbed`

Linked Instagram post. Stored via `instagram-embed.repository`.

### `Upload` / `ImageSetUpload`

Multi-variant image bundle uploaded by operators.

### `ReviewsSourceStep`

One pipeline step: `"Google Reviews"`, `"TripAdvisor Reviews"`, `"TripAdvisor Place Data"`. Each has a `ReviewsSourceStatus` (`not_started` / `fetching` / `complete` / `error`) and per-source details (review count, avg rating, languages, photo count, …).

### `ReviewsMergePhase`

The merge step after fetching. `ReviewsMergeStatus` is `not_started` / `ready_to_start` / `merging` / `complete` / `error`.

### `PipelineStatus`

Generic queued/running/completed/failed enum for any pipeline run.

### `CorrectionRule`

Taxonomy normalization rule keyed by `part_type` (`country` / `city` / `neighborhood`).

### `PayloadSyncState`

Per-collection sync record: Location → Payload doc id + last status.

### `TourPayloadSyncState` / `TourPayloadSyncSummary`

Equivalent for the Tour entity.

### Tour

Bookable activity linked to a Location via `locationKey`.

## Features

- `features/locations/{controllers,services,repositories,models,utils,validation,routes,types,constants,container,scripts}` — main domain.
- Services integrate Google Maps (geocoding), TripAdvisor (reviews + place data), Vertex AI (via the python-alt-text service).

## Relationships

- A **Location** has one **LocationHierarchy**, many **InstagramEmbed**s, many **ImageSetUpload**s, and at most one **PayloadSyncState** per target collection.
- A **ReviewsChecklist** belongs to one Location; has many **ReviewsSourceStep**s and one **ReviewsMergePhase**.
- A **Tour** belongs to one Location via `locationKey`; has its own **TourPayloadSyncState**.
- A **CorrectionRule** is global per `part_type`; applies across many `LocationHierarchy` rows.

## Domain Rules

- Geocoding is skipped when `GOOGLE_MAPS_API_KEY` is unset (the server logs a warning at start).
- Image variant generation is the server's responsibility before sync; the python-alt-text service does not produce variants.
- A `ReviewsMergePhase` cannot enter `merging` until all `ReviewsSourceStep`s are `complete`.
- A Location cannot be pushed to Payload until its `JsonExportChecklist` is green.
- `CorrectionRule` mutations are immediate and authoritative; the next read returns the corrected value.

## Naming Conventions

- One feature per directory under `src/features/`.
- Hono routers: `<feature>.routes.ts`.
- Repositories: `<feature>.repository.ts`.
- Services: `<feature>.service.ts`.
- Zod schemas live next to their consumers under `validation/`.

## Decisions

- **Hono** for routing (fast, Bun-native).
- **Zod** for boundary validation.
- **Sharp inside the Bun process** because variant generation is CPU-bound and benefits from being co-located with the store.
- **SQLite, single-writer assumption** — multi-operator concurrency is currently a non-goal.
- → **Suggest ADR** for the MediaSet variant catalogue on the LM side (mirrors Questura's MediaPlacement spec).

## AI Guidance

- **Inspect first:** the relevant `src/features/<feature>/` folder; `src/server/main.ts` for the entry point; `src/shared/db/client` for SQLite init.
- **Preserve verbatim:** `Location`, `LocationHierarchy`, `ReviewsSourceStep`, `ReviewsMergePhase`, `CorrectionRule`, `PayloadSyncState`, `TourPayloadSyncState`, `Upload`, `ImageSetUpload`, `InstagramEmbed`.
- **Do not** add inference here — call out to `python-alt-text`.
- **Do not** push to Payload outside the sync service — operator scripts must reuse it.
- Ask before changing `locationKey` shape — it is the join key everywhere.

## Open Questions

- The TypeScript baseline is not yet clean (lint is intentionally skipped per `package.json`). Worth tracking what's blocking.
- Should `Tour` get its own feature folder + sub-context, given its own sync state?
- Image variant set is implicit in code; should it be a config the server reads from a contract file?
