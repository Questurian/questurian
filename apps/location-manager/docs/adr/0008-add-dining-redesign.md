# Add Dining: collapse Stage 1/Stage 2 into a single pre-create autofill batch

**Status:** proposed (2026-05-23)

**Partially supersedes:** [ADR-0002](./0002-add-dining-auto-fill.md) §1 Stage 1 (TripAdvisor URL search, website link scrape), §1 Stage 2 (all), §6 (`ReviewsFetchPhase`/`Stage2Phase` wiring).

## Context

ADR-0002 designed Add Dining as a two-stage pipeline. Step 1 prefill: Google Places + SerpAPI TripAdvisor search by name+lat/lng + Google-website link scrape for `menuUrl`/`reservationUrl`. Step 2 (post-Create): grounded AI for `idealFor` and `type` refinement, via the `Stage2Phase` UI. ADR-0005 removed the review-fetching subsystem but left both stages and the SerpAPI URL search intact.

In practice the three "Optional / Links" fields (`tripadvisorUrl`, `menuUrl`, `reservationUrl`) are populated by the automation a small fraction of the time:

- The SerpAPI TripAdvisor URL search misfires on chains, sub-locations, and non-English names often enough that operators paste the URL by hand anyway.
- `scrapeRestaurantLinks` over the Google-listed website almost never yields menu or reservation outlinks — most restaurant sites don't expose them through OpenGraph, common paths, or known providers (OpenTable/Resy/SevenRooms).

So today's flow has the operator typing the TripAdvisor URL manually, leaving menu/reservation blank, then sitting through a Stage 2 phase that only fills `idealFor` and (sometimes) `type`. The promised auto-fill never happens; the wait is real.

Two additional facts changed the calculus:

1. **Grounded Gemini handles free-text URL outputs.** The `/field-suggestion` endpoint is option-constrained today (`single` / `multi`), but the underlying model already does grounded web queries. Extending the endpoint with a `kind: "url"` variant means menu/reservation URLs can be sourced the same way `idealFor` and `type` already are — uniform pipeline, same `sources[].snippet` citations, same provenance shape.
2. **Operator burden of pasting a TripAdvisor URL is smaller than the burden of debugging a wrong auto-resolved URL.** A wrong TripAdvisor URL silently merges wrong cuisines, meal types, and features into the Location row at post-Create time. Operators have to notice and fix it. Asking the operator to paste the URL upfront (one browser tab) eliminates that whole class of error.

## Decision

### 1. Step 1 input becomes name + address + TripAdvisor URL (or "No TripAdvisor listing" checkbox)

The Basics section asks for three fields:
- Name
- Address
- TripAdvisor URL **or** a "No TripAdvisor listing" checkbox

Continue is blocked until name and address validate and either the URL parses per the existing `extractTripadvisorLocationId` pattern (`...-d<locationId>-Reviews-...`) or the checkbox is checked. The SerpAPI search-by-name-and-lat/lng branch (`searchTripadvisorUrl`) is removed from `MapsService.resolveDiningEnrichment`. The "No TA listing" intent is not persisted to the Location row in this iteration — the absence of `tripadvisorUrl` serves as the signal (see Open Questions).

### 2. Continue triggers a single blocking batch with sub-step progress

A single `ProcessingCard` displays the running sub-step. Three groups, parallelised where independent:

1. **Google Places prefill** — unchanged. Returns `placeId`, `lat/lng`, `locationKey`, `district`, `ianaTimeId`, `phoneNumber`, `website`, `operationHours`, and `type` via the deterministic `mapGoogleTypesToDiningType` mapping (`italian_restaurant` → `italian`, etc.).
2. **TripAdvisor place fetch** — when the operator supplied a TA URL, `TripAdvisorPlaceService.fetchAndMergePlaceData` runs **inline pre-Create** instead of post-Create. Adds meal types, cuisines, features, neighborhood description, and trusted hours overrides. Skipped entirely when "No TripAdvisor listing" is checked.
3. **AI grounded batch** via the extended `/field-suggestion` (see §6):
   - `idealFor` — multi, ≤4. Always.
   - `type` — single. Only when group 1's deterministic mapping yielded null or `other`.
   - `menuUrl` — `kind: "url"`. Always.
   - `reservationUrl` — `kind: "url"`. Always.

