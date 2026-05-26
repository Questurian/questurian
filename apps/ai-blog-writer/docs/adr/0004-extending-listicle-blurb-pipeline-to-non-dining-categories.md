# ADR 0004 — Extending the listicle blurb pipeline to non-dining categories

## Status

Proposed. Supersedes the dining-only scoping in ADR 0003 once the per-category validation gates clear.

## Context

ADR 0003 introduced a two-layer fix for AI-sounding listicle blurbs: (1) voice rules (`ANTI_AI_TELLS_BLURB`) that ban phrase-level AI tells, and (2) a per-item Listicle Angle pool, scored against LM data and rotated to defeat structural monotony. The pilot was deliberately scoped to **dining blurbs only** by a single category gate in `_voice_rules_block` (`listicle_writer.py:333-339`) and a parallel category gate in `angle_assignment.py` (only `assign_dining_angles` exists; other categories return `None`).

The dining pilot met its stopping rule (≥70% banned-phrase reduction across 20 blurbs, zero fabricated anchors). The next four categories — accommodations, attractions, nightlife, key_location — are still on the legacy path: writer prompt without voice rules, no angle assignment, no structural variation enforcement.

Three layers of dining's stack are category-specific today:
- Voice rules (`_voice_rules_block`) — gated on `category == "dining"`.
- Angle pool + scoring (`DINING_ANGLE_POOL`, `_score_dining_angles`) — dining-only by construction.
- Critical Fields Guideline (`_evaluate_dining`) — other categories get `_permissive_evaluation()` (no Tier-1 blocking, no Fallback Research).

Extending all three at once would conflate two different problems: "does it sound AI" (voice + angles) and "do we have enough data to write" (critical fields). The two demand different evidence to validate and different operator workflows when they fail.

Three categories share dining's data shape (have reviews-staleness thresholds and expect a `_reviewsDigest`); key_location does not (`STALENESS_DAYS_BY_CATEGORY["key_location"] = None`). The dining scoring heuristic leans on reviews-digest signals (`namedDishes`, `commonPositives`, founder cues from the summary), so transplanting it to key_location would degrade three of six angles to near-random scoring.

## Decision

**Extend voice rules and angle pools to accommodations, attractions, and nightlife. Defer key_location and Critical Fields Guideline.**

Specifics:

1. **Voice rules.** Remove `category == "dining"` from `_voice_rules_block`'s gate. Replace with a per-category set so each category can be enabled independently as it clears the validation bar. `ANTI_AI_TELLS_BLURB` text itself is not modified — the dining-tuned tells (`"X meets Y"`, named-dish anchors) are generic enough to apply, and the per-category validation gate is what protects against false positives.

2. **Angle pools.** Add `ACCOMMODATIONS_ANGLE_POOL`, `ATTRACTIONS_ANGLE_POOL`, `NIGHTLIFE_ANGLE_POOL` alongside `DINING_ANGLE_POOL`. Each is six angles, mirroring dining's lead-shape map (named noun + fact / sensory + room / person + fact / actionable tip / occasion + evidence / differentiator). Per-category content:

   |                    | accommodations         | attractions          | nightlife           |
   |--------------------|------------------------|----------------------|---------------------|
   | named noun + fact  | signature-amenity      | signature-feature    | signature-program   |
   | sensory + room     | room-style             | setting              | room-feel           |
   | person + fact      | property-backstory     | history-built        | venue-backstory     |
   | actionable tip     | booking-tip            | visit-time-tip       | order-timing-tip    |
   | occasion + evidence| best-for-stay-type     | best-for-visit-type  | best-for-night      |
   | differentiator     | whats-different        | whats-different      | whats-different     |

   Refactor `assign_dining_angles` into `assign_listicle_angles(category, items)` with per-category scoring functions (`_score_dining_angles`, `_score_accommodations_angles`, `_score_attractions_angles`, `_score_nightlife_angles`). Scoring inputs draw from the category-specific LM fields (`accommodationsDetailsJson`, `attractionsDetailsJson`, `nightlifeDetailsJson`), plus shared fields (`idealFor`, `features`, `neighborhoodDescription`) and the reviews digest when present.

3. **Per-category validation gate.** Each of the three categories must independently clear dining's stopping rule (20 generated blurbs, ≥70% banned-phrase reduction vs. pre-rollout baseline, zero fabricated anchors) before its category is flipped on in `_voice_rules_block` and `assign_listicle_angles`. The category gate is extended by one entry per category, allowing per-category rollback.

