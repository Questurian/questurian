# Context: Location Manager

## Scope

Internal admin platform. Operators use it to:

- Create and edit canonical `Location` records (country / city / neighborhood).
- Generate AI field suggestions via grounded Google Search (ADR-0005).
- Generate alt text and prose with Vertex AI.
- Apply taxonomy corrections.
- Process and prepare image variants.
- Push enriched records into Payload at Questura.

Owns the **enrichment workflow** and the **canonical Location store** for everything that hasn't reached production yet.

## Out of Scope

- Public rendering of locations / guides — Questura.
- Generating article body content — AI Blog Writer.
- Identity for end users (only operator login).

## Purpose

Questura's Payload is the public source of truth, but populating it from scratch (with ratings, alt text, taxonomies, idealFor tags) is slow and human-intensive. Location Manager exists so operators can stage and quality-check enrichment **before** it goes live. It also coordinates the Vertex AI alt-text microservice and the image variant pipeline.

## Tech Stack

- Bun + Hono + Zod (server)
- React 19 + Vite + TanStack Query + Radix UI + Tailwind (client)
- TypeScript-only shared types
- Python 3 + FastAPI + Vertex AI Gemini (alt-text microservice)
- Turbo

## Glossary

### Location

The core entity. One row per place at one `LocationLevel`. Identified by `country|city|neighborhood` key.
Code references: `packages/server/src/features/locations`, `packages/shared/src/types/location.ts`.

### `LocationHierarchy`

Flat row holding the three geo parts. Helpers: `parseLocationValue`, `buildNestedHierarchy`, `filterCitiesByCountry`, `filterNeighborhoodsByCity`, `getCountries`.

### `LocationCategory`

`"dining" | "accommodations" | "attractions" | "nightlife" | "key_locations"`.

### `IdealForTag`

Category-specific taxonomy of who/what the location suits. Five variants: `DiningIdealForTag`, `NightlifeIdealForTag`, `AccommodationsIdealForTag`, `AttractionsIdealForTag`, `KeyLocationsIdealForTag`.
Do not confuse with: Questura's `PerfectForTag` — the public-facing equivalent. The two must stay coordinated, but they live in different stores.

### `ChecklistField` / `PayloadSyncChecklist`

Field-level completion tracking before Payload sync. Each field tags `status` as `complete` / `missing` / `invalid`, with optional `recommended`.

### Tour

A bookable offering tied to a `locationKey`. Has its own `PayloadSyncState` (`TourPayloadSyncState`).

### `TourDraft`

Operator-reviewable staging shape for a prospective Tour before confirmation.
_Avoid_: Product, scraped tour.

### Tour Display Title

The operator-approved public-facing title for a Tour, optionally drafted with AI from source context.
_Avoid_: source title, provider title.

### Source Tour Title

The title as supplied by a `Tour Source Provider` before operator review.
_Avoid_: display title.

### Source Product Code

A provider-assigned stable identifier for a source tour, when the provider exposes one.
_Avoid_: LM Tour ID, Payload doc ID.

### `ViatorProduct`

A source-specific bookable offering scraped from Viator before it is mapped into a `TourDraft`.
_Avoid_: Tour, external API record.

### Tour Source Image

A remote source image attached to a `TourDraft` before it becomes an operator-reviewed image set.
_Avoid_: final tour image, Payload media set.

### Tour Source Provider

The website or vendor family a tour import URL belongs to, such as Viator.
_Avoid_: API provider, scraper.

### Unsupported Tour URL

A tour import URL that LM cannot map to a known `Tour Source Provider`.
_Avoid_: invalid URL, failed scrape.

### Duplicate Tour Candidate

A `TourDraft` whose source URL matches an existing Tour's booking link.
_Avoid_: duplicate title, same tour.

### Quick-link Tour flow

The operator workflow launched from an Attractions card on the browse home, where a Tour Source URL is pasted into a modal and the outcome is a Tour linked to *that* attraction in one pass. Composes the existing URL-import preview, `TourFormDialog`, and the attraction's `tourIds` linking — the "quick" is about not leaving the home view and getting the link wired up for free, not about skipping fields. A Duplicate Tour Candidate inside this flow may resolve as a *link to the existing Tour* without creating a second Tour; a non-duplicate URL falls through to the standard `TourDraft` confirm step with `locationKey` prefilled from the attraction.
_Avoid_: attraction tour modal, quick tour, instant tour, tour import shortcut.

