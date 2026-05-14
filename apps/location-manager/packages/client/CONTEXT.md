# Location Manager / packages / client — Context

## Purpose
React admin UI for operators: create/browse Locations, run review pipelines, manage taxonomy, watch Payload sync.

## Tech stack
- React 19 + TypeScript + Vite
- React Router, TanStack Query, Zod
- Radix UI + Tailwind

## Ubiquitous language

| Term | Definition |
|------|------------|
| Location | The entity as rendered in forms; same shape as server. |
| `ChecklistCategory` / `ChecklistField` | UI for the `PayloadSyncChecklist`. |
| `ReviewsSourceStep` | UI step for one review source (Google / TripAdvisor Reviews / TripAdvisor Place). |
| `ReviewsMergePhase` | UI for the merge phase that follows fetch. |
| `ExportSection` / `ExportField` | JSON-export preview structure. |
| `IdealForTag` | Picker UI; one of five category-specific groups. |
| `ImageVariant` | Crop / variant selector. |

## Features

- `features/location-create/` — creation form
- `features/location-browse/` — list + search
- `features/admin/` — pipeline dashboards, taxonomy corrections
- `shared/services/api/` — typed SDK to server

## Boundary

- **Owns:** UI + UX, form state, optimistic rendering, pipeline progress display.
- **Delegates:** all persistence + integrations → server.

## Shared contracts

- Imports types from `@questurian/lm-shared` (`../shared`).
- Talks to `packages/server` REST API; renders progress via polling.
