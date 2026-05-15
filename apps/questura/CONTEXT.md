# Context: Questura

## Scope

Public-facing travel platform. Payload CMS backend + Next.js frontend. Serves multi-level location guides (country → city → neighborhood), tours, currencies, paid content via Stripe. **Source of truth for production data.**

## Out of Scope

- Enrichment workflow — Location Manager.
- Article body generation — AI Blog Writer.
- Image variant file generation — Location Manager (per ADR `0001-mediaset-as-public-image-source`).

## Purpose

This is what end users see. Everything else in the meta-monorepo exists to feed Questura. The bounded language here is **public-content language**: collections, pages, guides, placements, currencies, payments.

## Tech Stack

- Next.js 15 + React 19 + TypeScript.
- Payload 3.64 (CMS) + PostgreSQL.
- TanStack Query + Zustand (client state).
- next-intl (i18n), Google Maps, Stripe.
- Tailwind.

## Glossary

### Location

A Payload collection. One row per place at one `LocationLevel`.

### `LocationLevel`

`"country" | "city" | "neighborhood"`.

### `LocationGuideRecord`

Hierarchical content blob for a Location, with sections `media`, `core`, `explore`, `stay`, `move`.

### `resolveLocationGuideForHierarchy`

Server resolver. Merges guide content **up** the hierarchy: neighborhood inherits from city, city from country, with neighborhood values winning.

### `hasMeaningfulLocationGuideValue`

Predicate that decides whether a guide field counts as filled (vs. empty / placeholder / falsy).

### `PerfectForTag`

Taxonomy tag with `applicableTypes` (`dining`, `attractions`, `nightlife`, `accommodations`). Public-facing equivalent of Location Manager's `IdealForTag`.

### Currency

Code, symbol, USD exchange rate. Used for display + conversion.

### Dining / Accommodations / Attractions / Nightlife / KeyLocations

Collections synced inbound from Location Manager.

### Tours

Bookable activities related to Locations. Have their own sync state.

### MediaSet

Canonical public image object — one visual subject across multiple required crops and sizes. Carries a `source` (uncropped original `MediaAsset`) and a `focal_point` so variants can be regenerated. Authoritative definitions: `docs/adr/0001-mediaset-as-public-image-source.md`, `docs/adr/0002-media-source-focal-point-and-pipeline.md`.

### MediaAsset

The uploaded image file used as a specific MediaSet variant, as the source for a MediaSet, or as an internal one-off image (carve-outs only — see ADR 0001).

### MediaPlacement

Public usage slot for a MediaSet (`card`, `square-card`, `wide-card`, `hero`, `article-header`, `open-graph`, …). Each placement defines its own minimum required variants.

### MediaSetStatus

Admin-facing coarse state (empty / partial / usable). **Does not** decide public readiness; placement readiness is decided per-placement and surfaced separately in admin via `isMediaSetReadyForPlacement`.

### MediaSet source

The uncropped original `MediaAsset` retained on a `MediaSet`. The variant pipeline regenerates the 7 variants from the source whenever the focal point changes or a new variant spec is added.

### Focal point

Normalized `(x, y)` coordinates on a MediaSet's source image. The variant pipeline biases all generated crops toward this point. Operator-controlled in admin.

### Variant pipeline / `from-source`

The Sharp-based source-to-variants service owned by Questura. Exposed as `POST /api/media-sets/from-source`. Single implementation; called by both Location Manager sync and Questura editorial uploads.

### View-model (public)

Server module per public-facing feature (e.g. `features/articles/public/view-model.ts`) that turns raw Payload docs into placement-resolved view objects whose image fields are `PublicImage` shapes. The only thing SSR pages call.

### Articles / SingleTypeListicles / ListicleItineraries / ArticleRedirects

Editorial content collections.

### AffiliateProducts / InstagramPosts

Curated external content.

### LocationHomepages

Per-location homepage configuration (block layouts, featured slots).

### Users / Access

Auth + role system. Operator vs end-user vs admin.

## Relationships

- A **MediaSet** has one or more **MediaAsset** variants.
- A **MediaPlacement** defines which **MediaAsset** variants a **MediaSet** must have before that placement can serve it.
- **MediaSetStatus** does not decide public readiness; **MediaPlacement** does.
- A **Location** has zero or one **LocationHomepages** entry per level.
- A **LocationGuideRecord** for a child Location can inherit fields from its parent via `resolveLocationGuideForHierarchy`.
- A **Tour** belongs to one Location.
- **`PerfectForTag.applicableTypes`** scopes a tag to one or more of dining/attractions/nightlife/accommodations.

