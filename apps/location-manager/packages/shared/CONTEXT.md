# Location Manager / packages / shared — Context

## Purpose
Type-only contract between `client` and `server`. No runtime logic.

## Tech stack
- TypeScript 5

## Ubiquitous language

| Term | Definition |
|------|------------|
| `LocationCategory` | `"dining" \| "accommodations" \| "attractions" \| "nightlife" \| "key_locations"`. |
| `IdealForTag` | Union of 5 category-specific variants: `DiningIdealForTag`, `NightlifeIdealForTag`, `AccommodationsIdealForTag`, `AttractionsIdealForTag`, `KeyLocationsIdealForTag`. |
| `ChecklistField` | One field's completion state. |
| `PayloadSyncChecklist` | Field-level readiness for Payload sync. |
| `ReviewsChecklist` | Google/TripAdvisor fetch + merge progress. |
| `JsonExportChecklist` | Export readiness. |
| `AccommodationsOption` | Hardcoded enumerations for accommodations. |
| `ImageVariant` | Thumbnail / preview / full variant identifiers. |
| `DiningTaxonomy` | Establishment types + cuisine groupings. |

## Boundary

- **Owns:** type definitions, exported through `index.ts` barrel.
- **Delegates:** everything else.

## Shared contracts

Imported by both `packages/client` and `packages/server` as `@questurian/lm-shared`.