### `ImageSet` / `ImageVariant`

A multi-variant image bundle (e.g. thumbnail / preview / full). LM generates variant files before Payload sync (per ADR `0001-mediaset-as-public-image-source` in Questura).

### Location Booking URL

A direct purchase/reservation URL for the Location itself (`bookingUrl`), surfaced per-category with category-appropriate labels (e.g. "Reservation URL" for dining and nightlife, "Booking URL" for accommodations, "Tickets URL" for attractions). Scoped to dining, accommodations, attractions, and nightlife; not applicable to key_locations.
AI may suggest a `bookingUrl` value via grounded field-suggestion for any of the four enabled categories. At add-time the existing URL-acknowledgment gate blocks Create until the AI-supplied value is acknowledged, edited, or cleared — the gate generalises across categories, not dining-only. At edit-time, AI suggestions surface as **Pending Suggestion**s rather than direct field writes; the acknowledgment is structural (operator must Accept the suggestion to apply it) rather than a Save-button check.
_Avoid_: confusing with `Tour.bookingLink`. A Location Booking URL is the location-level CTA; a Tour's `bookingLink` is the CTA for one bookable offering attached to a Location. An attraction may carry both — the Tours linked via `tourIds` and a fallback location-level `bookingUrl`.

### `InstagramEmbed`

Curated social post linked to a Location.

### `TaxonomyCorrection` / `CorrectionRule`

Operator-defined spelling/normalization rules, keyed by `part_type` (`country` / `city` / `neighborhood`).

### `PayloadSyncState`

Per-collection record of last sync result + Payload doc id. Tracks drift between LM and Questura.

### `FieldProvenance`

Per-field tag recording who supplied a value: `google` | `tripadvisor` | `scraper` | `ai` | `operator`. Stored as a sidecar map on the Location (e.g. `provenance.type = "google"`, `provenance.idealFor["date_night"] = "ai"`). For set-valued fields like `idealFor`, provenance is per-element keyed by tag value. Cleared to `operator` when the operator edits the field. **Not synced to Payload** — provenance is an enrichment-pipeline concept, not a public-facing one. Renders in the operator UI as a per-field badge. (Per ADR-0005, the prior `ai-reviews` / `ai-google` distinction collapsed to a single `ai` value.)

### Pending Suggestion

An AI-derived value that the suggestion pipeline produced *after* the operator already touched the live field. Held in `pendingSuggestions.<fieldPath>` rather than overwriting operator-supplied values. Surfaces on the edit page as a ghosted chip the operator can manually accept. Distinguishes the system's evolving best-guess from the operator's committed choice; lets re-suggest passes run safely without churning confirmed data.

### Add Accommodations autofill flow

The add-time workflow where an operator enters a Google place name and address, API prefill fills high-confidence fields, and AI field suggestions fill remaining eligible accommodations fields before the Location is created.
_Avoid_: TripAdvisor review pipeline, accommodations review pipeline.

### Add Dining autofill flow

