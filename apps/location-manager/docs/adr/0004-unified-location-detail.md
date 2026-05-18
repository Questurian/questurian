# Unified LocationDetail: one component for post-create preview and Edit

**Status:** proposed (2026-05-17)

## Context

The Add Dining flow ends in a read-only `DiningPreviewPhase` (`features/location-create/components/DiningPreviewPhase.tsx`) that fetches the just-created Location by ID and renders a dense label-left/value-right grid with provenance badges. The standalone `EditLocation` page (`features/location-edit/pages/EditLocation.tsx`) edits the same Location through a react-hook-form form with category-aware section components and a single batch "Update Location" button.

The two surfaces show the same record but disagree on almost everything else:

- **Shape:** preview uses a `Section` / `Row` pattern (label left, value right, badge inline); Edit uses form rows (label above input).
- **Editability:** preview is fully read-only; Edit is fully editable (with no read-only view of system-managed fields like `placeId`, `coordinates`, `ianaTimeId`, upload counts).
- **Width:** preview is `max-w-2xl`; Edit is `max-w-[1200px]`.
- **Suggestion surface:** Edit renders `PendingSuggestionsPanel` (ADR-0002); preview doesn't, even though Stage-2 AI suggestions can arrive *while the operator is dwelling on the preview*.

Three forces converge:

1. **Operator goal at post-create is the same as in Edit:** inspect every field on the record, fix anything that's wrong, accept or dismiss any AI suggestion. There is no second-pass workflow where the operator returns later under different intent — Edit *is* the second pass.
2. **The post-create moment is the highest-leverage review opportunity.** The operator just created the record, has fresh context, and is one click from leaving. If the preview hides editability, every correction becomes a navigation round-trip to Edit.
3. **Stage-2 AI suggestions arrive asynchronously** after create (per ADR-0002, now via grounded Google Search per ADR-0005). The preview surface needs to either ignore them (defeating half their value at the moment the operator cares most) or surface them live.

## Decision

Unify the post-create preview and the Edit page into a single `<LocationDetail>` component for the dining category. The two routes (`/edit/dining/:id` and the `phase === "success"` slot in `AddDiningLocation`) become thin wrappers that pass `locationId` and slot content. Non-dining categories continue to use the existing `EditLocation.tsx` form until each category gets its own re-review pass.

### 1. Three-bucket field model

Every field on the Location falls into one of three buckets, surfaced uniformly in `<LocationDetail>`:

- **A. Domain-editable** — `title`, `type`, `idealFor`, `priceLevel`, contact fields, external URLs, `operationHours`, `district`, `neighborhoodDescription`. Editable inline.
- **B. System-managed, read-only-visible** — `placeId`, `coordinates`, `ianaTimeId`, uploads count, instagram embed count. Rendered as labelled Rows with values visible; not editable. Editing these by hand is almost always wrong, but they are high-value for debugging.
- **C. Identity, gated** — `locationKey`, `category`. Mutating these breaks invariants (uniqueness per `country|city|neighborhood`, category-bound `idealFor` tags). Read-only by default with an explicit "Edit identity" affordance, not part of the routine form.

This is a sharpening of "every field on a location should be inspectable and editable in one detailed view": *every* field is inspectable; only the safe ones are routinely editable.

### 2. Hybrid save model

- **Immediate save (no Save button):** any field whose edit is a single discrete action with no in-progress state — `idealFor` chip toggle, `priceLevel` selection, accept/dismiss of a pending suggestion, "Suggest"-button result.
- **Batch save (Save Changes button, disabled until dirty):** text inputs (`title`, URLs, phone, address, `operationHours`, `neighborhoodDescription`), plus the `locationKey` + `district` tuple (kept coupled because `handleSubmit` flips `autoApproveTaxonomy` on the combined dirty state).

This also resolves the Stage-2 divergence problem documented in ADR-0002: when the suggestion pipeline writes `provenance = ai-reviews` directly into a live field, that field is *not* in the operator's batch (operators don't have the field dirty if they haven't typed in it), so a TanStack Query refetch refreshes the read-side without colliding with the in-flight edit.

### 3. Single component, slot composition

`<LocationDetail locationId={...} headerSlot={...} footerSlot={...} />` owns:

- The `useEditLocationForm` instance (form state, validation, submit).
- All section rendering (Basics / Contact / External links / Details / Reviews / Media), category-branched via the existing section component contract.
- `PendingSuggestionsPanel`.
- The Save Changes + Cancel footer (always present).
- The route-away guard (`useBeforeUnload` on `isDirty`) — protects both contexts uniformly.

The two wrappers (`EditLocation.tsx` for dining, the post-create slot in `AddDiningLocation`) provide chrome only:

- **Edit wrapper:** Breadcrumbs as `headerSlot`; nothing extra in `footerSlot`.
- **Post-create wrapper:** Success header ("Location Added") as `headerSlot`; "Add Another" + "Done" buttons as `footerSlot`. Both terminal buttons are **disabled while `form.formState.isDirty`** with a tooltip "Save or cancel your changes first." No modal, no silent discard, no magic auto-save.

### 4. Live pending suggestions in the post-create context

`<LocationDetail>` polls the location every 5–10s while `reviewsChecklist` indicates Stage 2 is still in flight, stopping when the checklist transitions to done or after a 2-minute ceiling. This lets Stage-2 review-derived suggestions appear in the panel *while the operator is still dwelling on the just-created record*, without requiring new live-update infra (no WebSocket / SSE).

Empty-state messaging is context-aware:

