# Add-flow photo import crops client-side before atomic Create

**Status:** accepted (2026-05-21)

## Context

ADR-0006 modelled both Photo Import surfaces (Add flow and edit surface) on the same persistence shape: download bytes on the server, write **StagedSource** rows with empty `variants: []`, defer cropping to the operator's edit-surface pass. That decision was made on the premise that decoupling "got the bytes" from "did the crop work" was operator-friendly.

In practice the operator's mental model for the Add flow is the opposite: pressing **Create** on an Add-Accommodations / Add-Dining / Add-Nightlife wizard is expected to produce a Location whose MediaSet is *ready to serve* — fully cropped variants attached, no half-done image-sets, no follow-up crop pass required before the Location is publishable. A Location row appearing in the list with uncropped StagedSources is read as broken, not as an intermediate state.

The edit-surface "Pull from Google" affordance does not carry this expectation: the Location already exists, already has whatever image-sets the operator built, and parking new Google bytes for a later crop pass is a legitimate workflow. So the two surfaces have genuinely different requirements, even though they share the proxy, the rejected-source list, and the photographer-credit handling.

## Decision

The Add-flow photo import path **does not produce StagedSources**. Selected source bytes are proxied to the browser, cropped client-side through the existing `MultiVariantCropperModal` (all seven variants mandatory per source — thumbnail, square, wide, open_graph, editorial, portrait, hero), persisted to IndexedDB during the wizard session, and uploaded as multipart parts to an atomic Create endpoint. No `Location` row exists until the Create transaction succeeds with every selected source's seven variants written. ADR-0006 still governs the edit-surface "Pull from Google" path; that flow is unchanged.

Specific shape:

- **Server proxy.** `GET /api/photo-import/proxy?name=places/{id}/photos/{photo_name}` resolves the Places `media?skipHttpRedirect=true` signed URL server-side and streams the bytes back to the browser. Same operator-auth gate as `/api/photo-import/preview`.
- **Cropping surface.** After photo selection, the Picker step becomes a grid where each selected thumb shows a status pill (`Not cropped` / `Cropped`) and a `Crop` button that opens `MultiVariantCropperModal` for that source. Modal also carries an editable Photographer credit input prefilled from `authorAttributions[0].displayName`. Operator may crop in any order; Create stays disabled until every selected source is fully cropped.
- **Persistence during session.** Completed variant Blobs and credit edits live in IndexedDB keyed by an Add-flow session id, alongside the existing localStorage form draft. Restored on refresh; cleared on Create success or explicit Reset. Other-machine continuation is not supported (single-operator deployment per CONTEXT.md).
- **Atomic Create.** One multipart request: JSON Location payload + `N × 7` variant Blobs + a manifest mapping each part to `{sourceIndex, variantType}` + per-source `photographerCredit`. Server creates the Location row, the `uploads` rows, and writes variant files in a single transaction; any failure rolls back everything. No orphaned server-side state can result from an abandoned wizard.
- **Failure handling for source-byte fetch.** A failed proxy fetch surfaces a per-thumb Retry and a Drop affordance. Drop removes the source from the working set for this session only — the photo `name` is **not** added to `rejected_google_photo_names` (consistent with ADR-0006's rule that fetch failure is a system outcome, not operator rejection; deselection in the picker remains the only path to rejection).

## Why this is non-obvious

A future reader looking at a multipart POST to the Add-Location endpoint will reasonably ask *"why doesn't this just call `startPhotoImport` after Create like ADR-0006 says?"* The answer is the operator-experience requirement above: the Add flow's contract is "Create produces a ready Location," and StagedSource explicitly violates that.

A reader looking at IndexedDB usage in `useAddDiningFlow` / sibling Add-flow hooks will also reasonably ask *"why is the wizard storing image bytes locally?"* — because the operator may need to do tens of crop interactions across a session, and losing them to a tab refresh would be feature-killing.

## Alternatives considered

### Auto-crop to seed, operator can override before Create

Server returns Sharp `cover` center-crops for every variant; operator only re-crops the ones that look bad.

**Rejected:** the explicit operator requirement was that crops are a *quality gate* — every variant must be human-checked. Auto-seeding undermines the gate by making the path of least resistance "ship the machine crop."

### Two-phase with server-side orphaned staging rows

Variants posted to a staging endpoint pre-Create; Create adopts staging ids transactionally. UX of streaming uploads with progress and retry; orphaned rows reaped by a sweeper.

**Rejected:** the operator preference was for zero new server-side persistent state until Create fires. A multipart request large enough to fail under flaky packet conditions is the cost paid for that invariant.

### Keep ADR-0006 unchanged; do the crop pass before navigating away post-Create

Create the Location with empty StagedSources as ADR-0006 specifies, then keep the operator in a modal cropping until they're done, then navigate.

**Rejected:** the Location row visibly exists in an uncropped state during the modal session. The operator-experience requirement was that uncropped Locations never appear in any list at any moment.

## Consequences

- Create endpoint accepts multipart for these flows, not pure JSON. Existing JSON-shaped clients of `POST /api/locations` are unaffected only if multipart is gated behind a content-type branch.
- IndexedDB introduces a new persistence channel in the Add-flow hooks; a session-id scheme replaces the implicit "current draft" model the localStorage path uses today.
- The Photo Import flow now has two genuinely distinct shapes (Add-time vs operator-staged); the glossary entries in CONTEXT.md reflect this split. Future changes to either flow must be reviewed against the right ADR.
- 10 photos × 7 variants is 70 crop interactions before Create unlocks. If operator-time in the Add flow becomes a problem in practice, the lever is reducing the mandatory pre-Create variant set (revisit this ADR — do not auto-crop) or reducing default photo selection.
- Compliance posture from ADR-0006 carries over unchanged: this is a school-project / offline / non-public-serving deployment, and Google byte caching is acceptable on that basis. The Add-flow path does not weaken or strengthen that posture — it changes *when* the bytes get persisted, not *whether*.
