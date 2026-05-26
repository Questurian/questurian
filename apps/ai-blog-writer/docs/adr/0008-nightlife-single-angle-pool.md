# ADR 0008 — Nightlife ships with a single-angle pool

## Status

Accepted. Amends ADR 0004 for the nightlife category only. Dining is unchanged.

## Context

ADR 0004 added parallel six-angle pools for accommodations, attractions, and nightlife and put each behind a per-category validation gate. Nightlife was wired up with three of the planned six angles in production (`room-feel`, `order-timing-tip`, `best-for-night`).

In practice on real nightlife listicles, only `best-for-night` consistently produced blurbs the operator judged good. `room-feel` and `order-timing-tip` produced weaker copy that the operator would not ship — the lead-shape constraint did not buy enough structural variation to justify the variance in quality. The grounded-research + writer-brief pipeline (introduced by ADR 0006 / 0007) is doing the heavy lifting for nightlife quality; the angle pool is no longer the primary lever it was for dining.

`ANTI_AI_ENABLED_CATEGORIES` in `angle_assignment.py` currently double-duties as both "run auto angle assignment for this category" **and** "use the anti-AI writer prompt + Evidence Scan + Writer Brief for this category". With only one nightlife angle worth keeping, the two purposes diverge: nightlife should keep the curated writer pipeline but stop auto-picking an angle, because there is nothing to pick between.

## Decision

**Nightlife ships with a single-angle pool of `best-for-night`. Auto-assignment, rotation, and Evidence Scan are disabled for nightlife. The curated writer pipeline (grounded research, writer brief, anti-AI voice rules) stays on.**

Specifics:

1. **Nightlife pool shrinks** to `("best-for-night",)`. `room-feel` and `order-timing-tip` are removed from `NightlifeAngle`, `NIGHTLIFE_ANGLE_POOL`, the frontend `NIGHTLIFE_LISTICLE_ANGLE_OPTIONS`, and the writer-brief angle directive map.

2. **Flag split.** `ANTI_AI_ENABLED_CATEGORIES` is split into two independently meaningful sets:

   - `AUTO_ANGLE_ENABLED_CATEGORIES = {"dining"}` — categories whose blurbs run through `assign_listicle_angles` rotation and Evidence Scan candidate selection.
   - `ANTI_AI_PROMPT_CATEGORIES = {"dining", "nightlife"}` — categories whose blurbs use the anti-AI writer prompt, Research Profile, and Writer Brief.

   `routes.py`, `listicle_writer.py`, and tests switch to the new names. The old `ANTI_AI_ENABLED_CATEGORIES` symbol is removed; no compat shim.

3. **Frontend dropdown stays** with `Best For Night` as the sole option (no "Auto" entry, no other angles). The dropdown is intentionally preserved so future angles can be re-added without rebuilding UI.

4. **Existing data is coerced on load.** Nightlife items previously saved with `angle: null | "room-feel" | "order-timing-tip"` are normalized to `"best-for-night"` in the storage / mapper layer, so no operator action is required on already-saved drafts. No data is deleted from Payload; the coercion runs on read into the draft.

5. **New nightlife items default to** `angle: "best-for-night"` on creation rather than `null`.

## Consequences

- Editorial variety across a nightlife listicle is reduced to whatever the per-venue Writer Brief produces under one angle directive. This is acceptable given the operator's judgment that variety-via-weak-angles was costing more than it was earning.
- `assign_listicle_angles` and Evidence Scan become no-ops for nightlife. Both still serve dining; neither path needs to be deleted. Rotation code is unreachable for nightlife but stays in place for dining and any future categories.
- Splitting the flag clarifies a conflation that has been growing since ADR 0006 (auto vs. operator-selected angle had different research paths but shared one gate). Future categories can opt into either gate independently — e.g. attractions could enable the anti-AI writer prompt before its angle pool is large enough to auto-rotate.
- `CONTEXT.md`'s **Listicle Angle** entry is updated in this commit to reflect the single-angle nightlife pool and the split gates.
- Rollback is per-category and per-flag. Re-enabling the multi-angle nightlife pool means adding entries back to `NIGHTLIFE_ANGLE_POOL` and adding `nightlife` to `AUTO_ANGLE_ENABLED_CATEGORIES`.

## Alternatives considered

- **Keep all three nightlife angles and tune prompts.** Rejected: prompt-tuning has been tried; the operator's empirical read is that two of the three angles fight the writer rather than help it. Continuing to ship them blocks visible quality wins on the angle that works.
- **Remove the nightlife angle dropdown entirely and hardcode best-for-night in the writer prompt.** Rejected: the operator plans to add more nightlife angles in the future. Keeping the dropdown (even with one option) avoids re-wiring UI and storage twice.
- **Strip nightlife from `ANTI_AI_ENABLED_CATEGORIES` without splitting the flag.** Rejected: that would also strip Research Profile, Writer Brief, and anti-AI voice rules from nightlife — exactly the parts that are currently producing good blurbs.
- **Keep the flag undivided and short-circuit `assign_listicle_angles` for single-angle pools.** Rejected: the operator explicitly asked for the auto-assignment logic to be gone for nightlife, not merely trivialised. Splitting the flag makes the intent explicit at the call site.
