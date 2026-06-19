# Per-stop blurb writing becomes day-aware; the isolated writer is retired

## Context

Adding a stop after the pipeline runs is now a common path (inline mid-day
insertion landed in `feat: insert itinerary stops inline`). Two writers compose
stop blurbs, and the wrong one serves the per-stop button:

- The per-stop **"AI"** button (`autoWriteStopBlurb` → `ai-autowrite.service`,
  the legacy listicle writer of ADR 0003) composes a single stop **in
  isolation**. It receives a frozen blob of the sibling blurbs as background, but
  writes a standalone paragraph and — the real defect — **cannot update the
  neighbors** to acknowledge the stop just inserted. The new blurb does not hand
  off ("after the cathedral, walk to…"), and the stop before it still hands off
  to whatever used to come next. Operators experience this as "the new stop isn't
  aware of the other items."
- The sequenced **day composer** (`compose-itinerary-day-blurbs`, ADR 0019) is
  the only writer that produces intra-day handoffs, but it authors the **whole
  day as a set** and overwrites every blurb in it, hand-edits included.

So the operator's only routes were an unaware single blurb or a full-day
overwrite. ADR 0020 anticipated exactly this and routed "add a stop to a composed
day" into whole-day recompose, **explicitly rejecting** a "single-stop,
neighbor-aware compose" because inserting a stop leaves the *neighbor's*
already-written handoff stale, and read-only context for the new stop alone
cannot fix the neighbor's prose.

## Decision

Reintroduce a single-stop compose, but as a **subset of the day composer**, not
the isolated writer — and bound by the conditions that make ADR 0020's objection
manageable rather than ignored.

- **Write-subset on the day composer.** `ComposeDayBlurbsRequest` gains a set of
  `write_target_ids` (the stops to actually author) and, for the context-only
  siblings, their **existing blurb prose**. The prompt presents the full day in
  order; context-only stops are marked "already written — thread off these, do
  not rewrite." Only `write_target_ids` results are parsed and applied. One
  writer, one prompt; the shared anti-AI voice block (ADR 0021) and
  `validate_generated_text` contract are unchanged.
- **Context scope = the stop's day.** Day-siblings (with real prose) + Intro +
  plan overview + tone + the prev/next-day edge stops — the same framing the day
  composer already assembles. Not whole-trip: the Intro carries the trip arc
  (ADR 0018/0019), so a single in-day blurb gains nothing from other days but
  tokens.
- **Operator always chooses.** Composing after adding a stop offers "write just
  this stop (aware of the rest)" vs "recompose the whole day." No smart default
  keyed on insertion position — the operator owns the call each time.
- **Stale-neighbor warning on mid-insert/swap.** When the added/changed stop is
  not an append-at-end, the dialog warns that the preceding stop's handoff may
  read stale and that recomposing the day fixes it; the operator may still
  proceed. Append-at-end carries no warning — nothing pointed past the old last
  stop, so single-stop aware compose is staleness-free there.
- **Retire the isolated writer for the per-stop button.** The per-stop "AI"
  button routes through this aware path, so an unaware single-stop blurb becomes
  impossible. The batch "auto-write all empty blurbs" (`autoWriteEmptyFields`)
  stays on the legacy writer for now — a scoped boundary, not a full migration.

## Considered Options

- **Keep routing every add into whole-day recompose (ADR 0020 as-is)** — never
  reopened, but forces an overwrite of approved/hand-edited blurbs to add one
  stop, which is the friction that made operators reach for the unaware button.
- **A second, dedicated single-stop endpoint** — cleaner separation on paper,
  but duplicates the day composer's intro/neighbor/voice plumbing and gives two
  prompts to keep in sync.
- **Make the legacy isolated writer sequence-aware** — fights ADR 0019, which
  condemned that frozen per-target shape as structurally unable to do handoffs.
- **Smart default by insertion position** (append → just-this-stop; mid-insert →
  whole-day) — considered and dropped: the operator preferred to choose every
  time, with the position only driving the *warning*, not the default.

## Consequences

- **This amends ADR 0020's rejection.** "Single-stop, neighbor-aware compose"
  now exists, but only because the siblings are supplied as read-only **prose**
  (not just titles), append-at-end is genuinely staleness-free, and mid-insert/
  swap is warned rather than silently shipped. ADR 0020's core rule —
  whole-day recompose remains the way to fix stale neighbor handoffs — is intact;
  this adds a deliberately-narrower option beside it.
- **Mid-insert + "just this stop" can still ship a stale neighbor handoff.** This
  is accepted and surfaced by the warning; the operator chose it. Recomposing the
  day is always the clean fix.
- **The day composer's output contract is unchanged** — same single-paragraph
  `blurb`, same validator, same Lexical/Payload path. Only the request shape
  grows (`write_target_ids` + per-stop existing prose); responses for unwritten
  stops are simply absent.
- **The legacy writer is not fully retired.** It still backs the batch empty-fill
  path, so a follow-up can migrate `autoWriteEmptyFields` onto the day composer
  to make every blurb entry point sequence-aware.
