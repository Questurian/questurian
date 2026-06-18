# Itinerary stop blurbs and intro adopt the shared anti-AI voice block

## Context

The shared anti-AI voice guideline (`app/shared/prompts/anti_ai_tells.py`) was only wired into the **single-type listicle** blurb writer (`listicle_writer.py`), gated to `ANTI_AI_PROMPT_CATEGORIES`. The itinerary composers were built without it: the stop-blurb day composer (ADR 0019, `COMPOSE_DAY_BLURBS_PROMPT`) carries only a handful of ad-hoc inline rules ("No em dashes… do not sound like an AI summary"), and the intro composer (ADR 0018, `COMPOSE_INTRO_PROMPT`) has none — the module doc records intros as "the legacy path." `ANTI_AI_TELLS_FULL` was defined but wired nowhere, its first use deferred to "its own ADR." As we add operator-authored Selection reasons (ADR 0020) to improve what *seeds* itinerary blurbs, the writers that *consume* those seeds must be on the same voice path, or we improve the input and leave the output sounding like AI.

## Decision

Both itinerary prose composers adopt the shared block:

- **Stop blurbs** — append `ANTI_AI_TELLS_BLURB` (with its precedence header) to `COMPOSE_DAY_BLURBS_PROMPT` and drop the now-redundant ad-hoc voice lines. The BLURB variant fits: itinerary stops are single ~90–140-word paragraphs, the same shape it was written for.
- **Intro** — wire `ANTI_AI_TELLS_FULL` into `COMPOSE_INTRO_PROMPT`. This is the **first production use of FULL**. FULL (not BLURB) is correct because an intro is 1–3 paragraphs: it keeps the multi-paragraph rhythm, summary-pattern, and final-test rules that BLURB deliberately drops for a single paragraph.

The guideline applies only to **reader-facing prose**. Internal planning text — Selection reasons (incl. ADR 0020's clean/expand endpoint) and the plan overview — stays off the anti-AI path by design; those are notes the composers transform, not copy the reader sees.

## Consequences

- `ANTI_AI_TELLS_FULL` is now live, setting the precedent the module doc anticipated for the other body composers (youtube2blog, prompt2blog, url2blog, block-rewrite). Those remain out of scope here and can follow this wiring.
- Itinerary blurbs move off their bespoke inline rules onto the shared, centrally-maintained block; future voice changes propagate to itineraries automatically rather than needing a parallel edit.
- The day composer's `validate_generated_text` contract (single paragraph, no em dashes, word-count bound) is unchanged — the block is guidance layered above the same validator, so nothing downstream of generation moves.
