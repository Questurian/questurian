# Context: Location Manager / packages / client

## Scope

React admin UI for operators. Provides:

- Create / browse / edit Locations.
- Run review pipelines and watch progress.
- Manage taxonomy corrections.
- Watch Payload sync state per Location.

## Out of Scope

- Persistence (server owns it).
- External integrations (Google Maps, TripAdvisor, Vertex) — server.
- Public rendering — Questura.

## Purpose

Operators need a tactile UI for a long-running, multi-step workflow (location → reviews → enrichment → image variants → sync). The client mirrors server state via TanStack Query and shows progress through Checklist UIs.

## Tech Stack

- React 19 + TypeScript + Vite.
- React Router 7.
- TanStack Query.
- Radix UI + Tailwind + class-variance-authority + tailwind-merge.
- React Hook Form + Zod (via `@hookform/resolvers`).
- `react-easy-crop` for image crop UI.

## Glossary

### Location

The entity as rendered in forms — same shape as server. Identified by `locationKey` (`country|city|neighborhood`).

### `ChecklistCategory` / `ChecklistField`

UI structures backing the `PayloadSyncChecklist` view. Each field shows `status` (`complete` / `missing` / `invalid`) and optional `recommended`.

### `ReviewsSourceStep`

UI step for one review source (`Google Reviews`, `TripAdvisor Reviews`, `TripAdvisor Place Data`). Renders icon, details (review count, avg rating, languages, …), and available actions.

### `ReviewsMergePhase`

UI for the merge phase that follows fetch.

### `ExportSection` / `ExportField`

JSON-export preview structure.

### `IdealForTag`

Picker UI; one of five category-specific groups (Dining / Nightlife / Accommodations / Attractions / KeyLocations).

### `ImageVariant`

Crop / variant selector.

## Features

- `features/location-create/` — creation form.
- `features/location-browse/` — list + search.
- `features/location-edit/` — edit form, enrichment.
- `features/admin/` — pipeline dashboards, taxonomy corrections.
- `features/tours/` — Tour CRUD.
- `features/health/` — server health surface.
- `shared/services/api/` — typed SDK to server.

## Relationships

- A **`ChecklistCategory`** has many **`ChecklistField`**s; a Location renders one full checklist for each target collection.
- A **`ReviewsSourceStep`** UI cell observes the corresponding server-side `ReviewsSourceStatus`.
- Each Location edit screen renders a `JsonExportChecklist` before Sync action becomes enabled.

## Domain Rules

- Submit / Sync buttons are disabled when the relevant checklist is not green.
- Optimistic updates apply only to display state; the server's reply is authoritative.
- React Hook Form schemas are derived from Zod definitions; do not duplicate them ad hoc.

## Naming Conventions

- Feature folder: kebab-case (`location-create`, `location-browse`).
- Components: PascalCase, one per file.
- Hooks: `use<Domain><Action>`.

## Decisions

- **React Router 7** with the new data-router APIs.
- **Radix + Tailwind** rather than a heavier UI kit — keeps the bundle small and styling local.
- **TanStack Query** owns server-state; Zustand is not used here (server is the source of truth).

## AI Guidance

- **Inspect first:** the relevant `src/features/<feature>/` folder, then `src/shared/services/api/` for the SDK, then the matching `packages/server/src/features/<feature>` for what the server returns.
- **Preserve verbatim:** `ChecklistCategory`, `ChecklistField`, `ReviewsSourceStep`, `ReviewsMergePhase`, `ExportSection`, `ExportField`, `IdealForTag`, `ImageVariant`.
- **Do not** import from `packages/server` — go via the SDK over HTTP.
- **Do not** add new domain types here — they belong in `@questurian/lm-shared`.

## Open Questions

- Lint is intentionally skipped today (`package.json` notes "TypeScript/React baseline not yet clean"). What's the path back to green?
- Image crop UI uses `react-easy-crop`, but the variant catalogue is implicit; should it be config-driven?
- Several features share a "pipeline progress" UI — could it be extracted as a reusable primitive?
