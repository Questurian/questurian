# ADR 0006 — Split listicle evidence into Evidence Scan and Research Profile

## Status

Accepted. Supersedes the combined Evidence Profile shape from ADR 0005.

## Context

The combined Evidence Profile pass validates every candidate Listicle Angle and also produces writer-ready findings for each validated angle. That makes auto angle assignment possible, but it also means a manual operator angle selection does not scope research: the pipeline still searches every angle before honoring the selected one. It also leaves blurbs underfed when an angle has evidence but the writer lacks broader reputation, history, social-proof, fit, or timing facts.

## Decision

Split listicle blurb evidence work into two concepts:

1. **Evidence Scan** — a thin angle-viability check used only when the operator leaves angle selection on auto. It may inspect all candidate angles, but returns only angle candidates with support status, confidence, citations, and a short reason. It does not produce writer-ready findings.
2. **Research Profile** — one grounded call per blurb that produces writer-ready cited evidence for the selected angle plus standard Research Buckets. Manual angle selection skips Evidence Scan entirely; the selected angle becomes authoritative research intent.

Research Buckets are stable evidence lanes available to the writer regardless of angle: `reputation-summary`, `specific-offerings`, `experience-texture`, `history-or-ownership`, `practical-usefulness`, `best-for`, `standout-hook`, `social-proof`, `visual-assets`, `caveats-or-fit-warnings`, and `timing-tips`. Buckets inform facts only; the selected Listicle Angle still controls framing and lead shape.

If selected or auto angle framing is weak or unsupported, the writer must not force that angle or silently switch to another. The pipeline generates from usable Research Buckets as low-confidence, or identity-only low-confidence if bucket evidence is also too thin. Weak angle support is a warning, not a hard error.

## Consequences

- Current `evidence_profile.py` should be replaced by `evidence_scan.py` and `research_profile.py`, with old names kept only as temporary compatibility shims.
- Route events should move toward `evidence_scan_completed` and `research_profile_completed`; inspector UI can still group them under a broad evidence section.
- Generated item responses should expose merged `source_urls`, warning details, requested vs effective angle, and structured per-angle/per-bucket evidence in the inspector. Payload prose does not expose citations by default.
- `skip_existing` targets should skip Evidence Scan and Research Profile work because no new blurb will be generated.
- Initial implementation remains scoped to dining and nightlife, matching the current enabled category gate.

## Alternatives considered

- **Keep combined Evidence Profile.** Rejected because manual angle selection still pays for and exposes all-angle research.
- **Always run Evidence Scan, even for manual angles.** Rejected because Research Profile can prove or reject the selected angle directly, and a scan would reintroduce duplicate broad research.
- **Allow operators to force unsupported angles.** Rejected because the pipeline's promise is grounded blurbs; unsupported framing belongs in manual editing, not AI generation.
- **Cache Research Profiles across runs.** Rejected for now because source freshness and invalidation rules are not defined.
