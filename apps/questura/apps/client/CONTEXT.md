# Context: Questura / apps / client

## Scope

Next.js public site. Renders:

- Location pages at country, city, and neighborhood levels.
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

An SEO-indexed page rendered for anonymous visitors, such as a Location page, article, listicle, map page, category page, or listing detail page.
_Avoid_: account page, auth page, payment page, membership page.

### Attraction / Dining / Accommodation / Nightlife

Listing entities pulled from the corresponding Payload collections.

### Tour

A bookable activity. Rendered with availability + price.

### Itinerary Moment

A reader-facing cue shown with a non-lodging Listicle Itinerary stop. The Moment key chooses the cue; an optional Moment label replaces its default wording.
_Avoid_: stop type, daypart, itinerary tag

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

- A **Location** page renders server-provided location/homepage/content payloads plus listings filtered by location.
- A listing card uses a **MediaSet** payload via the server-side media resolver — the client does not pick variants.
- A **Tour** card renders price in the selected **Currency**.
- An **Itinerary Moment** presents the vocabulary owned by Questura Server; unknown Moment keys are omitted.
- A `PerfectForTag` filter narrows listings by `applicableTypes`.
- A **Visitor account** is the public identity behind account, saved-guide, profile, and checkout flows.
- A **Current principal** may represent a Visitor account or a Staff identity.
- `GET /api/me` is the canonical current-principal read for client auth state.
- Client flows that require a Visitor account reject a Staff current principal.

## Domain Rules

- SSR reads server public endpoints and view-model payloads; it does not consume raw Payload docs or a LocationGuide blob.
- Client code does not pick image variants — it consumes placement-ready payloads from the server.
- Stripe checkout is initiated server-side; the client only renders Stripe's hosted UI or the Elements components.
- i18n strings live under `messages/` and are loaded via `next-intl`. Inline strings are a regression.
- Instagram embeds must keep their loaded third-party DOM stable after mount. `InstagramEmbedBlock` pins the raw blockquote HTML in a memoized leaf so React 19 re-renders cannot re-commit `dangerouslySetInnerHTML` and destroy loaded iframes. Listicle embeds warm in page order with bounded concurrency; do not switch to eager-all loading because slow connections starve concurrent Instagram iframes.
- An Itinerary Moment uses its Moment label when present; otherwise it uses the default wording for its Moment key.

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
- **Preserve verbatim:** `PerfectForTag`, `Currency`, `Attraction`, `Dining`, `Accommodation`, `Nightlife`, `Tour`.
- **Do not** read raw Payload data directly — go via server public endpoints/view-model payloads.
- **Do not** pick image variants client-side.
- **Do not** add inline UI strings — register them in `messages/`.
- **Ask before** restructuring route segments — neighborhood URLs are SEO-load-bearing.

## Open Questions

- `staging` exists in some sibling repos as a holding area — does the Questura client need an equivalent for in-progress features?
- The folder naming inconsistency (`CityDashboard` vs `articles`) — should we converge?
- The boundary between `CityDashboard` and `CityDiscovery` isn't obvious from names; worth documenting.

## Flagged Ambiguities

- "User" previously meant an authenticated public visitor in the client context, but Questura now distinguishes **Visitor account** from Staff identity. Resolution: use **Visitor account** for public auth and **Current principal** for API responses that may represent either Visitor or Staff identity.
