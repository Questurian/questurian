# Location Booking URL: unify per-category buy-action field as `bookingUrl`

**Status:** proposed (2026-05-27)

## Context

Locations have category-specific "buy / book / reserve" CTAs: restaurants have a reservation page, hotels have a booking page, attractions sell tickets, nightlife venues take table reservations. The current state of this concept is incoherent:

- **LM DB**: every category table carries a `reservation_url` column (inherited from dining), but only dining writes to it. Non-dining columns are always NULL.
- **LM → Payload mapper**: only `mapDiningPayload` forwards `reservationUrl`. The four other category mappers silently drop it.
- **LM UI**: `ContactFieldsSection.tsx` renders the input only when `category === "dining"`.
- **Payload collections**: dining has `reservationUrl` flat; accommodations has `bookingUrl` nested in `theDetails` (sitting empty because LM never populates it); attractions / nightlife / key_locations have no such field at all.
- **Tour** already owns `bookingLink` as the bookable CTA for a Tour offering — semantically distinct from a Location-level CTA.

Questura is not yet deployed. The dining `reservationUrl` has exactly one frontend consumer (`ListicleVenueInfoGrid.tsx` + its type) and the auto-generated `payload-types.ts`. Pre-deployment is the only cheap moment to converge naming.

## Decision

### 1. One concept, one canonical name: `bookingUrl`

A single field on `Location` named `bookingUrl` represents the location-level purchase/reservation CTA across **dining, accommodations, attractions, nightlife**. **`key_locations` is excluded** — wayfinding entries (airports, transit hubs, landmarks) have no buy-action.

The LM DB column `reservation_url` is renamed to `booking_url` on all five category tables (key_locations included for schema uniformity, even though no flow writes to it). All LM TypeScript references rename from `reservationUrl` to `bookingUrl`.

`menuUrl` is unaffected — a menu link is semantically distinct from a buy-action and remains a dining-only field.

### 2. `Location.bookingUrl` is deliberately distinct from `Tour.bookingLink`

The two names diverge intentionally so a grep makes the boundary obvious:
- `bookingLink` → only on Tours; the CTA for a single bookable offering attached to a Location.
- `bookingUrl` → only on Locations; the CTA for the Location itself.

On Attractions, both may coexist: linked Tours (via `tourIds`) are the primary bookable surface, and `Location.bookingUrl` is the fallback (e.g. a museum that sells direct timed-entry tickets with no third-party tour).

### 3. Payload field placement respects each collection's existing structure

Each Payload collection places `bookingUrl` where its operational metadata already lives:

| Collection | Placement |
|---|---|
| Dining | flat (renamed from `reservationUrl`) |
| Accommodations | nested in `theDetails` (already exists, currently empty) |
| Attractions | nested in `attractionsDetails` (new) |
| Nightlife | nested in `nightlifeDetails` (new) |
| Key Locations | not present |

Structural uniformity (promoting accommodations' field to top-level) was rejected: the `*Details` groups exist to keep operational fields tidy in the CMS admin UI, and `bookingUrl` is operational metadata, not a top-level identity field.

### 4. UI labels diverge per category; the underlying field name does not

Operator-facing input labels are category-appropriate; the form field `name` and the Payload field name remain `bookingUrl` everywhere:

| Category | Label |
|---|---|
| Dining | "Reservation URL" |
| Accommodations | "Booking URL" |
| Attractions | "Tickets URL" |
| Nightlife | "Reservation URL" |

### 5. AI suggestion extends to all four enabled categories

AI grounded field-suggestion supplies `bookingUrl` for any of the four enabled categories. Where AI fires depends on whether the category has an existing autofill flow:

- **Dining** and **Accommodations** — `bookingUrl` is added to the existing add-time AI batch in their respective autofill flows.
- **Attractions** and **Nightlife** — no autofill flow exists today. AI is exposed as a per-field manual "Suggest" button on the add form and the edit page. No batch.

A full autofill flow is **not** built for attractions / nightlife as part of this change. If per-field operator usage validates demand, that's a separate future scope.

### 6. The acknowledgment gate generalises across categories, with different mechanics at add-time vs edit-time

The existing dining gate ("AI-supplied URL fields require explicit operator acknowledgment before Create") generalises to `bookingUrl` for all four enabled categories.

- **Add-time**: AI-supplied `bookingUrl` blocks Create until the operator checks the verify control, edits the URL (flipping provenance to `operator`), or clears it. Same mechanics as the current dining gate, applied uniformly.
- **Edit-time**: AI suggestions surface via the existing **Pending Suggestion** mechanism (`pendingSuggestions.bookingUrl`) as a ghosted chip alongside the live field. The acknowledgment is structural — Accept lands the value, Dismiss discards it — not a Save-button check. Save is not blocked by unaccepted suggestions; this avoids collateral damage to unrelated edits on the same page.

## Considered Alternatives

- **Keep heterogeneous Payload names per category** (`reservationUrl` for dining, `bookingUrl` for accommodations, `ticketsUrl` for attractions, etc.). Rejected because Questura's deployment status makes the rename cheap *now*; deferring it locks in permanent inconsistency.
- **Promote `bookingUrl` to top-level on all collections, including accommodations.** Rejected — the `*Details` groups are deliberately curated; flattening them for one field weakens the CMS admin UX.
- **Operator-only entry, no AI suggestion.** Rejected — operators were specifically asked and chose AI parity with dining.
- **Build new full autofill flows for attractions and nightlife.** Rejected as scope creep — those categories lack the operator-validated need that justified dining's and accommodations' autofill flows.
- **Direct-fill-then-gate-Save on edit pages.** Rejected — `pendingSuggestions` already exists for exactly this case; reusing it is cleaner than inventing new edit-page gate semantics.

## Consequences

- **One-time Payload data migration** required: rename `reservationUrl` → `bookingUrl` on existing dining docs. Acceptable because Questura is not yet deployed; consumer count is one frontend component plus auto-generated types.
- **LM SQL migration** required across five category tables to rename the column.
- **Existing Add Dining autofill flow domain rules** in `apps/location-manager/CONTEXT.md` and references in ADR-0008 that name `reservationUrl` will need string-level updates to `bookingUrl`. The behavior they describe is unchanged.
- **AI service scope expands**: `dining-field-suggestion.service.ts` (today dining-only) becomes a per-category service supplying `bookingUrl` for the four enabled categories. The `/field-suggestion` endpoint stops 400-ing for attractions and nightlife on the `bookingUrl` field.
- **Future consideration**: if per-field AI suggest on attractions / nightlife sees heavy operator use, that's the signal to design proper autofill flows for those categories — informed by which other fields operators actually want AI for.
