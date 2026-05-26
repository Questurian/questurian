# ADR 0009 — Extend the lean blurb pipeline to dining

## Status

Accepted. Extends ADR 0007 (Writer Brief curator) and the lean writer prompt that ADR 0007 introduced for nightlife. Nightlife behavior is unchanged.

## Context

ADR 0007 introduced the Writer Brief curator and a lean writer prompt for listicle blurbs, scoped initially to nightlife. Nightlife is now the "near-perfect" baseline: the curator compresses the cited Research Profile into 2–8 deduped Source Facts, and `build_lean_nightlife_writer_prompt` drops the legacy `BUILDER CONTEXT` bucket dump, `ANTI_AI_TELLS_BLURB`, `NIGHTLIFE_BLURB_CALIBRATION`, and the Triad/Rhythm/Cadence triple-stack in favor of a tone line, an angle directive, and a flat Source Facts list with a short Avoid block.

Dining still runs on the fat-prompt path (`build_writer_prompt`), which pastes the whole bucket-labeled Research Profile into the writer prompt alongside the full anti-AI voice block and per-category focus rules. Dining blurbs are verbose: the writer sees raw, overlapping bucket findings and the prompt layers more constraints on top to compensate. The validation bar ADR 0007 set for moving a category onto the lean path (≥70% banned-phrase reduction across 20 blurbs, zero fabricated anchors) was met by nightlife, so the lean architecture itself is no longer the open question. The remaining question is whether the dining-specific pieces — six angles instead of one, a richer per-item signal, a different editorial voice — fit the lean shape.

Several pieces of the lean nightlife code are name-coupled to nightlife. `build_lean_nightlife_writer_prompt`, `NIGHTLIFE_ANGLE_DIRECTIVES`, and `LEAN_NIGHTLIFE_AVOID_LINES` all hard-code the category. The routing gate in `routes.py` uses a `use_lean_nightlife` flag that conflates "this category uses the lean prompt shape" with "this category is nightlife." Onboarding a second category requires either duplicating the lean builder or parameterizing it.

Bucket priorities (`CATEGORY_BUCKET_PRIORITIES` in `research_profile.py`) were set when dining was on the fat prompt, where the writer could absorb any bucket. Dining's current priorities — `specific-offerings, social-proof, best-for, caveats-or-fit-warnings` — feed the `signature-dish` and `best-for` angles well but leave four of the six dining angles (`atmosphere`, `founders-backstory`, `insider-tip`, `whats-different`) without a prioritized bucket. On the fat prompt this was tolerable because the writer saw the whole dump; with the lean curator emitting only 2–8 facts, un-prioritized buckets effectively starve the under-served angles.

## Decision

**Extend the lean writer prompt and Writer Brief curator to dining. Keep all six dining angles. Expand dining's bucket priorities to cover every angle. Refactor nightlife-named code into a parameterized lean path without changing the prompt nightlife emits.**

Specifics:

1. **Six dining angle directives in lean voice.** Add `DINING_ANGLE_DIRECTIVES` in `writer_brief.py`, one entry per angle, each a single-line venue-tailored directive with a `{venue}` placeholder. Initial drafts:

   - `signature-dish` → "Open by naming one specific dish at {venue} and one concrete reason it's worth ordering."
   - `atmosphere` → "Open by placing the reader in the room at {venue} with one concrete physical detail — the light, the seating, the music, the crowd at a specific hour."
   - `founders-backstory` → "Open by naming the person behind {venue} and one specific fact about them — where they trained, what they ran before, when they opened."
   - `insider-tip` → "Open with one specific, actionable tip at {venue} a first-time visitor wouldn't guess — a time, a seat, an order, a side door."
   - `best-for` → "Open by naming the occasion {venue} serves best, then one concrete reason rooted in the room, the menu, the pacing, or the price."
   - `whats-different` → "Open by naming the specific thing that sets {venue} apart from neighboring options of the same kind — a technique, a sourcing choice, a format."

   These are venue-facing curator templates. They do not replace `LISTICLE_ANGLE_GUIDANCE`, which stays as the model-facing instruction text used by the fat prompt for accommodations, attractions, and key_location. The curator may rewrite a dining directive when cited findings warrant, on the same rule as nightlife.