The batch is client-orchestrated (consistent with the **Add Accommodations autofill flow** precedent). The progress card shows: `Google done ✓ → TripAdvisor done ✓ → AI suggestions running… → done`. Realistic latency floor ~15s; the explicit progress UI matches operator expectation.

### 3. Stage 2 phase is removed

The following are deleted from the dining flow:

- `apps/location-manager/packages/client/src/features/location-create/components/Stage2Phase.tsx`
- `apps/location-manager/packages/server/src/features/locations/controllers/core/dining-stage2.controller.ts`
- `apps/location-manager/packages/server/src/features/locations/services/integrations/dining-stage2-suggestion.service.ts`
- The `stage2` value in `DiningPhase`, its route in `AddDiningLocation.tsx`, and `runDiningStage2Suggest` on the client API.

Per-field "Suggest" buttons on the **edit page** stay — they hit `/api/field-suggestions` directly and remain useful for re-running suggestions after operator edits. The `pendingSuggestions` side channel stays alive for that case; it is no longer fed by Add.

### 4. Confirm Title phase is removed

`ConfirmLocationPhase` is no longer routed by `AddDiningLocation.tsx`. Title, phone, and website are reviewed inline in the new Review section before Create. Title defaults to the Google source name and is operator-polished in-form. AI title polish is **not** part of this iteration (see Open Questions).

This trims one phase, one mutation roundtrip, and one mental context switch.

### 5. Form sections collapse from five to three: Basics → Review → Photos

- **Basics** — name, address, TripAdvisor URL or "No TA listing" checkbox. Continue triggers the batch.
- **Review** — single screen showing every prefilled and AI-filled field with provenance badges (G, TA, AI, Operator). Replaces today's Place + Classification + Links + (post-Create) Confirm Title. Operator inline-edits title, phone, website, type, idealFor, menuUrl, reservationUrl, and the place-identity fields.
- **Photos** — unchanged (`PhotoImportPhase`).

### 6. Python `/field-suggestion` grows `kind: "url"`

A new request kind alongside today's `single` / `multi`. The python service:

- Sets the grounded prompt to "return a single HTTP/S URL for the [menu | reservations] page of [restaurant name, address]."
- Validates the response is a well-formed URL with `http://` or `https://` scheme. Invalid responses are returned with `confidence: 0` so the existing skip-on-low-confidence branch handles them.
- Populates `sources[].snippet` with grounded citation context (same as today).
- Returns `confidence` like today; values below `MIN_AI_CONFIDENCE` (0.6) are skipped client-side.

### 7. AI-supplied URL acknowledgment invariant

`menuUrl` and `reservationUrl` AI-supplied values render with an "I verified this link works" checkbox alongside the URL input. The checkbox defaults unchecked. The Create button is disabled until each AI-provenanced URL is either:

- Acknowledged (operator checks the box), or
- Cleared/replaced (operator edits the URL — provenance flips to `operator`, which is implicit acknowledgment).

This invariant does **not** apply to AI-supplied option-list fields (`idealFor`, `type`). Their domain is bounded — there is no analogue of "wrong but plausible URL" because the value is constrained to enum members.

### 8. TripAdvisor place fetch timing moves pre-Create

Today `addMapsLocation` calls `fetchAndMergePlaceData` after `saveLocationOrThrow`. After this ADR, when a TA URL is provided at Step 1, the fetch runs inline as part of `resolveGooglePrefill`. Its results flow back into the Step 1 response so the operator's Review payload already contains TripAdvisor-derived fields. The post-Create fetch path stays for other categories that may set `tripadvisorLocationId` differently; for dining adds it becomes a no-op because the data is merged via the Create payload directly.

## Considered alternatives

