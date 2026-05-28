# ADR 0012 — Extend lean blurb pipeline to attractions

## Status

Accepted.

## Context

Dining, nightlife, and accommodations blurbs now use the Research Profile -> Writer Brief -> lean writer path. Attractions already had a six-angle pool from ADR 0004 and backend request support, but the operator builder did not expose the pool and the backend kept attractions outside `ANTI_AI_PROMPT_CATEGORIES` and `LEAN_PROMPT_CATEGORIES`.

This left attractions on the bucket-dump writer prompt while the other public venue categories used the newer lean prompt.

## Decision

Move attractions onto the existing lean blurb pipeline using the ADR 0004 six-angle pool:

- `signature-feature`
- `setting`
- `history-built`
- `visit-time-tip`
- `best-for-visit-type`
- `whats-different`

Attractions joins `ANTI_AI_PROMPT_CATEGORIES` and `LEAN_PROMPT_CATEGORIES`. `ANGLE_DIRECTIVES_BY_CATEGORY["attractions"]` defines venue-facing directive templates for all six angles. The frontend single-type-listicle builder exposes the six options when `listicleType === "attractions"`.

No new Research Buckets are added. Attractions keeps its existing bucket priorities: `timing-tips`, `standout-hook`, `visual-assets`, and `caveats-or-fit-warnings`.

## Consequences

- Attraction blurbs now run Research Profile, Writer Brief, lean writer, validation, and retry like dining/accommodations.
- The legacy bucket-dump writer prompt remains available for categories outside the lean set, currently `key_location`.
- `CONTEXT.md` now records attractions as a production Listicle Angle pool and Writer Brief category.

## Alternatives considered

- **Create a wider attractions pool first.** Rejected. ADR 0004's six angles cover the useful lead shapes and are already represented in backend guidance.
- **Expose attraction angles in the frontend but keep the fat prompt.** Rejected. It would preserve the exact inconsistency this change removes.
- **Add attractions-specific Research Buckets.** Rejected. Current universal buckets and attractions priorities are enough for this rollout; add buckets only after output audits show repeated missing evidence.