2. **Parameterize the lean path by category.** Rename and reshape:

   - `build_lean_nightlife_writer_prompt` → `build_lean_writer_prompt(category=...)` in `listicle_writer.py`.
   - `NIGHTLIFE_ANGLE_DIRECTIVES` → `ANGLE_DIRECTIVES_BY_CATEGORY: dict[ListicleCategory, dict[ListicleAngle, str]]` in `writer_brief.py`. Nightlife's existing entry moves into the map verbatim.
   - `LEAN_NIGHTLIFE_AVOID_LINES` → `LEAN_AVOID_LINES_SHARED`. Same eight lines; rename only. A clearly-marked placeholder comment is added next to the constant for dining-specific avoid lines to be filled in once test runs reveal dining-specific failure modes.
   - `routes.py` `use_lean_nightlife` → `use_lean_prompt`, gated on `request_target.category in LEAN_PROMPT_CATEGORIES`.

   The string nightlife receives is byte-identical after the refactor. Dining's lean prompt reads `editor_role` from `CATEGORY_PROMPT_VARIANTS["dining"]` ("food and travel editor"); nightlife's lean prompt continues to use the existing "Write like an editor who has been there." line. The voice line is plumbed for dining only.

3. **New gate alongside existing gates.** Add `LEAN_PROMPT_CATEGORIES = {"nightlife", "dining"}` in `angle_assignment.py`, orthogonal to `ANTI_AI_PROMPT_CATEGORIES` and `AUTO_ANGLE_ENABLED_CATEGORIES`. The three gates now mean:

   - `LEAN_PROMPT_CATEGORIES` — categories whose blurbs run through the lean writer prompt and Writer Brief curator.
   - `ANTI_AI_PROMPT_CATEGORIES` — categories whose blurbs run through Research Profile and Writer Brief (the anti-AI research path).
   - `AUTO_ANGLE_ENABLED_CATEGORIES` — categories whose blurbs run `assign_listicle_angles` rotation and Evidence Scan candidate selection.

   Dining is in all three. Nightlife is in the first two. Accommodations, attractions, and key_location are in none.

4. **Expand dining bucket priorities.** `CATEGORY_BUCKET_PRIORITIES["dining"]` grows from four buckets to seven, one per angle:

   ```python
   "dining": (
       "specific-offerings",        # signature-dish
       "experience-texture",        # atmosphere
       "history-or-ownership",      # founders-backstory
       "standout-hook",             # insider-tip + whats-different
       "best-for",                  # best-for
       "social-proof",              # cross-angle reputation evidence
       "caveats-or-fit-warnings",   # cross-angle restraint
   )
   ```

   The "low-signal buckets stay empty rather than padded" rule in the Research Profile prompt continues to police over-collection. Nightlife's priorities are not changed by this ADR.

5. **Retry path fix for dining only.** `build_retry_prompt` branches on category: dining retries call `build_lean_writer_prompt`; all other categories (including nightlife) call `build_writer_prompt` exactly as today. Nightlife's existing retry behavior is preserved.

6. **No feature flag, no per-listicle toggle.** Dining flips lean as the default once the code lands. Validation is a single 6-venue dining listicle exercising all six angles, eyeballed by the operator; directives and priorities are tuned in-place if anything reads thin. This mirrors ADR 0008's stance against soft-launch toggles for editorial pipeline changes.

## Consequences

