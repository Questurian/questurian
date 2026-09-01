# The seed is the title, and the headline stage is deleted

## Context

ADR 0030 commissioned a headline stage: the pipeline writes the title from the
finished article. ADR 0031 then made the seed the start of the run and recorded
it as provenance only — the line the operator typed to open the run, kept for
the record and read by nothing downstream.

Those two decisions together produced a stage that writes a headline for an
article whose author it has never been shown.

**What it did with that.** `_title_material` sent the promise, the spine, the
article opening and the headings. The prompt then said "keep the original
title's intent" about `original_title`, a v3 field that v4 removed. So the one
instruction pointing at the author's own words pointed at nothing. Denied them,
the stage fell back on search-engine instinct:

| | |
|---|---|
| the operator typed | *Lima is no longer simply the stopover before Cusco* |
| the stage produced | *Lima vs. Cusco: Why a 2-3 Day Stopover Beats a Layover Before Machu Picchu* |

A colon, keywords, and a comparison the article never makes. The seed is the
better headline on every count: declarative, it holds a view, and it is true to
the piece. It was sitting on the run the whole time.

`7638bcb7` mitigated this by passing the seed in as `the_authors_own_headline`
and telling the prompt to start from the assumption it is already the headline.
Run `76b36468` then produced a title with no colon and no invented comparison.
That is a model being talked out of a bad habit, one prompt at a time, to
arrive back at the line it was given.

## Decision

**The seed is the title.** It is set when the run's state is built, carried to
`finalize` unchanged, and the operator edits it in the Payload editor after
staging.

**The headline stage, its model call and its prompt are deleted, not repaired.**
`stage_v3_title`, `run_v3_title_stage`, `P2B_V3_TITLE_PROMPT`,
`P2B_V3_TITLE_MODEL` and the `title_model` route all go.

This amends ADR 0030, which commissioned the stage, and ADR 0031, which made
the seed provenance only. The seed is no longer provenance; it is the headline
until a person changes it.

Twenty candidate headlines from a chatbot that has read the finished article
beat one from a stage that never read the brief's author. Nothing about that
gets better by paying for the stage.

## What this does to the resume safety net

This is the part that blocked the change twice on 2026-08-31, and it is not
incidental.

`resume` exists so a run that dies late is not paid for twice. Eight tests hold
that line, and every one of them simulated a late death with `TitleFailsLLM`,
which raises on `invoke_text` — **because the title stage was the only stage in
the whole graph that called `invoke_text` at all.** Deleting the model call
breaks all eight, whether the node goes or merely stops calling a model.

So the deletion is not a rename. It is a deliberate change to what the net
catches, and the net has to be re-derived rather than patched:

**The last fallible stage becomes `quality_audit`.** After the deletion the
graph's paid stages are outline, compose, groundedness, quality_audit and
repair. `quality_settle` and `finalize` make no model call, so nothing after
the audit can fail for want of an account.

**A late failure gets cheaper to recover, not dearer.** Measured on run
b78a9fe8: the title cost 17,395 tokens and the audit 6,876. A run that dies at
the last paid stage now re-buys the smaller of the two, and keeps the outline,
the draft and the grounding verdict exactly as before.

**The gate is still re-decided, not guessed.** A resume that re-enters at the
audit routes into repair or settle by asking `route_quality_gate` on the
restored state, which is what the original run would have done. That was
already true and does not change.

**`RESUME_SNAPSHOT_VERSION` goes to 4.** A snapshot written by the old topology
can name `title` as its next node, and that node no longer exists. Bumping the
version refuses those by name — `snapshot_version_unsupported` — instead of
letting them fall through to a vaguer complaint about an unrunnable stage. In
keeping with ADR 0031, old runs are refused rather than reinterpreted: no
compatibility shim.

## Consequences

- One fewer model call per article, and the one removed was writing a headline
  worse than the one it was handed.
- `Prompt2BlogLLM.invoke_text` now has no caller in the pipeline. It is kept on
  the protocol; `_invoke_text_llm` is still used directly by `api/generation.py`.
- A run in flight against the old graph cannot be resumed after this ships. It
  can be re-run. That is the accepted cost of the clean break.
- The operator cannot yet edit the title inside the intake. They edit it in
  Payload, which is where the article is staged and where the headline is
  chosen in practice. An in-app title field is worth considering and is not
  part of this.

## What this does not decide

Whether a headline should ever be generated. It should — by a person, in a
chatbot that has read the finished piece, with twenty candidates to choose
from. What is deleted is a pipeline stage that produced one candidate, blind to
the author, and charged for it.