- Post-create with reviews in flight: "Reviews still being fetched — suggestions will appear when ready."
- Edit with empty `pendingSuggestions`: panel hidden entirely.

Accept/dismiss semantics are identical in both contexts — same component, same per-field ghost-chip pattern, same provenance flip on accept.

### 5. Layout

- **Width:** `max-w-[1200px]` (matching Edit). The preview's `max-w-2xl` is too narrow for editable URL inputs and `operationHours` JSON; inspectability wants narrow rows but editability wants wider inputs, and the Edit width has been working.
- **Default row pattern:** label-left / value-right, with provenance badge inline next to the label. Densest readable shape.
- **Multiline override:** fields flagged multiline (`operationHours` JSON, `neighborhoodDescription`, any future long-form free text) keep the label-left header but drop the input to a full-width block below the row. Encoded in the `Row` component so authors don't choose per field.
- **Mobile (≤640px):** all rows collapse to stacked label-above-input regardless of multiline. The desktop density goal doesn't translate to phones.

### 6. Dining-only rollout

`<LocationDetail>` is built for dining first. Both:

- The Edit page route for `/edit/dining/:id`, and
- The `phase === "success"` slot in `AddDiningLocation`,

point at `<LocationDetail>`. The existing `EditLocation.tsx` continues to serve `/edit/accommodations/:id`, `/edit/attractions/:id`, `/edit/nightlife/:id`, `/edit/key_locations/:id` unchanged. Routing branches on category.

This is an intentional temporary fork. Dining is the category currently being re-validated; the other four are not on this PR's review path, and migrating them now would expand the blast radius without a corresponding review pass to catch regressions. Each non-dining category adopts `<LocationDetail>` as a follow-up when that category gets its own re-review.

## Considered alternatives

- **Two pages sharing the same section components, no `<LocationDetail>` wrapper.** Each page composes the same form sections directly. Rejected: the *form* is the thing both contexts need, not just the sections. Bundling it into one component makes "preview === edit" structural rather than a code-discipline thing the next contributor has to maintain.
- **Mode discriminator (`mode: "edit" | "post-create"`) instead of slots.** Rejected: the two contexts genuinely differ only in chrome (header text, terminal buttons), not in behaviour. Slots match the actual shape of the divergence; a mode flag invites behavioural forks to accumulate inside the component over time.
- **Batch save everywhere (single Save button, no immediate-save fields).** Rejected: when Stage-2 writes `provenance = ai-reviews` into a live field that the operator hasn't touched, the form's `isDirty` state diverges from the actual record — you'd need to `form.reset()` on every server-side update, risking overwriting an in-flight edit. The hybrid model sidesteps this by keeping discrete actions outside the batch.
- **Save-on-blur for every field.** Rejected: N small PATCHes complicate multi-field invariants. The `locationKey` + `district` tuple specifically needs both fields in the same payload to compute `autoApproveTaxonomy`; splitting that across two PATCHes loses the coupling.
- **WebSocket / SSE for live pending-suggestion updates.** Rejected on YAGNI grounds: no other live-update need exists in LM today, and polling for 60–120s on a single page is cheap. If a second live-update use case appears, revisit.
- **Two-column row grid on wide screens.** Rejected for now: sections are short enough that single-column inside section cards still fits a 1200px viewport without forcing the operator to scan diagonally. Revisit if density complaints surface.
- **Migrate Edit page for all five categories in this PR.** Rejected per scoping above: the other four categories aren't on this PR's review path. Cheaper to ship dining cleanly and follow up per category.
- **Auto-save on "Add Another" click instead of disabling the button while dirty.** Rejected: the save can fail in the background; the operator has already moved on and won't see the error. Disable-while-dirty is predictable and forces the operator to acknowledge the in-flight edit.

## Consequences

- The Edit page splits temporarily by category. `EditLocation.tsx` continues to serve four categories with the existing form-row layout; dining gets `<LocationDetail>` with the unified shape. Two visual styles coexist until each non-dining category gets its own re-review.
- The post-create preview gains full editability. Operators can fix everything in place instead of round-tripping through Edit.
- The `Row` component grows a `multiline` mode. Sections that today render a textarea need to migrate to the `Row`+`multiline` shape rather than rendering their own form rows.
- `<LocationDetail>` polls the location while Stage 2 is in flight. This is a new client-side polling pattern in LM; if Stage-2 detection criteria change, the polling stop condition must follow.
- The route-away guard fires in both contexts uniformly. Edit operators previously could navigate away mid-edit without warning; they now get a confirm dialog if the batch is dirty. This is a behaviour change to the existing Edit page.
- "Add Another" and "Done" buttons in the post-create context are disabled while the batch is dirty. Operators who want to leave without saving must click Cancel first. This is one extra click for the discard-then-leave path; the trade is no silent data loss.
- The dining-only scope means new Location-shape changes (e.g., a new field) need to be applied in two places — the legacy `EditLocation.tsx` form sections (for the other four categories) and `<LocationDetail>` (for dining) — until each category migrates. This is the cost of the temporary fork; it argues for migrating the remaining categories sooner rather than later.

## Open questions

- Whether the "Edit identity" affordance for bucket C (`locationKey`, `category`) lives inside `<LocationDetail>` (gated by a click) or in a separate admin route. Deferred until the first operator actually needs to rename a `locationKey` in anger.
- Whether the polling cadence (5–10s) and ceiling (2 min) match real Stage-2 latencies once dining ships. Tune after first contact with production timings.
- Whether the multiline override is the right unit, or whether a richer `Row` variant system (e.g. inline-editor types) emerges. Revisit if a third row shape appears.
