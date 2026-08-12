# Context: Questura

## Scope

Public-facing travel platform. Payload CMS backend + Next.js frontend. Serves public location pages (country → city → neighborhood), tours, currencies, paid content via Stripe. **Source of truth for production data.**

## Out of Scope

- Enrichment workflow — Location Manager.
- Article body generation — AI Blog Writer.
- Image variant file generation — Location Manager (per ADR `0001-mediaset-as-public-image-source`).

## Purpose

This is what end users see. Everything else in the meta-monorepo exists to feed Questura. The bounded language here is **public-content language**: collections, pages, placements, currencies, payments.

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

### Location page

Public page for one Location URL, assembled from Location metadata, curated homepage blocks, and filtered public content.
_Avoid_: LocationGuide, guide blob

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

### Itinerary Moment

An optional reader-facing cue on a non-lodging Listicle Itinerary stop. Its stable **Moment key** selects the cue; its optional **Moment label** customizes the displayed wording.
_Avoid_: stop type, daypart, itinerary tag

### AffiliateProducts / InstagramPosts

Curated external content.

### Curated Homepage

Operator-managed homepage made from ordered blocks and curated slots. Includes the main homepage and per-location `LocationHomepages`.

### LocationHomepages

Per-location Curated Homepage configuration (block layouts, featured slots).

### Homepage Page Draft

Private working copy of a Curated Homepage owned by Questura. Do not confuse with AI Blog Writer `Draft`, which is a local generated-content working copy before Sync.
_Avoid_: ABW draft, local draft

### Published Homepage

Public-ready Curated Homepage snapshot. Public rendering should read this snapshot, not the Homepage Page Draft.
_Avoid_: live draft, working homepage

### Homepage availability

Public serving state for a Curated Homepage. A disabled homepage can still have an editable Homepage Page Draft, but public rendering falls back instead of serving its Published Homepage.
_Avoid_: draft disabled, editor lock

### Homepage publish metadata

Audit fields on a Curated Homepage describing the current Published Homepage snapshot: when it was published, who published it, and its revision number.
_Avoid_: version history, rollback log

### Whole-page publish

Promotion of one Homepage Page Draft into one Published Homepage snapshot. The publish unit is the entire homepage, not an individual block.
_Avoid_: block publish, slot publish

### Homepage publish blocker

Any invalid reference, unpublished curated item, missing required image placement, or incomplete required slot that prevents Whole-page publish. Existing Published Homepage stays live until blockers are resolved.
_Avoid_: warning-only publish issue, soft publish error

### Homepage candidate

Published item eligible for selection into a Curated Homepage draft slot. Draft items are excluded by default; any future draft-inclusion mode must still fail closed at Whole-page publish.
_Avoid_: draft candidate, planning item

### Homepage reference lock

Deletion guard that prevents removing editorial content while it appears in either a Homepage Page Draft or a Published Homepage. Applies to `articles`, `single-type-listicles`, and `listicle-itineraries`; the referenced item must be removed from every homepage before deletion is allowed.
_Avoid_: undelatable article, protected content

### Homepage publication lock

Status guard that prevents unpublishing editorial content while it appears in a Published Homepage. Applies to `articles`, `single-type-listicles`, and `listicle-itineraries`; Homepage Page Draft references do not block unpublish, they become Homepage publish blockers.
_Avoid_: draft reference lock, soft delete guard

### Users / Access

Auth + role system. Operator vs end-user vs admin.

### Staff identity

Authenticated Questura operator identity for Payload/admin/editorial access (`admin`, `editor`, `writer`).
_Avoid_: account, customer, member

### Staff grant

Role-derived Membership entitlement for a Staff identity.
_Avoid_: Stripe subscription, manual subscription status

### Author

The public authorship record (display name, bio, avatar, expertise, social links, slug, author page) that carries a byline. Its own collection, optionally linked to a Staff identity, and valid without one.
_Avoid_: author account, author role, author profile (retired 2026-08: authorship is no longer a view of the Staff identity)

### Visitor account

Authenticated public-site identity for end visitors using login, signup, profile, saved content, and checkout flows.
_Avoid_: staff user, member

### Visitor profile

Questura-owned public-site profile and commerce record for one Visitor account.
_Avoid_: credential, session, staff user

### Membership entitlement

Authorization state that determines paid-content access for a Visitor account, or for a Staff identity only through explicit staff-only surfaces.
_Avoid_: identity, account

### Membership entitlement source

Reason a Membership entitlement exists, either `stripe` or `staff_grant`; public account APIs expose only Visitor `stripe` entitlements.
_Avoid_: subscription status, role

### Staff entry point

Login path intended for Staff identities before they reach Payload/admin/editorial surfaces.
_Avoid_: public signup, public OAuth flow

### Operator tool

Internal tool used by Staff identities to manage or produce Questura content outside the public site, including AI Blog Writer and Location Manager.
_Avoid_: visitor app, customer portal

