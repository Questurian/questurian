# Questura — Context

## Purpose
Public-facing travel platform. Payload CMS backend + Next.js frontend. Serves multi-level location guides (country → city → neighborhood), tours, currencies, paid content via Stripe.

## Tech stack
- Next.js 15 + React 19 + TypeScript
- Payload 3.64 (CMS) + PostgreSQL
- TanStack Query + Zustand (client state)
- next-intl (i18n), Google Maps, Stripe

## Ubiquitous language

| Term | Definition |
|------|------------|
| Location | Payload collection. One row per place at one `LocationLevel`. |
| `LocationLevel` | `"country" \| "city" \| "neighborhood"`. |
| `LocationGuideRecord` | Hierarchical content blob for a Location with sections `media`, `core`, `explore`, `stay`, `move`. |
| `resolveLocationGuideForHierarchy` | Server resolver merging guide content up the hierarchy. |
| `hasMeaningfulLocationGuideValue` | Predicate deciding whether a guide field counts as filled. |
| `PerfectForTag` | Taxonomy tag with `applicableTypes` (`dining`, `attractions`, `nightlife`, `accommodations`). Public-facing equivalent of LM's `IdealForTag`. |
| Currency | Code, symbol, USD exchange rate. |
| Dining / Accommodations / Attractions / Nightlife / KeyLocations | Collections synced inbound from Location Manager. |
| Tours | Bookable activities related to Locations. |
| MediaAsset / MediaSet | Image asset + grouping collection. |
| Articles / SingleTypeListicles / ListicleItineraries / ArticleRedirects | Editorial content collections. |
| AffiliateProducts / InstagramPosts | Curated external content. |
| LocationHomepages | Per-location homepage configuration. |
| Users / Access | Auth + role system. |

## Boundary

- **Owns:** public site, all Payload collections, location-guide resolution, i18n, payments.
- **Delegates:** enrichment of dining/accommodations/etc. content (inbound from Location Manager); AI-generated body content (inbound from AI Blog Writer, when used).

## Shared contracts

- External inbound: `/api/collections/*` populated by Location Manager. AI body content arrives as LexicalJSON from AI Blog Writer.
- Contract: `/location-guide-contract.json` at meta-root — field paths, hierarchy resolution rules, AI-fillable fields.

## Child contexts

- [apps/server](./apps/server/CONTEXT.md) — Payload + Next.js API
- [apps/client](./apps/client/CONTEXT.md) — Next.js public site
