# Prompt2Blog v4 replaces the commission form with an interview

## Context

ADR 0029 made the commission the controlling document and put a human in front
of it: three AI-proposed directions, pick one, edit it, approve. The failure
that followed is not that the human was absent. It is what they were asked to
do. Choosing between three directions a model wrote from one typed line is a
choice between lookalikes, and nothing in the flow ever asked what the article
was for.

The audited Lima run passed every measure the system owns — grounding clean,
audit scores of 8 and 9 throughout — and was unreadable. Its outline built the
shape the `analysis` form offers straight off the menu: claim under test,
evidence for, evidence against, judgment and limits. It shipped with a section
called Scope limits and a sentence beginning "the figures come from 5,268
tourists surveyed", about one of the great food cities on earth, containing no
food. The form had been selected by a model reading a title. `analysis` has
been selected three times and produced three failures.

Two jobs were being done and only one was ever written down: establishing what
is true, and making something worth reading. The rigour behind the first is the
best thing in the system. The second had no object, no stage and no measure.

The people using this are travellers, creators and researchers writing about
places they may never have been. A form is a literacy test: it only works if
you already know what belongs in each field.

## Decision

Prompt2Blog runs on a v4 pipeline. `schema_version` is 4, the v3 request
contract is not extended, and no v3 or v2 path survives (ADR 0031).

**An interview replaces the form.** Before asking anything the grill researches
the seed, so it never asks what it could look up. Every question carries a
recommended answer, so nobody faces a blank; one question at a time, each shaped
by the last; it pushes back when an answer contradicts the seed or an earlier
answer; and it stops at agreement rather than at a question count. The three
direction cards are removed: direction is settled by the interview, so variants
would differ only in trivia.

**The Article Brief is the vision and is never consumed.** It carries the seed
(kept as provenance, no longer binding), the reader outcome, the form, the
reader, the spine, what the piece must name, the material by kind, and the one
line saying what failure looks like. Spine, must-name and fails-if are new;
nothing in v3 holds them. The brief rides the whole run and the finished article
is judged against it, including against its fails-if line — the measure the
system never had.

**The work order is the brief's translation, not a second brief.** The direction
step keeps its real job — turning "the market food beats the famous restaurants"
into separately checkable questions — and loses the job of inventing the
article. Eight fields move out to the brief; four stay: premises, requirements,
scope, fingerprint. Requirements are split into load-bearing and texture, which
v3 cannot tell apart and blocks on equally. `exclusions` is removed: a negative
instruction is a topic waiting to happen, and "do not claim a transformation"
became a section called Scope limits.

**The operator cuts the work order, and is told what it costs.** Six research
questions in plain English; strike two, add one. Cutting a load-bearing question
is permitted and is answered once, plainly, with what the article can no longer
claim. It is a real decision, so it is allowed to be wrong.

**First-hand material is recorded verbatim.** Material the operator supplies
from their own experience enters the record as their exact words, never a
model's paraphrase, and is visible in the brief they approve. First-hand
material is excused from fact-checking by design, so a paraphrase would create
an unverifiable claim that nothing downstream can catch.

**One gate blocks, before writing. Nothing blocks after.** Research that cannot
support the piece — including a dossier containing nothing a reader would enjoy,
which is a real gap and reported as one — stops the run and returns the
operator to the grill. Once prose exists the `ready_for_staging` /
`needs_revision` stamp is advisory and never blocks: a run stamped
`needs_revision` for being forty-one words long is savable in one click, and
failures are worth keeping because that is how the next failure gets diagnosed.

**The grill is the single exit from every dead end.** A refuted premise, a thin
dossier, or a brief the operator no longer wants all return to the same place,
carrying what was learned. Re-entering revises the brief on the same run and
discards whatever downstream work depended on what changed — usually the
research, because changing the spine means the old research answered the old
questions. The brief is not hand-editable: a typed brief is untracked text
injected into every stage downstream.

**Length stops gating.** A 4% overage is not a failure an editor would
recognise. A large miss is reported as the symptom it is — thin research
against the target — and a truncated response is distinguished from a short
article, because output is capped and a cut-off response is a transport failure.

**Repair is scoped to the section the audit named.** v3 regenerated all 1,041
words to trim forty, at 47 cents and nearly half the run. The outline already
defines the sections.

The article graph is unchanged: outline, compose, groundedness, quality audit,
repair, quality settle, title, finalize.

## Consequences

- The question that decides everything — what is this article for — is asked in
  plain English and answered by a person in seconds, instead of being inferred
  silently by a model from one typed line.
- The system gains a measure of whether an article is any good. It had none.
- `analysis` is rewritten as travel journalism with a thesis rather than
  dropped, and becomes reachable only through the grill's own question about
  whether the operator wants to make a case. A model reading a title can no
  longer select it, which is the only way it was ever selected.
- The blanket ban on hyphenated compounds stays strict on purpose. It produces
  broken English — "day by day itinerary" — and that is now a forcing function:
  a missing hyphen is a visible signal that no human has read the piece yet. It
  depends on every article being read before it goes anywhere, so this decision
  and the advisory stamp hold each other up.
- The anti-AI block runs once, at compose, and the separate enforcement pass is
  dropped for Prompt2Blog only (ADR 0032). Prevention beats surgery: a model
  that understands the sentence avoids the pattern while writing it.
- Cutting a load-bearing research question can produce a worse article on
  purpose. That is accepted; the alternative makes the cut meaningless.
- Runs will exist that never reach an article. A run is now something the
  operator started, not something that was written (ADR 0031).