## Domain Rules

- A `LocationGuide` value counts as filled only when `hasMeaningfulLocationGuideValue` returns true. Empty strings, empty arrays, and placeholders are not filled.
- Image URL selection happens **server-side**, in one media resolver, and is exposed as a placement-ready payload (URL, alt text, dimensions, selected variant, status). Public clients do not pick between `asset.url` / `bunny_original_url` / variant URLs.
- Curated slots fail closed via API/admin validation when their `MediaPlacement` requirements are unmet. The public UI may render graceful placeholders instead of picking a wrong crop.
- `bunny_original_url` is not part of the canonical public serving path (it encodes an Open Graph assumption). It may only be read as a migration fallback.
- New public uploads enter through a MediaSet creation/selection workflow. Direct `MediaAsset` uploads are reserved for internal profile images, inline article body images (until placement-aware serving is needed), migration tooling, and external non-first-class images.
- Editorial body images may remain direct `MediaAsset` references until they need variant-aware serving.
- For synced location content, **LM owns variant file generation**; Questura owns variant attachment validation, MediaPlacement requirements, and public serving.

## Naming Conventions

- Collections: PascalCase plural (`Locations`, `Dining`, `Accommodations`, `Attractions`, `Nightlife`, `KeyLocations`, `Tours`, `Articles`, …).
- API slugs: kebab-case singular (`/api/collections/dining`, `/api/collections/key-locations`).
- Helpers: camelCase verbs (`resolveLocationGuideForHierarchy`, `hasMeaningfulLocationGuideValue`).

## Decisions

- **Payload 3 on Next.js** (single repo for admin + frontend code surface).
- **PostgreSQL** via `@payloadcms/db-postgres` with `push: true` in dev.
- **MediaSet is the public image source** (see ADR 0001). MediaAsset is the file; MediaSet is the visual subject.
- **First placement set**: `card`, `square-card`, `wide-card`, `hero`, `article-header`, `open-graph`. Required variants: `thumbnail`, `square`, `wide`, `hero`, `wide`, `open_graph` respectively.
- **Variant generation lives in Questura** (see ADR 0002). `POST /api/media-sets/from-source` is the single entry point; LM and editorial uploads both go through it. `autoCreateMediaSetForAsset` is removed.
- **Public clients never call the resolver.** Each feature has a server view-model that returns `PublicImage` shapes. SSR renders dumbly.
- **Legacy retirement is part of each migration.** Backfill → flip → delete. No permanent fallbacks; `bunny_original_url` reads die per collection.
- **`next/image` deferred** — placement crops are managed explicitly via MediaSet variants today; adopting `next/image` requires its own ADR (`remotePatterns`, cache, dimensions, priority).

See `docs/adr/` for current ADRs.

## AI Guidance

- **Inspect first:** `apps/server/src/payload.config.ts` for the collection map, then the relevant `features/` folder, then `docs/adr/`.
- **Preserve verbatim:** every collection name above, plus `MediaSet`, `MediaAsset`, `MediaPlacement`, `MediaSetStatus`, `LocationGuideRecord`, `resolveLocationGuideForHierarchy`, `hasMeaningfulLocationGuideValue`, `PerfectForTag`.
- **Do not** pick image variants on the client — the media resolver returns placement-ready payloads.
- **Do not** treat `MediaSetStatus` as a public-readiness check; use `MediaPlacement` rules.
- **Do not** introduce `next/image` opportunistically; it requires an ADR.
- **Do not** define new variant names without checking the placement requirements.
- **Ask before** changing the public path of a Location URL — neighborhood routes are SEO-load-bearing.

## Open Questions

- Long-form article body comes in as LexicalJSON from AI Blog Writer — what is the contract? Today it's implicit.
- `homepage-featured-content` is one of the largest feature folders; should it have its own CONTEXT.md? See suggestion in the meta-root.
- Should the LM-side variant-generation responsibilities be documented in a parallel ADR (LM-side mirror of 0001)?

## Child Contexts

- [apps/server](./apps/server/CONTEXT.md) — Payload + Next.js API
- [apps/client](./apps/client/CONTEXT.md) — Next.js public site
