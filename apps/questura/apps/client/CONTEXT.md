# Questura / apps / client — Context

## Purpose
Next.js public site. Renders location guides, attractions, bookings, multi-language pages, Stripe checkout.

## Tech stack
- Next.js 15 + React 19 + TypeScript
- TanStack Query + Zustand
- next-intl, Google Maps API, Stripe
- Tailwind

## Ubiquitous language

| Term | Definition |
|------|------------|
| Location | Country / city / neighborhood page. |
| `LocationGuide` | Resolved guide with `media`, `core`, `explore`, `stay`, `move` sections. |
| Attraction / Dining / Accommodation / Nightlife | Listing entities from Payload. |
| Tour | Bookable activity. |
| `PerfectForTag` | Tag used for filter + browse UI. |
| Currency | Display + conversion. |
| User | Authenticated visitor. Saved guides, profile. |
| Payment | Stripe checkout flow. |

## Routes

- `/`
- `/[country]`
- `/[country]/[city]`
- `/[country]/[city]/[neighborhood]`
- `/api/*`

## Boundary

- **Owns:** UI rendering, client state (Zustand), i18n (next-intl), map UI, Stripe flow.
- **Delegates:** all content + auth + payment ops → server.

## Shared contracts

- Consumes Payload GraphQL + REST from `apps/server`.
- Uses server-shared resolution utilities (`shared/lib/locationGuideResolution`) for SSR.
