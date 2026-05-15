# Context: Questura / apps / server

## Scope

Payload 3 backend running on Next.js 15. Owns:

- Every Payload collection (Locations, Dining, Accommodations, Attractions, Nightlife, KeyLocations, Tours, Articles, listicles, redirects, MediaSet, MediaAsset, PerfectForTags, Categories, Tags, Currencies, AffiliateProducts, InstagramPosts, LocationHomepages, Users).
- Guide resolution up the country → city → neighborhood hierarchy.
- GraphQL + REST endpoints.
- Auth, payments (Stripe), email (Resend).

## Out of Scope

- UI rendering (Next.js client app).
- Variant file generation for synced location content (Location Manager).
- Article body composition (AI Blog Writer).

## Purpose

This is the canonical store for Questura. Everything written here lives in Postgres and is the source of truth for production. The collection map is the authoritative public-content schema.

## Tech Stack

- Next.js 15 + Payload 3.64.
- PostgreSQL via `@payloadcms/db-postgres` (push mode in dev).
- TypeScript, Sharp.
- `@seshuk/payload-storage-bunny` for CDN image storage.
- `@payloadcms/email-resend` for transactional mail.
- Stripe SDK for payments.

## Glossary

### `Locations`

Hierarchical guide collection. Each row carries a `LocationLevel` (`country` / `city` / `neighborhood`) and may carry a `LocationGuideRecord`.

### `LocationGuideRecord`

Hierarchical content blob with sections `media`, `core`, `explore`, `stay`, `move`.

### `resolveLocationGuideForHierarchy`

Server resolver. Merges guide fields up the country → city → neighborhood chain, with the more specific level winning.

### `hasMeaningfulLocationGuideValue`

Predicate. Used by the resolver to decide whether a value is "filled".

### `Dining` / `Accommodations` / `Attractions` / `Nightlife` / `KeyLocations`

Collections synced inbound from Location Manager via `/api/collections/<slug>`.

### `PerfectForTags` (collection) / `PerfectForTag` (record)

Taxonomy: `label`, `slug`, `category`, `applicableTypes`.

### `Categories`

Country / city / neighborhood code records.

### `Currencies`

`code`, `symbol`, exchange rates (synced via `sync:exchange-rates` script).

### `Tours`

Bookable activities linked to Locations.

### `MediaSet`

Canonical public image object. See ADR `0001-mediaset-as-public-image-source.md`.

### `MediaAsset`

Uploaded image file used as a MediaSet variant or as an internal one-off.

### `MediaPlacement`

Public usage slot. Defines required variants per placement (`card`, `square-card`, `wide-card`, `hero`, `article-header`, `open-graph`).

### `MediaSetStatus`

Admin-facing coarse state (empty / partial / usable). **Not** a public-readiness check.

### `LocationHomepages`

Per-location homepage content (featured blocks).

### `Articles`, `SingleTypeListicles`, `ListicleItineraries`, `ArticleRedirects`

Editorial collections.

### `AffiliateProducts`, `InstagramPosts`

External / curated content collections.

### `Users`, `Tags`

Identity + general-purpose taxonomy.

## Features

- `features/data/` — dining, accommodations, attractions, nightlife, key-locations, tours, instagram, affiliate.
- `features/location/` — Locations collection + guide resolution.
- `features/articles/` — articles, single-type-listicles, listicle-itineraries, redirects, shared, public.
- `features/homepage-featured-content/` — large family of blocks (article-grid, article-list, featured-article, featured-article-carousel, featured-articles, hotel-grid, location-grid, things-to-do-attractions, things-to-do-listicles, tour-grid, where-to-eat-drink, newsletter-signup, questurian-maps, slot-count, convert-empty-block, location-homepage-blocks, resolve-page-blocks).
- `features/shared/` — currencies, taxonomy (Categories + Tags), perfect-for, config.
- `features/media/` — MediaAsset + MediaSet collections + resolver lib + migration code.
- `features/seo/` — SEO collections + lib.
- `features/auth/` — Users + access.
- `features/payments/` — Stripe flow.
- `features/emails/` — transactional email templates.
- `features/places/` — Places (Google) integration utilities.
- `features/admin/` — Payload admin customisations.