### Visitor entry point

Login and signup path intended for Visitor accounts on the public site.
_Avoid_: admin login, staff SSO

### Visitor auth

Authentication system for Visitor accounts on the public site.
_Avoid_: staff auth, Payload admin auth

### Visitor session

Database-backed login session for a Visitor account.
_Avoid_: custom JWT, frontend token

### Current principal

Public API view of the authenticated Visitor account making a public-site request.
_Avoid_: raw user, raw session, staff identity

### Staff auth

Authentication system for Staff identities entering Payload/admin/editorial surfaces.
_Avoid_: public auth, visitor auth

## Relationships

- A **MediaSet** has one or more **MediaAsset** variants.
- A **MediaPlacement** defines which **MediaAsset** variants a **MediaSet** must have before that placement can serve it.
- **MediaSetStatus** does not decide public readiness; **MediaPlacement** does.
- A **Location** has zero or one **LocationHomepages** entry per level.
- A **Location** may have one **LocationHomepages** entry that supplies curated public page blocks.
- A **Tour** belongs to one Location.
- **`PerfectForTag.applicableTypes`** scopes a tag to one or more of dining/attractions/nightlife/accommodations.
- A **Visitor account** may have an active **Membership entitlement**.
- A **Staff identity** may have a **Staff grant**, but it is not exposed through public account APIs.
- A **Staff identity** has at most one **Author**; an **Author** may exist with no Staff identity at all, and that is a fully valid, renderable state (ADR-0007).
- A **Staff identity** has a lifecycle **status** of `active` or `disabled`. Disabling, not deleting, is how a person is offboarded: a disabled identity cannot sign in and holds no access, while its **Author**, bylines and author page are untouched.
- A **Visitor account** has exactly one **Visitor profile**.
- A **Visitor profile** is durable membership and billing identity. Independent deletion is unsupported until an erasure workflow can coordinate BetterAuth, Stripe, and profile data.
- A **Staff identity** is separate from a **Visitor account**.
- A **Staff identity** enters through a **Staff entry point**, not a **Visitor entry point**.
- An **Operator tool** authenticates Staff identities through a **Staff entry point**.
- **Visitor auth** and **Staff auth** are separate auth surfaces.
- **Visitor auth** uses **Visitor sessions**, not frontend-held custom JWTs.
- Visitor auth cookies use the BetterAuth `questura_visitor` namespace.
- `payload-token` is reserved for Staff auth through Payload.
- `Users` is the Staff identity collection.
- Payload `Users` roles are `admin`, `editor`, and `writer` only.
- Payload `Users.role = "user"` is legacy and removed before launch.
- `VisitorProfiles` is the Visitor profile collection.
- Staff email addresses cannot become Visitor accounts.
- Staff email blocking uses both known staff-domain checks and Payload `Users` lookup.
- Visitor auth flows avoid account-discovery responses except where a user has explicitly submitted a create/update action.
- Visitor auth uses a single email-first entry flow: a visitor enters an email, then Questura determines whether to continue an existing Visitor account sign-in or create a new Visitor account.
- Visitor auth UI does not present separate sign-in and sign-up paths for email/password entry.
- Visitor auth endpoints are abuse-sensitive surfaces and require rate limiting, bot protection, and audit logging.
- Production Visitor auth rate limiting is Redis-backed; database-backed limits are local/spike-only.
- Unverified email/password Visitor accounts may sign in and browse free public content.
- Checkout, paid content, and sensitive account changes require a verified Visitor account.
- Google OAuth Visitor accounts satisfy verification when Google reports a verified email.
- OAuth accounts without provider-verified email must complete Questura verification before gated access.
- Visitor account linking requires matching provider and email/password email addresses.
- Visitor account linking does not merge different email addresses into one Visitor account.
- Questura Server owns Visitor auth runtime.
- Visitor auth records live in Questura Server's Postgres database separately from Payload staff collections.
- BetterAuth table schema is managed by committed Questura Server migrations, not Payload `push`.
- VisitorProfiles owns Visitor account membership and Stripe linkage.
- VisitorProfiles starts narrow: identity mirror, profile names, membership, Stripe linkage, and affiliate referral data.
- BetterAuth owns Visitor account credentials, provider accounts, sessions, and verification state.
- Questura-owned Visitor account product data lives in VisitorProfiles or related Questura collections.
- VisitorProfiles is a Payload collection so Staff identities can support Visitor account membership and Stripe state through the admin surface.
- BetterAuth tables are auth infrastructure and are not treated as Staff-facing support records.
- A **Membership entitlement** has a **Membership entitlement source**.
- A **Staff grant** is derived from role, not Stripe state.
- `admin` and `editor` Staff identities receive a **Staff grant**; `writer` does not.
- `writer` Staff identities may access Payload/editorial surfaces according to collection permissions, but do not receive paid public-content access through the public client.
- Public account APIs return a **Current principal**, not raw auth-provider records.
- `GET /api/me` is the canonical public current-principal endpoint.
- `GET /api/me` ignores Payload Staff auth and returns only Visitor principals.
- Public client flows treat Payload Staff-only auth as logged out.
- Legacy visitor-facing route names may exist only as compatibility adapters over Visitor auth; they must not read or write Payload `Users` as public accounts.
- New Visitor auth is not complete until custom JWT helpers, visitor `payload-token` usage, and `Users.role = "user"` are removed.
- Stripe customer and subscription records belong only to Visitor accounts.
- Staff identities never create Stripe checkout or customer records.
- Payment APIs authenticate through the Current principal and require a Visitor principal for Stripe checkout/customer operations.
- BetterAuth endpoints own Visitor credential, session, verification, and provider-linking operations.
- Questura account APIs exist only for Visitor profile, preference, saved-content, affiliate/referral, and membership-view operations.
- BetterAuth owns Visitor auth email token and flow state.
- Questura's Resend email feature renders and sends Visitor auth emails through BetterAuth mail hooks.