4. **Out of scope, explicit deferrals:**
   - **key_location.** Has no reviews digest; dining-shaped scoring would degrade. Designed as a follow-up with bespoke scoring against `keyLocationsDetailsJson` and `neighborhoodDescription`.
   - **Critical Fields Guideline per category.** Stays permissive for non-dining; no Fallback Research wired for these categories yet. A separate decision once we see whether non-dining LM records are thin enough to warrant the data-quality gate.
   - **Validation-phrase audit.** `REVIEW_DISCLOSURE_PHRASES`, `RATING_PATTERN`, etc. are not extended in this rollout. Non-dining process-leak phrases ("visitors love," "guests report," etc.) caught only by the voice rules until a separate audit pass.
   - **Listicle intros.** Intros remain on the legacy path. Different prose shape (list-level voice, no per-item angle), separate concern.
   - **Article-body composers (`ANTI_AI_TELLS_FULL`).** Defined but unused; rolling them out to youtube2blog/prompt2blog/url2blog/editorial-augmentation/deep-expand/block-rewrite is a separate, larger ADR.

## Consequences

- `LISTICLE_ANGLE` type widens from six to 18 string literals across three categories (six per). Type ergonomics: per-category aliases (`AccommodationsAngle`, `AttractionsAngle`, `NightlifeAngle`) plus a discriminated union; existing dining-only call sites need to opt into the wider type or accept a category-tagged union.
- `LISTICLE_ANGLE_GUIDANCE` gains 18 new entries (per-category guidance strings parallel to the existing dining ones).
- Operator UI (frontend builder, per-item angle dropdown) becomes category-aware: the dropdown options shown depend on the venue's category. Today's dropdown is single-category; this is the first multi-category surface on the frontend builder.
- `ListicleGuidelinesResponse` (the `/listicle-guidelines` endpoint) changes shape: `angles` becomes `angles_by_category: {dining: {...}, accommodations: {...}, ...}`. Frontend consumers must update.
- Test surface: `angle_assignment.py` tests parameterize across four categories instead of one. The pilot's evaluation harness (compute banned-phrase counts on a sample of 20 blurbs) is run independently per category.
- The dining pilot's evidence — banned-phrase reductions on dining blurbs — does not transfer to the other categories. Each category clears its own gate or stays off.
- Rollback granularity is per-category. If accommodations regresses in production, its single category-gate entry is removed; dining/attractions/nightlife are unaffected.
- The docstring on `anti_ai_tells.py` (which previously claimed `ANTI_AI_TELLS_FULL` is in use in six features) is rewritten to describe actual current state; the long-term rollout-to-article-body plan moves into this ADR's "out of scope" rather than living as misleading prose in source.

## Alternatives considered

- **Ship voice rules only, defer angles.** Faster — one gate flip, no pool design. Rejected: voice rules alone leave the structural-monotony problem unsolved; every accommodation blurb still opens the same way with cleaner phrasing. The pilot's "works pretty well" result came from voice + angles together, and shipping half the fix would require re-validating from scratch when angles arrive.
- **Full parity including Critical Fields per category.** Cleaner architectural symmetry. Rejected for this rollout: data-quality gating is a separable concern; deciding what "complete enough to write an accommodation blurb" means is its own design with its own operator-warning UX. Conflating it with the anti-AI rollout means a fatter PR and a wider regression surface.
- **Include key_location with the same 6-angle shape, accept degraded scoring.** Rejected: three of six angles would lose their scoring signal, falling back to rotation-only assignment. That reintroduces the structural-monotony problem we built angles to solve, just for key_location.
- **Include key_location with a pruned 4-angle pool.** Pragmatic but inconsistent — the value of the parallel-6 design is operator/test/code uniformity, and a pruned key_location pool breaks that uniformity for the smallest-volume category.
- **One shared cross-category pool for all four non-dining categories.** Smallest design surface. Rejected: drops the category-specific fact hook (named amenity for accommodations, named feature for attractions) that prevents fabrication. Generic "atmosphere/best-for/whats-different" angles don't constrain the lead sentence enough to defeat AI monotony.
- **Single all-or-nothing feature flag instead of per-category gate.** One ramp, simpler UX. Rejected: lets a weak category hide inside the aggregate score, and rollback granularity is all-three-off, not one-off. The existing category-gate machinery already supports per-category and was proven on dining.
