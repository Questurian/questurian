# ADR 0010 — Remove auto-angle selection from the listicle blurb pipeline

## Status

Accepted. Supersedes the auto-angle half of ADR 0006 (Evidence Scan) and tightens the Listicle Angle contract introduced in ADR 0003 / extended by ADR 0009.

## Context

Until now, dining was the only category that routed through auto-angle assignment (`AUTO_ANGLE_ENABLED_CATEGORIES = {"dining"}`). Nightlife was already operator-only (ADR 0008, single-angle pool). Accommodations and attractions were deferred (ADR 0004).

In practice, auto-angle assignment picked framings the operator did not intend. The editorial decision — which lead shape this blurb takes — belongs to the human shaping the listicle, not to a heuristic over Evidence Scan output. The whole infrastructure (Evidence Scan stage, rotation lookback, viable-angle plumbing, `requested_angle` vs `effective_angle` distinction) exists to support a path no category will use going forward.

## Decision

The Listicle Angle is **always operator-selected**. There is no auto-angle path in the pipeline for any category, present or future. Specifically:

1. The frontend angle dropdown does not offer "Angle: Auto" for any category. New dining items default to no selection; the Auto Write button is disabled until the operator picks an angle. Existing drafts with `angle: null` stay null on load and require the operator to pick before regenerating.
2. The backend deletes `AUTO_ANGLE_ENABLED_CATEGORIES`, `assign_listicle_angles`, rotation lookback, and the entire **Evidence Scan** stage (prompts, schema, tests, route events, inspector wiring).
3. Research Profile remains the only research call. It validates the operator-selected angle post-hoc and gathers standard Research Buckets. If selected-angle evidence is weak or unsupported, the writer falls back to Research Buckets as low-confidence, then identity-only low-confidence — same fallback ladder as before, just without auto in front of it.

## Consequences

- `evidence_scan.py`, its prompts, tests, and the `viable_angles` payload field are removed. Inspector UI loses the Evidence Scan panel.
- `requested_angle` vs `effective_angle` is retained for the post-hoc evidence-fallback case (operator-selected angle with no cited support), but the "auto-selected" interpretation is gone.
- ADR 0006's Evidence Scan rationale is no longer load-bearing; this ADR supersedes that half. Research Profile half stands.
- `CONTEXT.md` glossary drops the Evidence Scan entry, removes auto-assignment language from Listicle Angle, and removes the four domain rules that governed auto-angle behavior. A new domain rule states angle is always operator-selected.
- One extra operator click per fresh dining item (selecting an angle before generation). Accepted cost.

## Alternatives considered

- **Keep dining on auto, just fix the heuristic.** Rejected: the operator already has the venue facts loaded; any heuristic is strictly worse than their choice, and Evidence Scan adds an LLM call per run for a decision the operator can make instantly.
- **Empty `AUTO_ANGLE_ENABLED_CATEGORIES` but keep the machinery dormant.** Rejected: leaves zombie code, ADR 0006 stays misleading, and future readers trip over a code path no category exercises.