## Domain Rules

- Legacy `guide.*` Location fields are retired; current Location pages are assembled from top-level Location fields, LocationHomepages, and related public content.
- Image URL selection happens **server-side**, in one media resolver, and is exposed as a placement-ready payload (URL, alt text, dimensions, selected variant, status). Public clients do not pick between `asset.url` / `bunny_original_url` / variant URLs.
- Curated slots fail closed via API/admin validation when their `MediaPlacement` requirements are unmet. The public UI may render graceful placeholders instead of picking a wrong crop.
- `bunny_original_url` is not part of the canonical public serving path (it encodes an Open Graph assumption). It may only be read as a migration fallback.
- New public uploads enter through a MediaSet creation/selection workflow. Direct `MediaAsset` uploads are reserved for internal profile images, inline article body images (until placement-aware serving is needed), migration tooling, and external non-first-class images.
- Editorial body images may remain direct `MediaAsset` references until they need variant-aware serving.
- For synced location content, **LM owns variant file generation**; Questura owns variant attachment validation, MediaPlacement requirements, and public serving.
- Any Staff identity may have an Author, regardless of role. Role governs editorial capability; the Author governs public presentation. (Resolved 2026-07: the editor-only public-profile gate contradicted writers receiving bylines on published articles.)
- **Byline implies visibility**: an Author page is publicly visible iff that Author has at least one published editorial item. There is no separate opt-in flag; the legacy `isPublic` checkbox is retired, not left as a dead control. Visibility follows the Author, not the Staff identity, so a departed writer's page stays up.
- A Staff identity edits only the Author linked to its own account (display name, bio, expertise, social links, avatar). The author-page slug is admin-controlled: it auto-generates once and never changes without an admin, because author URLs are public and un-redirected.
- Deleting an Author is admin-only and is refused while any byline still points at it; deleting the Staff identity instead leaves the Author in place with no link.

## Naming Conventions

- Collections: PascalCase plural (`Locations`, `Dining`, `Accommodations`, `Attractions`, `Nightlife`, `KeyLocations`, `Tours`, `Articles`, …).
- API slugs: kebab-case singular (`/api/collections/dining`, `/api/collections/key-locations`).
- Helpers: camelCase verbs.

## Decisions

- **Payload 3 on Next.js** (single repo for admin + frontend code surface).
- **PostgreSQL** via `@payloadcms/db-postgres` with migration-driven schema updates (`push: false`).
- **MediaSet is the public image source** (see ADR 0001). MediaAsset is the file; MediaSet is the visual subject.
- **First placement set**: `card`, `square-card`, `wide-card`, `hero`, `article-header`, `open-graph`. Required variants: `thumbnail`, `square`, `wide`, `hero`, `wide`, `open_graph` respectively.
- **Variant generation lives in Questura** (see ADR 0002). `POST /api/media-sets/from-source` is the single entry point; LM and editorial uploads both go through it. `autoCreateMediaSetForAsset` is removed.
- **Public clients never call the resolver.** Each feature has a server view-model that returns `PublicImage` shapes. SSR renders dumbly.
- **Legacy retirement is part of each migration.** Backfill → flip → delete. No permanent fallbacks; `bunny_original_url` reads die per collection.
- **`next/image` deferred** — placement crops are managed explicitly via MediaSet variants today; adopting `next/image` requires its own ADR (`remotePatterns`, cache, dimensions, priority).

See `docs/adr/` for current ADRs.

## AI Guidance

- **Inspect first:** `apps/server/src/payload.config.ts` for the collection map, then the relevant `features/` folder, then `docs/adr/`.
- **Preserve verbatim:** every collection name above, plus `MediaSet`, `MediaAsset`, `MediaPlacement`, `MediaSetStatus`, `LocationHomepages`, `PerfectForTag`.
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