## Relationships

- A **Location** has at most one **LocationHomepages** record per level.
- A **LocationGuideRecord** for a child Location can be augmented by `resolveLocationGuideForHierarchy` with parent values.
- A **MediaSet** has many **MediaAsset** variants.
- A **MediaPlacement** declares which variant labels a `MediaSet` must contain before that placement may serve it.
- **MediaSetStatus** is informational only; not consulted at serve time.
- A **Tour** belongs to one **Location**.
- A **`PerfectForTag.applicableTypes`** restricts the tag to a subset of `(dining, accommodations, attractions, nightlife)`.

## Domain Rules

- Image URL selection is a server concern. Public clients receive a **placement-ready payload** (URL, alt text, dimensions, selected variant, status).
- Curated slots **fail closed** through API + admin validation when their placement requirements are unmet. The public UI renders graceful placeholders rather than picking a wrong crop.
- `bunny_original_url` is **not** the canonical public source — it's a 1200×630 upload assumption tied to Open Graph. Use only as an observable migration fallback.
- `MediaSetStatus` ≠ "all variants exist". It's an admin signal, not a serving gate.
- `Currencies` exchange rates are pulled via `sync:exchange-rates`; do not hand-edit live values.
- Synced inbound writes from Location Manager must validate against the collection schema; rejected writes return 4xx with a reason.
- `resolveLocationGuideForHierarchy` is the **only** correct way to read a Location's guide for SSR; do not read `Locations` directly without resolving.

## Naming Conventions

- Collection slugs: kebab-case singular (`location-homepages`, `media-assets`).
- File names match `Collection.ts` for collection definitions.
- Helper functions: camelCase verbs.
- Migration scripts: under `scripts/` or `src/scripts/`, snake-case is OK for db/migrations files.

## Decisions

- **MediaSet ADRs** govern all public-image work — read both before touching media code: `0001-mediaset-as-public-image-source.md` (carve-outs, placement model) and `0002-media-source-focal-point-and-pipeline.md` (source/focal-point on MediaSet, `from-source` pipeline owned here, view-model layer, retirement-as-deliverable).
- **Push mode in dev** (`db.push: true`) — schema migrations are pulled from collection definitions; production migrations live in `src/migrations/`.
- **Bunny CDN storage** for media via the official plugin.
- **Resend** for email; **Stripe** for payments — single providers, not abstracted.
- **`next/image` is deferred** — see the ADR. Adopting it needs its own decision.
- → **Suggest ADR**: the inbound LexicalJSON contract from AI Blog Writer; today it's implicit.
- → **Suggest ADR**: the inbound write contract from Location Manager (which fields LM owns vs which Questura owns); the field list lives in `/location-guide-contract.json` but the rule of ownership is not separately documented.

## AI Guidance

- **Inspect first:** `src/payload.config.ts` (collection map), then `docs/adr/`, then the relevant `features/` folder, then the collection file (`features/<area>/collections/<Collection>.ts`).
- **Preserve verbatim:** every collection and helper name in the glossary. Renaming a collection slug is a public-URL change.
- **Do not** read a Location guide field directly — use `resolveLocationGuideForHierarchy`.
- **Do not** decide image URLs on the client — go through the media resolver.
- **Do not** treat `MediaSetStatus` as gating public serving.
- **Do not** introduce `next/image` without an ADR.
- **Ask before** changing collection slugs, route shapes, or hook signatures that admin UI depends on.

## Open Questions

- `homepage-featured-content` is large enough to deserve its own context — many sub-blocks with their own vocabulary.
- The inbound LexicalJSON contract from ABW is not documented anywhere.
- The seeded scripts (`seed:currencies`, `seed:locations`, `bootstrap:currencies`) overlap; is there a canonical bootstrap path?
- `features/places/` overlaps semantically with `features/location/`; what's the boundary?
