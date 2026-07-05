# Context: Questura / apps / client

## Scope

Next.js public site. Renders:

- Location guides at country, city, and neighborhood levels.
- Attractions, dining, accommodations, nightlife listings.
- Tours and bookings.
- Multi-language pages.
- Stripe checkout for paid content.

## Out of Scope

- Data ownership (server / Payload owns it).
- CMS state.
- Article body composition.

## Purpose

The user-facing surface. Everything the end visitor sees flows through this app — SSR pages, client-side interactions, payment, i18n.

## Tech Stack

- Next.js 15 (turbopack in dev) + React 19 + TypeScript.
- TanStack Query + Zustand (client state).
- next-intl (i18n).
- `@googlemaps/js-api-loader` (Maps).
- Stripe (checkout UI; flow orchestrated server-side).
- Tailwind 4.

## Glossary

### Location

A country / city / neighborhood page rendered from a Questura `Locations` row.

### Public content page

An SEO-indexed page rendered for anonymous visitors, such as a Location guide, article, listicle, map page, category page, or listing detail page.
_Avoid_: account page, auth page, payment page, membership page.

### `LocationGuide`

The resolved guide displayed on a Location page, with sections `media`, `core`, `explore`, `stay`, `move`. Comes from `resolveLocationGuideForHierarchy` server-side.

### Attraction / Dining / Accommodation / Nightlife

Listing entities pulled from the corresponding Payload collections.

### Tour

A bookable activity. Rendered with availability + price.

### `PerfectForTag`

Tag used for filter and browse UI. Scoped to a `LocationCategory` via `applicableTypes`.

### Currency

Display + conversion. The user's currency selection affects price formatting throughout.

### Visitor account

Authenticated public-site identity for end visitors using login, signup, profile, saved content, and checkout flows.
_Avoid_: User, staff user, Payload user

### Current principal

Public API view of the authenticated Visitor account or Staff identity making a request.
_Avoid_: raw user, raw session

### Payment

Stripe checkout flow for paid content.

## Routes

- `/`
- `/[country]`
- `/[country]/[city]`
- `/[country]/[city]/[neighborhood]`
- `/api/*` — server endpoints exposed by the client app (not Payload's API).

## Features

- `features/CityDashboard/` — dashboard surfaces for city visitors.
- `features/CityDiscovery/` — discovery / browse views at city level.
- `features/CountryHub/` — country-level hub.
- `features/articles/` — article rendering.
- `features/Navigation/` — header, menu.
- `features/Auth/` — login / signup UI.
- `features/AccountPage/` — user profile / saved guides.
- `features/Payments/` — Stripe checkout UI.

## Relationships

- A **Location** page renders one **`LocationGuide`** plus listings filtered by location.
- A listing card uses a **MediaSet** payload via the server-side media resolver — the client does not pick variants.
- A **Tour** card renders price in the selected **Currency**.
- A `PerfectForTag` filter narrows listings by `applicableTypes`.
- A **Visitor account** is the public identity behind account, saved-guide, profile, and checkout flows.
- A **Current principal** may represent a Visitor account or a Staff identity.
- `GET /api/me` is the canonical current-principal read for client auth state.
- Client flows that require a Visitor account reject a Staff current principal.

## Domain Rules

- SSR uses `resolveLocationGuideForHierarchy` to ensure parent inheritance is applied before render.
- Client code does not pick image variants — it consumes placement-ready payloads from the server.
- Stripe checkout is initiated server-side; the client only renders Stripe's hosted UI or the Elements components.
- i18n strings live under `messages/` and are loaded via `next-intl`. Inline strings are a regression.
- Instagram embeds must keep their loaded third-party DOM stable after mount. `InstagramEmbedBlock` pins the raw blockquote HTML in a memoized leaf so React 19 re-renders cannot re-commit `dangerouslySetInnerHTML` and destroy loaded iframes. Listicle embeds warm in page order with bounded concurrency; do not switch to eager-all loading because slow connections starve concurrent Instagram iframes.

## Naming Conventions

- Feature folder: PascalCase or camelCase as seen (`CityDashboard`, `articles`). Pre-existing inconsistency — keep matching its sibling.
- Routes: file-system based, lower-case path segments.

## Decisions

- **TanStack Query for fetching, Zustand for ephemeral UI state.** Don't conflate them.
- **next-intl** for i18n; locale resolution by URL prefix.
- **Plain `img` for now**; `next/image` is deferred per the server-side ADR.
- **App Router (`app/`)** is the active routing.

## AI Guidance

- **Inspect first:** the relevant `src/features/<feature>/` folder, then `src/app/<route>/`, then the server API call it depends on.
- **Preserve verbatim:** `LocationGuide`, `PerfectForTag`, `Currency`, `Attraction`, `Dining`, `Accommodation`, `Nightlife`, `Tour`.
- **Do not** read raw Payload data without resolution — go via the server endpoint that already calls `resolveLocationGuideForHierarchy`.
- **Do not** pick image variants client-side.
- **Do not** add inline UI strings — register them in `messages/`.
- **Ask before** restructuring route segments — neighborhood URLs are SEO-load-bearing.

## Open Questions

- `staging` exists in some sibling repos as a holding area — does the Questura client need an equivalent for in-progress features?
- The folder naming inconsistency (`CityDashboard` vs `articles`) — should we converge?
- The boundary between `CityDashboard` and `CityDiscovery` isn't obvious from names; worth documenting.

## Flagged Ambiguities

- "User" previously meant an authenticated public visitor in the client context, but Questura now distinguishes **Visitor account** from Staff identity. Resolution: use **Visitor account** for public auth and **Current principal** for API responses that may represent either Visitor or Staff identity.