The add-time workflow where an operator enters name, address, and a TripAdvisor URL (or marks the place as having no TripAdvisor listing); deterministic Google place data and — when supplied — TripAdvisor place data prefill high-confidence fields; and a grounded AI batch fills `idealFor`, `type` (only when Google's `types[]` mapping resolves to null or `other`), `menuUrl`, and `bookingUrl` before the Location is created. The flow is two reviewable phases (Basics, Review) plus the **Add-time photo import**; the prior post-create Stage 2 phase and the post-create Confirm Title phase do not exist in this flow.
_Avoid_: Add Dining Stage 1/Stage 2, ReviewsFetchPhase, dining review pipeline.

### Photo Import flow

Umbrella term for the two operator workflows that pull a Location's photos from Google Places by `placeId`. Bytes are fetched via a server proxy of the Places `media` endpoint; the operator deselects unwanted photos from the returned set (default: all selected); rejected photo `name`s are remembered per-Location as **Rejected Source**s. Scoped today to Accommodations, Dining, and Nightlife.

Two surfaces with structurally different persistence:

- **Add-time photo import** — pre-Create. Selected photos' source bytes are proxied to the browser, cropped client-side through `MultiVariantCropperModal` (all 7 variants mandatory per source), persisted to IndexedDB during the session, and uploaded as multipart parts to an atomic Create call. No Location row exists until every selected source is fully cropped and the Create transaction succeeds. **Does not produce StagedSources.**
- **Operator-staged photo import** — post-Create, item-card "Pull from Google" on the Location's edit surface. Server downloads bytes and writes them as **StagedSource** rows for deferred per-variant cropping in `LocationMediaGallery`.

_Avoid_: photo sync, Google photo upload, place photo pipeline.

### StagedSource

A durable `Upload` row with `format: "imageset"`, source bytes on disk, **no variants yet**, awaiting manual per-variant cropping by the operator. Produced only by **Operator-staged photo import** on the Location's edit surface. The **Add-time photo import** path does *not* produce StagedSources — its sources arrive at Create time with all 7 variants already populated. Promoted to a fully-formed image-set when the operator completes the crop pass for that source. Distinct from **Pending Suggestion** (which holds an AI-derived value awaiting operator acceptance — a different concern).
_Avoid_: pending upload, draft image, uncropped photo (overlapping with operator-uploaded uncropped state).

### Rejected Source

A photo previously returned by Google for a Location that the operator deselected during a **Photo Import flow**. The set of rejected photo `name`s is remembered per-Location so that subsequent re-pulls do not re-surface them as default-selected. Rejection is an operator intent, not a system outcome: photos whose download failed remain re-importable and are **not** rejected.
_Avoid_: deleted photo, hidden photo, failed photo.

### Photo Import provenance

Photos sourced via the **Photo Import flow** carry their Google contributor name in `Upload.imageSet.photographerCredit` (mapped from `authorAttributions[0].displayName`). Operator may edit this string before finalizing the image-set. Provenance otherwise tracked via the existing **FieldProvenance** mechanism is not extended for image-sets today.

### Integration Toggle

An operator-controlled, persistent on/off switch for a paid third-party integration, flipped at runtime from the admin settings surface — its purpose is cost control, not experimentation. Distinct from key-presence configuration: a missing API key hard-disables an integration regardless of its toggle. Today one exists: the **Google Photo Import toggle**, gating both **Photo Import flow** surfaces.
_Avoid_: feature flag (connotes rollout/experimentation), env flag, kill switch.

## Relationships

- A **Location** has one **LocationHierarchy** and zero or more **IdealForTag**s (scoped by category).
- A **Location** has one **PayloadSyncState** per target collection (`dining`, `accommodations`, `attractions`, `nightlife`, `key-locations`).
- A **Tour** belongs to one Location via `locationKey`; it has its own `TourPayloadSyncState`.
- A **Tour** has one **Tour Display Title**.
- A **ViatorProduct** maps into one **TourDraft**; a **TourDraft** may become one **Tour** after operator confirmation.
- A **Source Tour Title** may inform a **Tour Display Title**, but it is not the same value.
- A **Source Product Code** may be attached to a **Tour** as source provenance.
- A **ViatorProduct** may supply one **Tour Source Image** for the **TourDraft** image pipeline.
- An **Unsupported Tour URL** produces no **TourDraft**.
- A **Duplicate Tour Candidate** points at an existing **Tour** but does not automatically update it.
- A **CorrectionRule** applies to many `LocationHierarchy` rows.

## Domain Rules

- Two Locations may **not** share the same `country|city|neighborhood` key.
- A Location cannot be synced to Payload while its `PayloadSyncChecklist` reports a required field as `missing`/`invalid`.
- Image variant files are generated **on the LM side** before sync — Questura validates and serves, but does not produce variants (per the MediaSet ADR).
- TaxonomyCorrections apply uniformly: an applied rule must update all matching rows, not only newly imported ones.
- `IdealForTag` selections are category-bound; an `AccommodationsIdealForTag` may not appear on a `dining` Location.
- In the **Add Accommodations autofill flow**, field ownership precedence is `operator` > API (`google` / `foursquare`) > `ai`; AI suggestions may fill only still-empty/default eligible fields and must not overwrite operator- or API-owned values during the same add flow.
- In the **Add Accommodations autofill flow**, Google/Foursquare owns high-confidence prefill for place identity, coordinates, location key, district, time zone, phone, website, price, perfect-for tags, AC, Wi-Fi, parking, and pool; accommodations does not require a TripAdvisor URL.
- In the **Add Accommodations autofill flow**, AI gap-fill runs automatically as a batch immediately after API prefill; per-field and per-section suggest actions remain as fallback/retry controls.
- In the **Add Accommodations autofill flow**, valid AI suggestions write directly into eligible empty/default form fields, mark those fields as AI-owned, and retain the suggestion's reason/evidence for operator review.
- A **ViatorProduct** cannot create a **Tour** directly; scraped source data must be reviewed as a **TourDraft** because Location and image/media readiness are operator-owned.
- A **Tour Display Title** is operator-approved; AI may suggest it from source context but cannot confirm it.
- A **Tour Source Image** must pass through the normal image review path before a **Tour** is confirmed; remote source images are not final tour images.
- Tour import always begins by detecting the **Tour Source Provider** from the URL; unknown providers surface as **Unsupported Tour URL** rather than falling through to a generic scraper.
- A **Duplicate Tour Candidate** is detected by source URL/booking link, not title; creating a second **Tour** from it requires operator override.
- The **Quick-link Tour flow** is reachable only from an Attractions card on the browse home; other category cards do not surface it.
- In the **Quick-link Tour flow**, a Duplicate Tour Candidate already present in the attraction's `tourIds` resolves as a no-op with an "already linked" notice; a Duplicate Tour Candidate not yet linked resolves as a one-click link (the existing Tour's `locationKey` is **not** mutated); "Import anyway" remains available as an operator override per the duplicate rule above.
- In the **Quick-link Tour flow**, a newly created Tour's `locationKey` prefills from the launching attraction but remains operator-editable inside the confirm step.
- In the **Quick-link Tour flow**, the auto-link write to the attraction's `tourIds` runs after Tour create resolves. A failed link does not roll back the created Tour; the operator may retry the link from the modal or from the attraction edit page's existing tour selector.
- In the **Add Accommodations autofill flow**, automatic AI gap-fill blocks form review briefly with progress, runs with small concurrency, routes to the first review section when complete, and reports failed/low-confidence fields as needing manual review instead of stacking modal suggestions.
- In the **Add Accommodations autofill flow**, AI suggestion reason/evidence is add-session review state only and is not persisted to the Location.
- In the **Add Accommodations autofill flow**, AI failure is not its own create blocker; existing form validation blocks Create when required fields remain blank/default, and operators manually complete those fields. The create UI must surface which required fields are still missing so operators are not left with an unexplained disabled button.
- The **Add Accommodations autofill flow** is client-orchestrated before create: the client calls the existing per-field `/api/field-suggestions` endpoint, manages progress/concurrency/evidence, and does not require a server-side batch endpoint.
- In the **Add Accommodations autofill flow**, API/AI prefill is one-shot for a given name/address signature. Restored drafts do not auto-run AI on page load; changing name/address makes prior prefill stale until Continue is clicked again, while the same already-prefilled signature cannot be rerun unless the operator clears the flow.
- In the **Add Dining autofill flow**, the operator either supplies a TripAdvisor URL at Step 1 or explicitly marks the place as having no TripAdvisor listing; auto-resolution of TripAdvisor URL by external name+coordinate search is not part of this flow.
- In the **Add Dining autofill flow**, field ownership precedence is `operator` > API (`google` / `tripadvisor`) > `ai`. Google owns deterministic prefill for placeId, coordinates, location key, district, time zone, phone, website, hours, and the initial `type` (when Google's `types[]` resolves to a known dining type). When the operator supplied a TripAdvisor URL, TripAdvisor place data prefills meal types, cuisines, features, and neighborhood description in the same Step 1 batch.
- In the **Add Dining autofill flow**, the AI batch fires automatically inline after API prefill and blocks Step 1 with a single processing card until done. AI fills `idealFor` (always), `type` (only when Google deterministic mapping yielded null/`other`), `menuUrl`, and `bookingUrl`. Provenance for AI-supplied values is `ai`.
- In the **Add Dining autofill flow**, AI-supplied URL fields (`menuUrl`, `bookingUrl`) require the operator to explicitly acknowledge each URL — by checking a verify control or by clearing/replacing the URL — before Create is enabled. AI-supplied option-list values (`idealFor`, `type`) do not require this acknowledgment because their domain is bounded.
- In the **Add Dining autofill flow**, the prior post-create AI re-suggest (Stage 2) phase, the post-create Confirm Title phase, the SerpAPI TripAdvisor-URL search by name+coordinates, and the Google-website link scraper for menu/reservation are removed. Title is operator-polished inline in the Review section.
- When the **Google Photo Import toggle** is off, the **Add-time photo import** phase is skipped entirely (no disabled placeholder), and the edit surface hides "Pull from Google" and Retry. Existing **StagedSource**s remain visible and croppable — their bytes are already paid for and local — but Retry is refused because it re-spends against Google.
- An off **Integration Toggle** must be refused server-side on every path that spends against the integration; hiding the client UI is presentation, not enforcement.

## Naming Conventions

- Backend modules: `features/<domain>/{controllers,services,repositories,models,utils,validation,routes,types}`.
- Frontend features: `features/location-{create,browse,edit}`, `features/admin`, `features/tours`, `features/health`.
- Shared types: `packages/shared/src/types/<name>.ts`.
- REST: kebab-case under feature root.

## Decisions

- **SQLite on the server** — single-operator workflow today; multi-user can come later.
- **TypeScript shared types only**, not codegen, because client and server are both TS.
- **Alt text is a separate Python service** to keep PyTorch / Vertex out of the Bun process and let the model warm-load.
- **MediaSet ownership split**: LM generates variant files; Questura owns placement-readiness rules (see `apps/questura/docs/adr/0001-mediaset-as-public-image-source.md`).
- **AI field suggestions use grounded Google Search**, not a stored review dataset. The Google + TripAdvisor review pipeline was removed in ADR-0005; `/field-suggestion` runs grounded Vertex Gemini and surfaces cited passages back to the operator in `sources[].snippet`.
- → **Suggest ADR**: mirror the MediaSet decision on the LM side to document variant-generation responsibilities (which sizes, which formats, who owns the catalogue of placements).

## AI Guidance

- **Inspect first:** `packages/shared/src/types/*.ts` (the contract), then the relevant `features/<domain>` folder on server + client.
- **Preserve verbatim:** `Location`, `LocationHierarchy`, `LocationCategory`, `IdealForTag`, `PayloadSyncChecklist`, `PayloadSyncState`, `Tour`, `ImageVariant`, `CorrectionRule`.
- **Do not** rename `IdealForTag` to match Questura's `PerfectForTag` — they live in different stores and the difference is intentional today.
- **Do not** introduce a code-level dependency on Questura. Coupling is HTTP (`/api/collections/*`) and documented Questura collection/API contracts.
- **Do not** generate MediaSet variant catalogues unilaterally — coordinate with Questura's MediaPlacement rules.
- Ask before changing the `country|city|neighborhood` key shape — it crosses the contract boundary.

## Open Questions

- `IdealForTag` (LM) vs `PerfectForTag` (Questura) — are these intentionally parallel, or should one rename to converge?
- Where is the catalogue of required image variants documented end-to-end? Questura's ADR talks about MediaPlacements; LM has `ImageVariant` types but no placement awareness.
- Should `Tour` have its own CONTEXT.md inside `packages/server`? It has its own PayloadSyncState shape and is the only non-Location entity here.
- Taxonomy corrections feel like they could be a top-level admin module — currently it's split across services.
- (Resolved 2026-05-18, ADR-0005) The Google + TripAdvisor review pipeline was removed. `/field-suggestion` is grounded-only via Vertex `GoogleSearch`. Accommodations + dining stage 2 are wired; other categories return 400 until rollout.
- (Resolved 2026-05-18) In Add Accommodations, "pipeline" means the **Add Accommodations autofill flow**, not the removed Google + TripAdvisor review pipeline.

## Child Contexts

- [packages/server](./packages/server/CONTEXT.md) — Bun + Hono API + SQLite
- [packages/client](./packages/client/CONTEXT.md) — React admin UI
- [packages/shared](./packages/shared/CONTEXT.md) — TS types
- [packages/python-alt-text](./packages/python-alt-text/CONTEXT.md) — Vertex AI alt-text microservice
