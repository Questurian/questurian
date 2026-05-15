# Context: Location Manager / packages / shared

## Scope

Type-only contract between LM `client` and LM `server`. Pure TypeScript declarations exported through `src/index.ts`.

## Out of Scope

- Runtime logic.
- Validation (Zod schemas live with consumers — server-side validation, client-side form schemas).
- I/O of any kind.

## Purpose

Client and server are both TypeScript and share extensive shape — checklists, enums, taxonomy. Centralising the types here keeps drift out of the system.

## Tech Stack

- TypeScript 5.

## Glossary

### `LocationCategory`

`"dining" | "accommodations" | "attractions" | "nightlife" | "key_locations"`.

### `IdealForTag`

Union of five category-specific variants: `DiningIdealForTag`, `NightlifeIdealForTag`, `AccommodationsIdealForTag`, `AttractionsIdealForTag`, `KeyLocationsIdealForTag`.

### `ChecklistField`

One field's completion state: `name`, `fieldPath`, `value`, `required`, `status` (`complete` / `missing` / `invalid`), optional `recommended`, `note`, `minRequired`, `valueCount`.

### `ChecklistCategory`

A grouping of `ChecklistField`s under a `category` heading.

### `PayloadSyncChecklist`

Field-level readiness for Payload sync. Includes `completionPercent`, `lastSyncedAt`, `syncStatus`, `targetCollection`, `items`, `summary`, `canSync`, `actions`.

### `ReviewsChecklist`

Google + TripAdvisor fetch + merge progress.

### `ReviewsSourceStatus` / `ReviewsMergeStatus` / `PipelineStatus`

Status enums for review-fetch steps, the merge phase, and generic pipeline state.

### `JsonExportChecklist`

Export-readiness gate.

### `AccommodationsOption`

Hardcoded enumerations for accommodations details (e.g. property types, amenities).

### `ImageVariant`

Variant identifier (thumbnail / preview / full).

### `DiningTaxonomy`

Establishment types + cuisine groupings.

### `ApiResponse<T>`

Standard envelope for server responses.

## Relationships

- `PayloadSyncChecklist` has many `ChecklistCategory`s, each with many `ChecklistField`s.
- `ReviewsChecklist` has many `ReviewsSourceStep`s and one `ReviewsMergePhase`.
- `IdealForTag` is a discriminated union by `LocationCategory`.

## Domain Rules

- Types are append-mostly; renaming a field is a contract change for both client and server.
- Status enums are stringly-typed unions; do not introduce numeric statuses.
- Discriminated unions (`IdealForTag`) must keep their discriminator field stable.

## Naming Conventions

- One type group per file under `src/types/`.
- File names kebab-case matching the dominant concept (`location.ts`, `location-category.ts`, `location-ideal-for.ts`, `accommodations-options.ts`, `dining-taxonomy.ts`, `image-variant.ts`, `api-response.ts`).
- Re-exported via `src/index.ts` barrel.

## Decisions

- **Types only — no runtime.** Validation schemas live with their consumers because Zod schemas double as runtime checks and shouldn't be imported into the bundle by every page.
- **No code generation.** Manual maintenance is fine given two consumers and no remote schema.

## AI Guidance

- **Inspect first:** `src/index.ts` to see the public surface, then the specific type file.
- **Preserve verbatim:** every type and union member listed above.
- **Do not** add runtime helpers here — they go in the consumer.
- **Do not** add MediaSet / MediaAsset types here unless LM grows its own MediaSet awareness; today those are Questura-side concepts.

## Open Questions

- `DiningTaxonomy` overlaps with `tripadvisorMealTypes` / `tripadvisorCuisines` / `tripadvisorFeatures` on the Location entity. Is the canonical taxonomy here, or are those independent?
- Could the checklist types be generated from the field-definition source on the server? Today they're hand-maintained.
