# ADR 0007 — Writer Brief curator between Research Profile and the writer

## Status

Accepted. Initial scope: nightlife only. Extends the listicle blurb pipeline shaped by ADR 0003, 0004, 0006.

## Context

The current nightlife writer prompt has three structural problems that an external editorial read of one rendered prompt made concrete:

1. **Redundant context.** Article title and venue identity appear twice (top of prompt and inside `BUILDER CONTEXT`). The Research Profile dumps the selected angle finding plus up to 11 standard buckets; the same fact (e.g. "mansion + top-35 bars") legitimately surfaces in `reputation-summary`, `standout-hook`, `experience-texture`, and `history-or-ownership` because bucket overlap is structural by design.
2. **Database-field prose as input.** `BUILDER CONTEXT` carries Location Manager identity fields (exact hours, square meters, age ranges, lunch service windows, category-irrelevant disclaimers). The writer prompt's own rules then ban "database-field prose" in the output, so feeding these fields in only invites the model to misuse them.
3. **Voice rules that fight themselves.** `ANTI_AI_TELLS_BLURB` is ~30 banned constructions plus a Triad rule, a Blurb rhythm rule (must contain a <10-word sentence AND a 25+-word sentence), and a Cadence rule (at least one flat factual ending) — three independent shape mandates stacked on a 90–140 word paragraph. The tone spec (`elevated`: polished, refined, slightly formal) also pulls against the voice spec ("take a side, risk being wrong, commit") while the closer-shape bans remove most of the tools an editorial voice uses to commit.

The bucket overlap cannot be fixed in the Research Profile itself: each bucket has a distinct collection role and is queried as such. The redundancy needs to be collapsed downstream, scoped to the selected Listicle Angle. Code-only dedup (substring overlap heuristics) can collapse near-duplicates but cannot synthesize a venue-tailored angle directive from a static per-angle template, and cannot make judgment calls about which 3–6 facts a `best-for-night` blurb actually needs versus a `room-feel` blurb.

## Decision

Add a per-blurb curation step between Research Profile and the writer that emits a **Writer Brief** — the lean writer-ready payload — and feed only that payload to the writer for nightlife blurbs.

### Writer Brief

A Writer Brief bundles:

- An **angle directive**: a venue-tailored one-line directive filled from a per-angle template, e.g. `best-for-night` → "Open by naming the kind of night {venue} is best for, and give one concrete reason rooted in the room, the drinks, the crowd, or the pacing."
- A **flat Source Facts list** of 2 to 8 bullets, drawn across all Research Buckets and the selected-angle finding, with bucket labels stripped and overlapping facts collapsed. Citations are preserved per fact for inspector display but not shown in the writer prompt.

Curator output shape (JSON):

```json
{
  "angle_directive": "...",
  "source_facts": [
    { "fact": "...", "citations": ["https://..."] }
  ]
}
```

Curator model: `gemini-2.5-flash`, temperature 0.1, JSON output mode, max tokens sized with headroom (~2k). The curator is non-grounded — it synthesizes from the upstream Research Profile JSON and the per-angle template, not from web search.

### Lean nightlife writer prompt

For nightlife blurbs the writer prompt is rewritten to the lean shape:

- Article type, title, venue, location (each once).
- Tone (one line, from List Tone).
- Angle directive (from the Writer Brief).
- "Source facts (use only what you need):" rendered as flat bullets (from the Writer Brief).
- Length + voice line: "Write like an editor who has been there. Take a position. Pick the one detail that actually decides the recommendation and lead with it."
- Short Avoid list (~8 items): em dashes and comma-bracketed asides; three-adjective stacks; personified menus/rooms/drinks; kicker closers and imperative sign-offs; `curate`, `craft` (verb), `elevate`, `showcase`, `leverage`; hedges (`arguably`, `perhaps`, `truly`, `simply`, `just`); inventing details (prices, named drinks, specific years, quotes); database-field prose.
- "Vary sentence length. Not every sentence the same shape."
- "Output the paragraph only."

Dropped for nightlife:

- `BUILDER CONTEXT` block (Location Manager identity dump).
- `ANTI_AI_TELLS_BLURB` (full ~30-item negative-constraint wall).
- `NIGHTLIFE_BLURB_CALIBRATION` (the per-category addendum).
- The `Triad` / `Blurb rhythm` / `Cadence` triple-stack rules.
- `CURRENT BUILDER COPY` scaffold lines when empty (already conditional; explicitly retained as conditional).

### Fallback

If the curator call fails (timeout, malformed JSON) or returns 0 facts, the pipeline falls back to `build_identity_only_writer_prompt` and marks the blurb low-confidence. Writer Brief is a hard dependency for the rich nightlife path; we do not retain the bucket-dump writer prompt as a nightlife fallback because keeping both shapes alive defeats the goal of retiring the bloated prompt.

### Glossary

`Writer Brief` is added as a new term. `Research Profile` is redefined as "cited evidence bundle" (no longer "writer-ready evidence bundle"), since it now passes through Writer Brief curation before reaching the writer.

## Consequences

- One extra LLM call per nightlife blurb. Flash-tier and non-grounded; cost is small relative to the writer call.
- The writer prompt shape for nightlife diverges from dining, accommodations, and attractions until those categories are individually ported. `_voice_rules_block` and the writer prompt builder gain a nightlife-specific branch.
- Research Profile inspector view continues to show buckets unchanged. A new `writer_brief_completed` step event is emitted with the curator prompt, raw response, curated angle directive, source facts, and per-fact citations.
- The existing 3-entry nightlife `LISTICLE_ANGLE_GUIDANCE` is no longer read for nightlife blurbs. A parallel `NIGHTLIFE_ANGLE_DIRECTIVES` dict holds the directive templates (3 entries: `room-feel`, `order-timing-tip`, `best-for-night`) with a `{venue}` placeholder.
- Validator (`validate_generated_text`) is unchanged: em dash, heading, bullet, footnote, word-count, and review-disclosure checks still apply.
- Out of scope: extending Writer Brief to dining / accommodations / attractions; rounding the nightlife angle pool out to six per ADR 0004; intro prompts; full retirement of `ANTI_AI_TELLS_BLURB` (still used by the other anti-AI-enabled categories until they are ported).

## Alternatives considered

- **Code-only trim in `build_writer_prompt`.** Strip `BUILDER CONTEXT`, dedupe bucket bullets by substring overlap, swap the voice block — no new LLM call. Rejected because deterministic dedup cannot select the 3–6 facts that actually matter for the selected angle (a `best-for-night` blurb and a `room-feel` blurb need different subsets of the same Research Profile), and cannot tailor the angle directive to the venue.
- **Restructure Research Profile to emit angle-scoped facts directly.** Change the grounded prompt so the output is already a flat ranked fact list per the selected angle. Rejected because Research Bucket collection is intentionally angle-agnostic (per ADR 0006: "Research Buckets are stable evidence lanes available to the writer regardless of angle"). Folding angle scope into Research Profile reintroduces the manual-vs-auto conflation ADR 0006 just split apart.
- **Keep `ANTI_AI_TELLS_BLURB`, just drop `NIGHTLIFE_BLURB_CALIBRATION`.** Rejected because the external read identified the ~30-item wall + competing structural rules as the dominant problem, not the per-category addendum on top of it.
- **Drop voice rules entirely.** Rejected because the lean example still carries a short Avoid list. Going to zero reintroduces em dashes, `curate`, `elevate`, and personifications immediately.
- **Apply lean prompt to all four anti-AI-enabled categories at once.** Rejected to keep the change A/B-able on nightlife first, matching the per-category validation gate from ADR 0003.