- **Scrape the TripAdvisor page HTML for the menu outlink.** Rejected: fragile to TripAdvisor's frontend, only works when TA has the link (still often empty), and the grounded-AI path covers menu + reservation + any future URL field uniformly with one mechanism.
- **Keep menu/reservation as operator-typed manual fields, drop only Stage 2.** Rejected: doesn't fix the user-stated pain ("annoying to fill").
- **HEAD pre-flight on AI-supplied URLs.** Rejected: adds ~500ms–2s per URL with no protection against the more common failure (URL is live but points to the wrong page — homepage instead of menu page). The acknowledgment checkbox covers the correctness goal at zero latency cost.
- **Provenance badge only, no acknowledgment checkbox for AI URLs.** Rejected: a wrong URL ships to production silently. AI URLs are higher-stakes than AI tags because the failure mode is "users click to a bad page" not "a filter misses."
- **Generalise the redesign across nightlife, attractions, key-locations in the same ADR.** Rejected: premature abstraction. Each category has its own quirks — nightlife is manual-first today, attractions has tour entanglement, key-locations is geography-shaped. The pattern is documented in `CONTEXT.md`; each category adopts it when its flow is touched.
- **Include AI title polish in this iteration.** Rejected: scope. ADR-0002 deferred title polish for a reason (free-text endpoint shape). Title polish gets its own ADR when it's the actual bottleneck; building the URL endpoint here makes the title follow-up cheap.
- **Keep Stage 2 alive as an at-Add-time re-suggest mechanism.** Rejected: the operator is sitting in front of the form for the entire batch; a separate post-Create phase adds zero signal the inline batch can't.
- **Required TripAdvisor URL with no opt-out.** Rejected: brand-new openings, food carts, cafés in thin-TA regions have no listing. Forcing a URL field blocks legitimate adds.
- **Optional TA URL with auto-fallback to SerpAPI search.** Rejected: reintroduces the wrong-URL failure mode that motivated this redesign.

## Consequences

- **Latency:** Step 1 Continue goes from ~3–5s to ~15s. The blocking progress card makes the expectation explicit; operators don't context-switch in the 15s window.
- **Reliability:** AI grounded search consistently produces results where the prior SerpAPI search + Google-website scrape returned empty. The acknowledgment-checkbox invariant keeps correctness in the operator's hands for the higher-stakes URL fields.
- **Cost:** ~$0.10–0.15 in Vertex grounding fees per dining add (3–4 calls × $0.035). At ~500 launch entries, ~$50–75 one-time. Negligible.
- **Python surface:** `/field-suggestion` grows one new request kind (`url`). Validation logic is small; prompt template change is contained. No new endpoint.
- **`FieldProvenance`:** unchanged. `ai` applies to `menuUrl` and `reservationUrl` in addition to the existing `type`/`idealFor`.
- **`pendingSuggestions` side channel:** kept. Not fed by Add anymore; still fed by per-field Suggest buttons on the edit page.
- **TripAdvisor place fetch:** moves from post-Create to inline pre-Create for dining. Cleaner — the Location row has the TA data at Create time without a second roundtrip.
- **Operator burden shape change:** trades "open a browser tab to find the TA URL before starting" for "~4 fewer fields to type by hand and one fewer post-Create phase to wait through." Net positive at our operator's stated pain point.
- **`AddDining*` flow shape:** drops from 4 phases (add / confirm / stage2 / success) to 2 (add / success). The `DiningPhase` union shrinks accordingly.
- **Reversibility:** medium-low. Stage 2 service and UI can be restored from git, but the redesigned Review section and python URL kind are larger to undo. If AI URL quality proves insufficient in production, the acknowledgment checkbox is the canary — bad cases surface in operator behaviour before they ship broadly.

## Open questions

- AI title polish — when does it follow? Probably the next dining ADR once the URL endpoint pattern is proven and the same `/field-suggestion` extension can carry a `kind: "freetext"` variant.
- Should `tripadvisorAbsenceConfirmed` be persisted as a real flag on the Location row, to distinguish "operator confirmed there's no TA listing" from "operator didn't paste yet"? Today the absence of `tripadvisorUrl` is the signal; revisit if operators need the distinction.
- Verify-checkbox UX: should the checkbox label include an open-in-new-tab preview affordance? Defer to whoever ships the UI.
- AI confidence threshold for URLs: `MIN_AI_CONFIDENCE = 0.6` for everything today. URLs may warrant a higher bar since wrong URLs are higher-stakes. Decide after we see the confidence distribution on real dining queries.
- `website-link-scraper.ts` and `tripadvisor-url-search.ts`: if no other category consumes them after the dining call sites are removed, delete the files. Audit during implementation.
