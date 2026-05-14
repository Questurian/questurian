# Location Manager — Context

## Purpose
Internal admin platform. Operators enrich Location records (dining, accommodations, attractions, nightlife, key locations), pull external reviews, generate alt text, and sync into Payload (Questura).

## Tech stack
- Bun + Hono + Zod (server)
- React 19 + Vite + TanStack Query + Radix UI + Tailwind (client)
- TypeScript shared types
- Python 3 + FastAPI + Vertex AI Gemini (alt-text microservice)
- Turbo

## Ubiquitous language

| Term | Definition |
|------|------------|
| Location | Core entity. Identified by key `country\|city\|neighborhood`. |
| `LocationHierarchy` | Flat row holding the three geo parts; nested into country/city tree by `buildNestedHierarchy`. |
| `LocationCategory` | `"dining" \| "accommodations" \| "attractions" \| "nightlife" \| "key_locations"`. |
| `IdealForTag` | Category-specific taxonomy of who/what the location suits. Five variants: `Dining`, `Nightlife`, `Accommodations`, `Attractions`, `KeyLocations`. |
| `ChecklistField` / `PayloadSyncChecklist` | Field-level completion tracking before Payload sync. |
| `ReviewsChecklist` | Progress for Google + TripAdvisor fetch/merge. |
| `JsonExportChecklist` | Export readiness gate. |
| `Tour` | Bookable offering tied to a `locationKey`. |
| `ImageSet` / `ImageVariant` | Multi-variant image bundle (thumbnail/preview/full). |
| `InstagramEmbed` | Curated social post linked to a Location. |
| `TaxonomyCorrection` / `CorrectionRule` | Operator-defined spelling normalization, keyed by `part_type` (country/city/neighborhood). |
| `PayloadSyncState` | Per-collection record of last sync result + Payload doc id. |

## Boundary

- **Owns:** Location CRUD, reviews aggregation, alt-text request orchestration, taxonomy corrections, image processing (Sharp), Payload sync state.
- **Delegates:** alt-text inference → `python-alt-text`; rich content publishing → Payload (Questura); article body generation → AI Blog Writer (out of band).

## Shared contracts

- Internal: `@questurian/lm-shared` types consumed by client + server.
- External: pushes into Payload collections at Questura (`/api/collections/{dining|accommodations|attractions|nightlife|key-locations}`). Output conforms to `/location-guide-contract.json` at meta-root.

## Child contexts

- [packages/client](./packages/client/CONTEXT.md) — React admin UI
- [packages/server](./packages/server/CONTEXT.md) — Bun/Hono API + SQLite
- [packages/shared](./packages/shared/CONTEXT.md) — TS types between client + server
- [packages/python-alt-text](./packages/python-alt-text/CONTEXT.md) — Vertex AI microservice