- Dining blurbs run through one writer call per blurb with the same lean shape nightlife uses today: tone line, angle directive, 2–8 Source Facts, short Avoid block. Token-per-blurb drops materially versus the fat-prompt path; per-blurb cost is approximately equal to nightlife's current cost.
- The `LISTICLE_ANGLE_GUIDANCE` map remains the model-facing instruction text for accommodations, attractions, and key_location while those categories stay on the fat prompt. It is not dead code; it serves three live categories.
- `CONTEXT.md`'s Writer Brief glossary entry ("Initial category scope: nightlife only") needs updating when the code lands. The Listicle Angle entry needs a note that dining now also routes through the lean prompt while keeping its six-angle pool. Those edits are not made in this ADR; they land with the implementation commit.
- Future categories (accommodations, attractions) can opt into the lean path by adding their category to `LEAN_PROMPT_CATEGORIES`, defining a per-angle directive map under `ANGLE_DIRECTIVES_BY_CATEGORY`, and auditing their bucket priorities against their angle pool. No further structural work is required.
- Retry asymmetry between dining and nightlife (dining retries on the lean prompt, nightlife retries on the fat prompt) is an intentional consequence of preserving nightlife's current behavior. It can be unified later if the asymmetry produces a visible regression.
- Rollback is per-flag and reversible: removing dining from `LEAN_PROMPT_CATEGORIES` and reverting `CATEGORY_BUCKET_PRIORITIES["dining"]` to its prior four-bucket set returns dining to the fat-prompt path without further changes.

## Alternatives considered

- **Collapse dining to a single angle like nightlife did in ADR 0008.** Rejected. Nightlife collapsed because two of three angles produced unshippable copy; the operator's empirical read for dining is that all six current angles produce copy worth shipping. Dining venues also carry richer per-item signal (signature dish, founders, atmosphere) than nightlife, where the angle pool is fighting against thin source material. ADR 0003's original case for per-blurb angle rotation as a structural fix for monotony stands strongest in dining.
- **Reuse `LISTICLE_ANGLE_GUIDANCE` as the dining curator templates.** Rejected. Those entries are multi-sentence, model-facing instruction text written *at* the model ("Sentence 1 must…"). Reusing them on the lean path would re-import the verbosity the lean prompt exists to eliminate. The lean directives are venue-facing, one line, and `{venue}`-templated; that is a different shape from the fat-prompt guidance.
- **Make bucket priorities angle-aware rather than category-aware.** Rejected as premature. Priorities are a soft signal to the Research Profile prompt, not a filter; the longer dining list is functionally adequate and avoids reshaping the `CATEGORY_BUCKET_PRIORITIES` signature. Angle-aware priorities can be revisited once real dining lean blurbs show angle-specific thin spots.
- **Two parallel lean prompt builders (`build_lean_nightlife_writer_prompt` and `build_lean_dining_writer_prompt`).** Rejected. The bodies are ~95% identical; duplication invites drift bugs ("we fixed the avoid list in nightlife and forgot dining"). One parameterized builder with category-keyed lookups is the same shape ADR 0008 used when it split `AUTO_ANGLE_ENABLED_CATEGORIES` from `ANTI_AI_PROMPT_CATEGORIES`.
- **Ship dining lean behind a per-listicle operator toggle.** Rejected on the same grounds ADR 0008 rejected a similar fallback for nightlife: soft-launch toggles tend to ossify, and the operator can already compare lean output against historical fat-prompt blurbs in past runs. If lean dining is wrong, fix it before merging.
- **Hold dining to ADR 0007's 20-blurb / banned-phrase-percentage validation bar.** Rejected as process for process's sake. That bar was the gate for proving the lean architecture works at all; the architecture is now proven by nightlife. The dining-specific pieces (six directives, expanded priorities, dining editor_role) are tested faster and more usefully by reading six real blurbs across the six angles.
- **Fix the retry path asymmetrically by routing nightlife retry through the lean prompt as well.** Rejected per operator instruction: nightlife is working and should not be touched in this change. The retry path inconsistency is preserved deliberately and can be revisited if it produces visible regressions.
