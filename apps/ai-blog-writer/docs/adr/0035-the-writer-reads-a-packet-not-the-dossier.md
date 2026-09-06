# The writer reads a packet, not the dossier

## Context

Issue #534 added selection: a model merges the repeated findings and ranks the
survivors against the brief, a person moves the line, and the claims that
survive carry a `selected` flag. It worked. On run `4a56545b` it cut 292
researched facts to 25.

The writer's prompt did not get smaller. It stayed at 29,878 characters, which
is what a run with no selection at all costs, because the prompt was never
mostly facts. Measured across the eight most recent stored runs
(`docs/audits/2026-09-06-research-redesign/`):

| run | dossier | selected | compose context | facts | research bookkeeping |
|---|---:|---:|---:|---:|---:|
| `4a56545b` | 292 | 25 | 29,878 | 7,225 | 10,371 (59%) |
| `8a7e9aa4` | 228 | 30 | 27,483 | 8,417 | 6,798 (45%) |
| `3750891f` | 137 | 27 | 30,933 | 9,496 | 10,280 (52%) |

Fifty-nine per cent of what run `4a56545b` gave its writer as evidence was a
list of all 28 research questions with their statuses — eleven rows of it
reading `claims: none kept for this article`. The cut was being made and then
handed over with its own receipt attached, and a writer holding a list of
questions answers questions.

The same list, or its equivalent, reached three stages downstream. The audit
received every requirement and its status. The punch list called every unused
fact "the safest items on the list: the article can use them today", including
the ones a person had deliberately removed. Polish was told to keep every fact
exactly as it is, which preserves the density it exists to relieve.

And nothing bound a selection to what it was chosen from. An operator answering
a question at the gate mints a new claim; a re-asked question replaces several.
Either could move the evidence under a selection made before it, and the
hand-off would apply that selection anyway.

## Decision

Three records, with the distinction between them enforced.

**The dossier records what was learned.** `EvidencePackage` is never narrowed.
Groundedness and the readiness follow-up keep reading every claim, so a fact
leaving the writer's desk never leaves the record and a question it answered
stays answered. An editorial cut must never be able to become a coverage
failure.

**The selection records what belongs in this article.** It gains the
fingerprints of the brief, the work order and a new
`EvidencePackage.content_fingerprint()`, so a choice can be told to be stale
rather than silently applied to evidence that has moved. That fingerprint is
deliberately blind to `selected` and `merged_into` — otherwise applying a
selection would make it stale the moment it was applied.

**A writing packet is the view the writing stages read.** `packet_v4` assembles
it in pure code from the selection and the dossier: chosen claims verbatim,
plus the caveats that make them true — source notes on their own sources, an
operator's note on a venue, any conflict naming them. No model call and no
paraphrase, because a fact rewritten by a model is prose asserting something,
and a drifted date inside one would pass groundedness: groundedness checks the
draft against the claim, and the claim is the thing that moved.

Compose reads the packet. The outline reads it grouped by what each fact is
for, validates its plan against the packet's claim ids rather than the
dossier's, and no longer names the `requirement_ids` each section serves — it
was the last reader of the question list anywhere in the pipeline. The audit is
told the shape of what happened rather than its contents. Repair carries the
qualifications, so a rewrite cannot straighten a hedged sentence into a
confident wrong one it is forbidden to correct. The punch list names reserve
facts as a change of scope. Polish may drop a crowded detail and never a
qualification.

### There is one path

`prepare_v3_runtime_request` requires a selection and `assemble_v3_instructions`
requires a packet. An argument you can leave out to get the whole dossier is
exactly the silent widening this exists to prevent: a failure in the narrow
path would restore the old behaviour with nobody watching. A run that genuinely
wants every fact says so with `selection_from_flags`, which records that a
person asked and binds the choice like any other.

`writing_request` therefore refuses a run with no selection instead of falling
back to everything. A ranking that fell over and a person keeping everything
used to look identical, and only one of them should produce a hundred-fact
article.

### The packet is frozen at the write boundary

One coherent snapshot under the run lock: brief, work order, dossier and
selection are read together, their bindings checked, and the packet built from
them stored in the runtime request. Every stage reads that. A resumed run
restores it rather than rebuilding one from a selection the operator may have
edited since.

`RESUME_SNAPSHOT_VERSION` goes to 5. A version-4 snapshot carries no packet,
and resuming one would write from the whole dossier — the failure this ADR is
about, arriving through the one door nobody is watching. In keeping with ADR
0031, old runs are refused rather than reinterpreted.

### Density is measured, never enforced

`crowded_sections` records any planned section above four facts per hundred
words — run `9e66bf84` gave one 200-word section 56 — and the run continues.
How many facts a paragraph can carry depends on what they are, and a plan
thrown away over an estimate helps nobody.

## Consequences

Measured on the same stored runs, replaying their real dossiers and selections:

| run | compose context | its evidence part |
|---|---|---|
| `4a56545b` | 29,878 → 17,566 | 19,014 → 6,702 |
| `8a7e9aa4` | 27,483 → 18,158 | 16,633 → 7,308 |
| `3750891f` | 30,933 → 19,333 | 21,194 → 9,594 |

Run `3750891f` is the one worth keeping in view: its outline context grew,
because its seven real source caveats now travel with the facts they qualify
instead of sitting in a bibliography the writer was told not to cite. A packet
that got smaller there would have got smaller by dropping the thing that makes
a fact true.

- A run in flight cannot be resumed across this change. It can be re-run.
- A run whose selection failed now stops for a person instead of writing from
  everything. That is a refusal where there used to be an article, and it is
  the intended trade.
- `POST /pipeline-v3` has no operator selection to read, so it builds one from
  the `selected` flags the request carries and records that nobody chose here.

## What this does not decide

**Whether the articles are better.** Every number above is a character count.
No draft was read for this and no model call was bought. The comparison —
same brief, same dossier, same voice, current handoff against this one — is
the next step, and it needs paid runs.

**Whether research should collect less.** Narrowing the producer is deliberately
after this: a question's purpose and its answer boundary belong on the work
order, and changing both ends at once would hide which one helped. Proving the
receiving boundary first is also what stops the audit and the punch list from
undoing a narrower research pass before anyone can measure it.

**What the editorial roles are worth.** `backbone`, `practical` and `texture`
are carried end to end — the selection stores them, the packet renders them,
the outline groups on them, the picker shows them — and nothing sets them yet.
The single balanced selection call that would is the next change to
`selection_v4`, and it replaces two ranking passes rather than adding a third.
