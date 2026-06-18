# Operator-authored Selection reasons for stops added after Autobuild

## Context

Itinerary Autobuild fills every stop it places with a **Selection reason** (`item.selectionReason`), an internal "why this pick" note that seeds two downstream composers: the day-blurb composer (ADR 0019) and the intro composer (ADR 0018). But the builder lets the operator add or swap stops *after* the pipeline runs, and those stops have no reason — so the blurb writer receives a blank rationale and produces a generic paragraph, the very gap this feature closes.

## Decision

A stop whose **resolved identity** is established or changed by the operator becomes operator-authored: the operator answers a rough "why did you pick this?", a dedicated editor-assist endpoint cleans/expands it into the same internal register Autobuild uses, and the result lands in `selectionReason` — indistinguishable to both composers from an Autobuild reason. Specifically:

- **Trigger is identity, not stop type.** Establishing or changing a stop's resolved identity (`item` id for pooled, title/operator for manual) is what requires a reason. A swap **clears** the prior reason — it described the wrong venue.
- **No provenance field.** Behavior derives from `selectionReason` emptiness plus clear-on-identity-change. Autobuild fills every stop, so an empty reason *is* "operator-resolved, needs a why." The Autobuild-vs-operator distinction stays conceptual (CONTEXT.md), not a stored flag.
- **Hard gate, no block-type exemption.** An empty reason on a resolved stop blocks its day's compose, surfaced in `getItineraryDayBlurbComposeDisabledReason` beside the existing angle gate. Manual stops (`key_location`/`tour-agency`) are angle-exempt but **not** reason-exempt — their blurbs benefit too, and Autobuild already gives them one.
- **Dedicated clean/expand endpoint** mirroring `REASONS_PROMPT` from `itineraries_pipeline/llm_stages.py` (venue draw + why it fits here; preserve slot context; not scoring jargon; not the blurb). A shared register is the contract that keeps operator and Autobuild reasons interchangeable downstream.
- **Preview-then-commit.** The cleaned reason appears in the editable ⓘ field for the operator to accept or tweak before it propagates to two composers. On endpoint failure, the operator's **raw text** is stored (still a valid seed, satisfies the gate). Empty input leaves the gate unsatisfied.
- **Whole-day recompose stands (ADR 0019).** Adding a stop to a composed day funnels into whole-day recompose via the existing `dayHasExistingBlurbs` confirm; the confirm copy is sharpened to name the composed blurbs at stake, since this feature turns a rare action into a common one.

## Considered Options

- **Single-stop, neighbor-aware compose** — compose only the added stop, feeding it neighbors' blurb prose. Rejected: reverses ADR 0019's "whole-day regenerate, not gap-fill." Inserting a stop leaves the *neighbor's* already-written handoff stale ("after the Alcázar…" when the reader is now at the inserted stop), which neighbor-prose context for the new stop cannot fix.
- **Reuse `rewrite-block`** for clean/expand — a generic prose rewriter with no notion of the reasons register or slot context; would drift toward reader-prose or scoring-speak that reads wrong when the intro composer treats it as an internal note.
- **Optional reason (prompt-on-add nudge only)** — operators skip it, and the blank-rationale problem returns, just less often.
- **Stored provenance tag** — earns its keep only cosmetically (a "you wrote this" badge); not worth a persisted field + ABW→Questura contract change.

## Consequences

- `selectionReason` now has two producers. Both must hit the same internal register, enforced by the shared prompt — not by code that can tell them apart.
- Adding a stop to a composed day will regenerate that day's other blurbs, hand-edits included (ADR 0019's accepted cost, now a common path). The sharpened confirm makes the cost visible at the moment it bites.
- Re-running Autobuild still full-replaces a day behind its own confirm, overwriting operator reasons wholesale — unchanged, and acceptable.
