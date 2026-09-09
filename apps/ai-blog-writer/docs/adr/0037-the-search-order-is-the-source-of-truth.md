# The search order is the source of truth

## Context

The listicle pipeline runs an interview, turns what it settles into a set of
web searches, and pools the named places that come back. One real run existed
when this was written -- 2026-09-04, Lima cevicherias -- and an audit of it
found six confirmed faults and a catalogue built for one subject.

The improvement plan is
`~/.codex/visualizations/2026/09/08/01a082ef-f684-7cb0-b61f-635305a9dac1/listicle-pipeline-improvement-plan.html`.
Its six faults, and what each one actually was:

| fault | what it really was |
|---|---|
| every successful search reported as a failure | the search's result was passed through the interview's view builder, which reads `.run_id` off a `GrillState` |
| no way back to a run | the run id lived in one React hook's memory; the interview and results were on the server all along |
| the wrong count executed | the count was parsed out of a sentence, and "20, not 40" gave 40 because the reader took the largest plausible number |
| venues merged that are not the same place | name similarity beat conflicting evidence: two branches, two bars in one hotel |
| numeric names damaged | every leading digit was stripped as a list marker, so "1900 Hotel" became "Hotel" |
| listicle spend billed to Prompt2Blog | `service` rebuilt `GrillDependencies` from three fields and took the default for `job_id` |

Only the first is a coding slip. The rest are one shape of mistake: **a
decision that was made, and then re-derived from prose instead of being kept.**

The catalogue had the matching problem in the other direction. Four shapes
shared a `prestige` group of which at most one could be chosen; `cheap`,
`hidden` and `informal` shared a `humble` group. Award-listed and expensive are
different restaurants in most cities. A cheap neighbourhood bar and an
expensive hidden one are both real. Meanwhile family-run and longstanding are
usually the same places and shared no group at all. And a hotel commission was
offered market stalls and cuisine fusions, because one restaurant-shaped
catalogue was shown to every subject.

## Decision

**The `SearchOrder` is what the searches run from, and what the screen shows.**
Kind, place, target count, standard, exclusions, and the selected angles with
their identities. Built once at agreement, versioned, stored. The displayed
summary is generated from it. Nothing downstream re-reads the transcript.

**A decision is resolved against what was proposed, not against the
transcript.** An answer that carries no number is an acceptance of the
recommendation the question arrived with. An answer that corrects one -- "20,
not 40" -- is the correction. An answer carrying several numbers and no
correction is ambiguous: a number is still chosen so the run is not stuck, the
conservative one, and the order says it is unsure and offers to be corrected.

**An angle keeps its identity.** A stable id, the shape it was written from,
the role it plays, the wording the operator approved, and whether they changed
it. The picker sends those records alongside the answer text; the transcript
still stores what the operator wrote, because that is what was agreed to.

**A correction makes a new revision.** Results gathered under the old one still
exist and are re-checked against the new request by fingerprint. A stored
result is reused when the request has not changed and re-bought when it has.

**Work is stored per angle, not per batch.** A failure on the sixth search
keeps the five that worked. A retry names its angles and costs one search each.
A reload reads progress and never searches.

**Overlap is explained, never enforced.** Hard collision groups are gone. Each
shape names the shapes it tends to return the same places as, and the operator
decides. An edited line's theme label is shown as uncertain, because it
describes wording the line no longer has.

**The catalogue belongs to the subject.** Shapes declare what they apply to;
restaurants, bars and hotels bring their own dimensions; a subject the
catalogue knows nothing about keeps the shared shapes and gets no invented
category. The full catalogue reaches the model only once `count` is settled,
which is the first turn on which angles may be asked about.

**An angle carries a discovery role, and the role sets its allowance.** Broad
angles carry the list. A specific-discovery angle may succeed with one result
and is never pressured to fill a quota -- asking "the place credited with
inventing the dish" for twelve is asking it to invent eleven. An order whose
allowances cannot reach the target says so, and adds nothing nobody approved.

**A merge that is not certain does not happen.** Conflicting districts and
differing bracketed qualifiers block a merge; the rows are shown side by side
and labelled as possible duplicates. Every original sighting survives, so the
merge can be checked. The distinct count is reported as provisional whenever
any pair is unresolved.

## What this deliberately does not claim

Receiving a search result is not verification. Nothing here establishes that a
returned place is real, currently open, independently sourced or worth writing
about, and repeated discovery is reported as repeated discovery rather than as
a verdict on quality. The evidence step is not built.

Nor has the revised angle strategy been shown to find better places. The eight
evaluation cases are in `app/features/listicle_pipeline/evaluation.py` with
their criteria written down in advance; the paid comparison is
`scripts/listicle_angle_comparison.py`, it refuses to run without an explicit
spend acknowledgement, and **it has not been run**. The plan's own sequencing
says not to buy it until identity handling and result recording are
trustworthy, because otherwise the measurement measures the bug.

## Consequences

- `GrillOption` gains optional `shape` and `role`. The article grill sends no
  options at all and is unaffected; both callers are tested.
- Runs stored before this exist and still open. Their per-angle work was never
  recorded, so the assembled view falls back to the old stored blob and says
  individual searches cannot be re-run from it.
- Conservative matching will show more rows than the version it replaces. That
  is the intended direction: a duplicate left standing costs a glance, and a
  false merge deletes a venue with nothing on screen to notice.
- The batch lock prevents a duplicate start. It cannot promise a provider did
  not process a request whose answer never arrived, so an interrupted attempt
  is labelled interrupted rather than failed and the screen says retrying it
  may be charged again.
