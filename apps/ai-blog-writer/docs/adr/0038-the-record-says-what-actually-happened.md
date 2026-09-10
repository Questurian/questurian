# The record says what actually happened

## Context

ADR 0037 made the `SearchOrder` the thing the searches run from. A second
review, on 2026-09-09, took the pipeline at that commit and reproduced ten
failures and two spend mechanisms against the real modules and a real
disposable SQLite database. The plan and the harness are in
`docs/plans/listicle-pipeline-implementation-plan.html` and
`docs/plans/listicle-pipeline-verification/recheck.py`.

They are not ten faults. They are one fault in ten places: **the pipeline
stored what something currently is, where it should have stored what
happened.**

| what was stored | what it destroyed |
|---|---|
| one row per angle per revision | a refresh that failed overwrote the success it was replacing |
| a lock read on a deferred connection | two callers both owned one batch and both dispatched |
| a reused result re-filed under the new revision | one paid search reported itself as three |
| the existing order, returned on every agreement | a re-agreement of twenty went on storing forty |
| a candidate keyed by nothing | containment merged two hotels and one disappeared |
| a cut verdict keyed by name | a flag for one branch landed on the other |
| a cut review keyed by revision | a refreshed pool read as checked and clean |
| a prompt truncated at 120 rows | candidate 121 was never shown to anyone |
| a profile keyed by name and city | two Place IDs resolved to one profile |

Each one is invisible from the screen, and most of them are invisible from the
database too: the row that would have said what happened was overwritten by the
row saying what is true now.

## Decision

**An execution has an identity, and a terminal one is frozen.** A search is one
attempt with one id. A second search of the same angle is a second attempt.
Storage refuses to move an attempt that has completed, failed or been
interrupted, so this is a property of the record rather than of caller
discipline.

**What is displayed is a separate record from what happened.** A per-revision
selection says which attempt each angle is showing and which was most recent.
A failed refresh leaves the earlier success selected and the failure latest,
and the screen states both.

**Reuse is a reference.** Research that still answers this revision's request is
pointed at, never copied. The attempt keeps the revision it was run under, so
its age is readable and search history counts it once.

**Contribution belongs to a pooling, not to an execution.** The same search has
different exclusivity against different peers. A pool snapshot records what one
pooling measured; history reads one snapshot per prior run.

**One batch has one owner.** The claim reads, checks and writes inside one
immediate transaction and returns a token. The token is checked before every
dispatch and again before a result is filed. A heartbeat runs through the
blocking provider calls, so a long batch keeps its lease without widening the
window a dead process holds the run for.

**A re-agreement is resolved field by field against what the interview had
settled last time.** A field it changed its mind about wins. A field it did not
is left exactly as the order has it, including a direct operator correction.
When a later interview answer really does override a correction, the order says
so. Creating an order, reading one and re-agreeing one are three named acts.

**A revision is allocated atomically, and a correction names the revision it
was written against.** A correction that changes nothing saves no revision.

**A merge that is not certain does not happen — and containment is not
certainty.** Grouping is exact on the folded full name, the district as stated
and the bracketed qualifier. Containment, word overlap and a shared name across
districts attach a possible-duplicate link and merge nothing. A candidate is
identified by a hash of its member sightings, so pooling is order-independent
and changed membership is a different candidate.

**A verdict is filed against a candidate id.** Two rows may display one name and
are never one candidate.

**A review knows its own extent.** It is stored under the fingerprint of the
material the reviewer was shown, the pool is chunked deterministically, each
chunk records the ids it was sent, and whole-pool coverage means every expected
id was covered by a chunk that finished. A failed chunk leaves a partial review
that counts itself; a retry buys the missing chunk and nothing else.

**The head of the phrase chooses the catalogue.** Classification folds accents.
"Hotels with rooftop bars" is a list of hotels; "hotel bars" is a list of bars;
"hotels and bars" is not resolved, because guessing one of two subjects hands
half a commission a catalogue written for the other half.

**A Place ID is an identity and a name is not.** A supplied Place ID that
matches nothing means there is no profile yet. The provisional key carries the
district and the qualifier, and is unique only among unanchored rows.

**Stop asking for what the pipeline can derive; change nothing about what is
offered.** The catalogue is spelled out only on the turn that can act on it.
`group` is looked up from the shape; the angle recommendation is composed from
the options the model marked. Every shape stays on the menu.

## What this does not establish

**No claim about discovery quality.** Every case above is mechanical. Nothing
here says a returned place is real, currently open, or worth writing about, and
nothing says the revised angle strategy finds better places. The eight cases in
`evaluation.py` and their criteria are written down in advance;
`scripts/listicle_angle_comparison.py` now produces a dry-run manifest, records
a receipt for every request, and enforces its cap at each dispatch rather than
on the angle count — and it **has not been run**. The paid comparison needs its
own budget authorisation, against that manifest.

**No claim that prompt changes are free.** Removing text from a prompt can
change what a model does, including text that looked redundant. The catalogue
phases and the schema adapter are reversible and their effect on behaviour is
unmeasured; what is measured is input size.

**No claim of exactly-once charging.** Provider receipts say what was sent.
A request whose answer never arrived may still have been processed and billed,
and an interrupted attempt says so rather than showing a tick.

## Consequences

- Conservative grouping shows more rows than before, and splits the overlap of
  a place two searches spelled differently. That is the direction that can be
  recovered from: an operator can say two linked rows are one place, and cannot
  get back a venue that was silently deleted.
- Attempts move to a new table with identities. The old rows stay in place as
  the evidence the migration was faithful; byte-identical evidence under one
  fingerprint and timestamp collapses to one reconstructed execution, and
  everything else stays separate and is labelled reconstructed rather than
  counted as something this pipeline watched happen.
- The profiles' provisional index is replaced. Existing keys are left as they
  were: they are placeholders, they are read only for unanchored rows, and
  rewriting them would move identities under claims already attached to them.
- `cut_checked` is now true only for a review that covered every candidate. A
  run that used to read as checked may now read as partial, which is what it
  was.
- The plan's reproduction harness is adapted where a fix changed the interface
  it calls. The adaptations and their reasons are recorded in the harness
  itself; its claims are untouched.
