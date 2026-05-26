# ADR 0005 — Evidence Profile replaces Grounded Research as a separate stage

## Status

Proposed. Supersedes the Grounded Research and Critical Fields portions of [ADR 0003](./0003-listicle-blurb-pipeline.md) (Tier 2 / Tier 3 field handling, Fallback Research scoped by LM gaps, separate gap-driven research stage). Extends [ADR 0004](./0004-extending-listicle-blurb-pipeline-to-non-dining-categories.md) by binding angle pools to the same vocabulary EP emits.

## Context

ADR 0003 assumed LM-curated venue fields (music, vibe, crowd profile, idealFor, hours, etc.) were the primary blurb input, with Grounded Research scoped to fill Tier-2 gaps the Critical Fields Guideline identified as missing. Two things made this premise stop holding:

1. **An audit of nightlife/dining LM fields concluded most are bad blurb input.** Generic enum values (`High-Energy`, `Friends Night`), database-y attributes (`crowdProfile: 25-35`), and logistics metadata (reservation URLs, hours) do not make readers care why a venue belongs on a list. Only a narrow slice (specific music genre, named resident DJs, late-night window, signature dish) supports the editorial promise of a blurb.
2. **Grounded Research already had to discover what's worth saying about a venue.** Once you accept that LM fields aren't the reliable input, "what should we research?" becomes a real per-venue question — not something the Critical Fields Guideline can answer from a static field whitelist.

The 0003 pipeline also paid for two grounded LLM calls per venue (one to know what to research, one to do the research), which is duplicate work once both calls reason about the same venue from the same public web.

## Decision

**Replace the separate Grounded Research stage with an Evidence Profile stage that probes the venue's public footprint and emits both the validated angle plan and the findings in one grounded LLM call. Gut Critical Fields Guideline to a thin static identity gate. Bind the writer's available angles to EP's validated subset.**

New per-venue listicle pipeline shape:

1. **Critical Fields Guideline** — category-agnostic pre-flight: has `name`, has supported `category`, has resolvable location label, has Payload doc identity. Four booleans, hard-block on failure. No Tier 1/2/3, no per-category field whitelists.
2. **Evidence Profile** — one grounded LLM call per venue, parallel pre-pass over the full listicle. Probes the venue's public footprint internally (editorial coverage, social activity, community chatter, owned web presence, temporal freshness, distinctiveness). Emits:
   - `bucket`: `rich-public-evidence` | `sparse-public-evidence` | `no-public-evidence` — UI/operator-facing summary, not load-bearing.
   - `research_targets`: ordered subset of the category's Listicle Angle pool naming the angles with cited public evidence. Uncited validations are dropped.
   - `findings`: short structured findings keyed to each entry in `research_targets`, source-cited, writer-ready.
3. **Angle assignment** — runs after all venues' EP results are in. Rotation operates only over each venue's validated subset; accepts repetition if subsets can't spread.
4. **Writer** — receives List Tone + assigned angle + findings for that angle. If a venue's `research_targets` is empty, falls back to a distinct identity-only writer prompt that forbids inferred claims, and the item is flagged in the operator UI as low-confidence for review before publish.

## Considered options

- **Keep ADR 0003's shape, refine Tier 2 field lists.** Rejected: the audit found the LM fields themselves are the wrong substrate; refining the whitelist doesn't fix that.
- **EP as a pure classifier, Grounded Research as a separate findings stage.** Rejected: both calls hit the web and reason about the same venue. A second grounded call to gather findings the first call already cited is duplicate cost.
- **Soft constraint on writer angles** (allow out-of-research angles with identity-only fallback). Rejected: reintroduces invented framing through the back door, which is exactly what the redesign exists to prevent.
- **Per-venue EP cache with TTL.** Rejected: chose freshness over cost for now; revisit if grounded-call spend becomes a real budget concern.
- **Category-agnostic flat target vocabulary.** Rejected in favor of per-category pools, mirroring the existing Listicle Angle architecture and producing sharper queries.

## Consequences

- **Critical Fields Guideline loses its category-specific tier logic.** Anywhere that branched on tier — gap detection, conditional research scoping, per-category field requirements — gets deleted or reduced to identity validation.
- **Grounded Research is no longer a pipeline stage.** Its `grounded_research_called` event/state is replaced by `evidence_profile_completed`. The findings still exist as a payload field on EP's output.
- **Writer's angle pool is constrained per venue.** Angle rotation can produce repetition within a single listicle when validated subsets don't spread; the writer prompt mitigates with sentence-shape variation instructions, not by reaching outside the validated set.
- **The Listicle Angle pool now does double duty** — editorial framing vocabulary AND research target vocabulary. Adding an angle to a pool means EP has to learn to validate it.
- **Per-listicle latency depends on the slowest of N parallel grounded calls** rather than on a serial CF → GR chain. For typical 6–10 venue lists this is a wash or a win, but a single slow venue now blocks angle assignment for the whole list.
- **Operator UI grows two new affordances**: an Evidence Profile panel per venue in `InspectListicleRunModal` (bucket + validated targets + citations), and a low-confidence flag on demoted items.
