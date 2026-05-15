# Questura / apps / server — Context

## Purpose
Payload 3 backend on Next.js. Serves all collections (locations, dining, attractions, …), runs guide resolution, exposes GraphQL + REST.

## Tech stack
- Next.js 15 + Payload 3.64
- PostgreSQL
- TypeScript, Sharp

## Ubiquitous language

| Term | Definition |
|------|------------|
| `Locations` | Hierarchical guide collection (country / city / neighborhood). |
| `LocationGuideRecord` | Hierarchical content blob (`media`, `core`, `explore`, `stay`, `move`). |
| `resolveLocationGuideForHierarchy` | Server resolver. Merges guide fields up the country→city→neighborhood chain. |
| `hasMeaningfulLocationGuideValue` | Predicate. Used by resolver to decide if a value is "filled". |
| `Dining`, `Accommodations`, `Attractions`, `Nightlife`, `KeyLocations` | Synced inbound from Location Manager. |
| `PerfectForTags` (collection) / `PerfectForTag` (record) | Taxonomy: `label`, `slug`, `category`, `applicableTypes`. |
| `Categories` | Country / city / neighborhood codes. |
| `Currencies` | `code`, `symbol`, exchange rates. |
| `Tours` | Bookable activities linked to Locations. |
| `MediaSet` | Canonical public image object that represents one visual subject across required crops and sizes. |
| `MediaAsset` | Uploaded image file used as a specific MediaSet variant or internal one-off image. |
| `MediaPlacement` | Public usage slot for a MediaSet, with its own minimum required variant set. |
| `MediaSetStatus` | Admin-facing coarse state for whether a MediaSet has no variants, some variants, or enough variants to be generally usable. |
| `LocationHomepages` | Per-location homepage content. |
| `Articles`, `SingleTypeListicles`, `ListicleItineraries`, `ArticleRedirects` | Editorial collections. |
| `AffiliateProducts`, `InstagramPosts` | External / curated content. |
| `Users`, `Tags` | Identity + general taxonomy. |

## Features

- `features/data/` — dining, accommodations, attractions, nightlife, key-locations, tours, instagram
- `features/location/` — Locations + guide resolution
- `features/shared/` — currencies, taxonomy, perfect-for tags
- `features/media/` — MediaAsset, MediaSet
- `features/auth/`, `features/payments/`, `features/emails/`

## Boundary

- **Owns:** all collections, guide resolution, payments, email, auth.
- **Delegates:** content enrichment (inbound from Location Manager); long-form article body (inbound LexicalJSON from AI Blog Writer).

## Shared contracts

- Exposes Payload GraphQL + REST to `apps/client`.
- Receives sync writes from external Location Manager (`/api/collections/*`).
- Schema bridge: `/location-guide-contract.json` at meta-root.

## Relationships

- A `MediaSet` has one or more `MediaAsset` variants.
- A `MediaPlacement` defines which `MediaAsset` variants a `MediaSet` must have before that placement can serve it.
- `MediaSetStatus` does not decide public readiness; `MediaPlacement` does.
