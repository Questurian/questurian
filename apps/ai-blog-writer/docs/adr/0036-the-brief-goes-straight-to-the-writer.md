# The brief goes straight to the writer

## Context

Between an approved Article Brief and a finished article the system currently
performs eleven translations: work order, research batches, notes, structured
claims, premise findings, conflict settlement, dedupe, rank, selection, packet,
outline, compose, groundedness, audit, repair, settle, finalize. Each one is a
model reading the previous model's summary of what the operator asked for, and
each one is free to change what matters.

The measurements are in `docs/audits/prompt2blog-pipeline-study-2026-09-07.html`
and the handoff at `docs/plans/prompt2blog-brief-to-article-handoff.html`. Two
stored runs make the shape of the problem concrete:

| run | questions | claims | facts reaching the writer | outcome |
|---|---:|---:|---:|---|
| Bogotá | 57 | 431 | 18 | article |
| Valparaíso `e001d48c` | 7 | 165 | 34 | `needs_revision`, 37 ledger calls |

The Valparaíso run rejected its own outline, attempted repair, restored the
earlier draft and finished unpublishable. The owner then pasted the *same saved
brief* plus a short style prompt into a Claude Opus High chat and preferred the
result on every count that matters: a coherent four-stop itinerary, concrete
descriptions, a headline that describes the piece.

That preferred draft is not clean. It says "four were still running" while
listing seven, asserts a fare its own research note calls unresolved, offers a
museum as an answer to "somewhere to sit", and spends a paragraph on a
restoration budget. Those are editing problems. The pipeline's problems are
architectural, and one of these two categories is tractable.

ADR 0035 already found the shape of this: fifty-nine per cent of what one run
handed its writer as "evidence" was a list of its own research questions with
statuses attached. A writer holding a list of questions answers questions. The
answer there was a smaller packet. The answer here is no packet.

## Decision

**The replacement boundary is the approved Article Brief.** Everything before it
is preserved unchanged: the seed, the grill (ADR 0033), the brief (ADR 0030),
the grill's own lookups, and first-hand material handling. Everything after it
is replaced.

**The work order, the research dossier, the gate, selection, the packet and the
writing graph are removed from the active path.** `work_order_v4`,
`research_v4`, `coverage_v4`, `gate_v4`, `selection_v4`, `packet_v4`,
`instructions_v3`, `orchestrator_v3`, `graph/topology_v3` and `stages/v3/` stop
being reachable from brief approval. This supersedes ADR 0024 (the first-class
stage graph), ADR 0029 (the v3 commission pipeline) and ADR 0035 (the packet),
whose subject no longer exists.

**One deterministic prompt replaces the instruction stack.** The brief, a target
word count and a short style block are formatted into a fixed template by a pure
function. No model writes the prompt. The same brief and template version always
produce the same text, byte for byte, and the operator reads that exact text
before anything is spent.

**The writer researches.** One research-capable Claude Opus High assignment does
what the work order, the research passes, the selection and the graph used to do
between them. It decides what to look up, looks it up, and writes. It returns the
article and, under a fixed `## Research note` heading, the sources it used and
the details it could not establish.

**A capability change is scoped, not global.** `claude_connection/cli_writer.py`
denies `WebSearch` and `WebFetch` to every caller. The research writer gets its
own explicitly-scoped invocation with those two tools and nothing else. The
global deny list is not weakened; every other consumer keeps the restrictions it
has today.

**The seed no longer fixes the headline.** ADR 0034 made the seed the title
because the deleted headline stage had never read the article. The writer here
has read it. The seed remains the run's name and its provenance, and the writer
writes a headline that describes what it actually wrote. ADR 0034's reasoning is
preserved; its conclusion is superseded by a writer that qualifies.

**A draft is a draft.** No score, no readiness verdict, no `needs_revision`
gate. A generated article is saved, readable and stageable without any check
passing. Quality work happens in a separate, later editor that proposes localized
changes a person accepts.

**No two-engine runtime.** The old implementation is recoverable through Git, not
through a flag. When this branch integrates, the only active path from brief
approval is the new one. Old runs that cannot open return an archived state; they
are not resumed through the new writer, and their stored articles are not
deleted.

## What this costs

One preferred sample is not proof. This buys a smaller, inspectable system whose
failures are legible, and it gives up per-claim groundedness records, the
coverage verdict, and the fact-level provenance that ADR 0035 built. Whether the
articles are better is decided by reading a small diverse set of them, not by
this decision record.

The editor is where the ceded ground is recovered, and it is deliberately second:
an editor built before a usable draft path would be an editor with nothing to
edit, and the temptation would be to rebuild the dossier underneath it.
