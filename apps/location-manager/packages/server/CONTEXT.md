# Location Manager / packages / server — Context

## Purpose
Bun/Hono REST API. Owns the canonical Location store, runs review pipelines, processes images, drives Payload sync.

## Tech stack
- Bun, Hono, Zod
- Sharp (image processing)
- SQLite (local store)

## Ubiquitous language

| Term | Definition |
|------|------------|
| Location | Canonical record. Carries enrichment fields: `idealFor`, `nightlifeDetails`, `accommodationsDetails`, `attractionsDetails`, `keyLocationsDetails`, `tripadvisorMealTypes`, `tripadvisorCuisines`, `tripadvisorFeatures`. |
| `LocationHierarchy` | Flat country/city/neighborhood row. Helpers `parseLocationValue`, `buildNestedHierarchy`, `filterCitiesByCountry`, `filterNeighborhoodsByCity`, `getCountries`. |
| `InstagramEmbed` | Linked Instagram post. Stored via `instagram-embed.repository`. |
| `Upload` / `ImageSetUpload` | Multi-variant image bundle. |
| `ReviewsSourceStep` | Pipeline step: `"Google Reviews"`, `"TripAdvisor Reviews"`, `"TripAdvisor Place Data"`. |
| `CorrectionRule` | Taxonomy normalization rule keyed by `part_type` (`country` / `city` / `neighborhood`). |
| `PayloadSyncState` | Per-collection sync record (Location → Payload doc + status). |
| `TourPayloadSyncState` / `TourPayloadSyncSummary` | Equivalent for Tours. |
| Tour | Bookable activity. Linked via `locationKey`. |

## Features

- `features/locations/{controllers,services,repositories,models,utils,validation}` — main domain
- Services integrate Google Maps, TripAdvisor, Vertex AI

## Boundary

- **Owns:** Location store, review fetch + merge, image processing, taxonomy corrections, Payload sync state.
- **Delegates:** alt-text + neighborhood prose → `python-alt-text` (HTTP); final publishing → Payload at Questura (`/api/collections/{dining|accommodations|attractions|nightlife|key-locations}`).

## Shared contracts

- Imports types from `@questurian/lm-shared`.
- Output conforms to `/location-guide-contract.json` at meta-root.
