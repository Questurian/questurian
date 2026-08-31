# Prompt2Blog v4: the polish pass

Written 2026-08-31, after the first article the pipeline ever produced
(run `90b3f9bc`, "Lima vs. Cusco", 914 words, ready_for_staging, audit 7).

The machinery works end to end. What follows is about the writing, and about
what the operator is told. Nothing here blocks a run; everything is either a
prompt change riding in a call that already happens, or a number reported after
the fact.

## Phase 1: how the sentences read

### 1a. Sentence rhythm

**The measurement.** 75 sentences, mean 11.3 words, standard deviation 3.9.
Forty three of them (57%) fall between 10 and 14 words. One sentence in the
whole article runs past 25. The airport section holds seven sentences with a
standard deviation of 1.8.

**Cause one: the rhythm rule watches the wrong band.** It reads "if three
sentences in a row are 15-25 words, the next one must be under 8 or over 35."
The article's mean is 11.3 and only ten sentences reach 15, so the trigger
never fires. The rule was written to catch clustering at medium length; this
article clustered short, and the rule does not watch that direction.

The blurb rhythm rule in the same file already has the better shape: "must
contain at least one sentence under 10 words and at least one over 25."

**Cause two: the only escape offered is a short one.** The aside rule says a
comma bracketed aside "gets rewritten as two shorter sentences or dropped."
Subordination is never offered, so the model generalised the one option it was
given into a house style.

**What does NOT change.** The em dash ban and the hyphenated compound ban both
stay exactly as they are. They are a deliberate defence against reading as AI
generated, which is a correct call about how readers judge text in 2026, and
they are not the cause of the flatness. The rule already permits what is
needed: "a comma joins clauses or list items; it does not impersonate a dash."

Proof, rewritten from the article with no dashes and no hyphens:

> Cusco sits at 3,399 meters. Lima averages between 101 and 161, which is the
> difference between arriving and arriving able to do anything, because
> tourists who fly straight to the Andes often meet a pounding headache within
> 6 to 24 hours, followed by nausea, dizziness and fatigue that take up to two
> days of rest and water to clear. You lose the start of your trip to a hotel
> bed.

Five words, fifty five words, thirteen words. Every joint is a subordinator.

**The change.** Two edits to `app/shared/prompts/anti_ai_tells.py`:

- Rewrite the article rhythm trigger to catch clustering at any length, in the
  shape the blurb rule already uses.
- Add subordination as the first escape in the aside rule, ahead of "two
  shorter sentences".

Cost: nothing. Both ride in the compose call that already happens.

**Honest caveat.** Prose style from a prompt is the least predictable thing in
this pipeline. Everything else here is structural and provable; this one is
known only by reading the next article.

### 1b. Report the spread, do not gate on it

Sentence length spread joins the measured constraint checks: sentence count,
mean, standard deviation, the share inside the widest five word band, and the
count over 25 words.

Advisory. It never blocks, in keeping with ADR 0030: once prose exists nothing
gates. If the prompt change works the number moves on its own and the note
stays quiet. If it does not, the note still says where ten minutes of editing
would pay.

## Phase 2: seeing what is happening

Nothing in this phase changes what the pipeline produces. It changes what the
operator can see while it produces it, which cost three false alarms in one
night: research looked hung at seven minutes, the write button looked dead, and
a finished article sat unseen for twenty minutes.

**2a. The write button disables once queued.** It does not today, and every
press starts another complete article generation on the same run. Two graphs
then write over each other's stage rows. This is the smallest item in the plan
and the only one that can currently cost real money by accident.

**2b. The page follows the run.** `GET /intake/{run_id}` is cheap and already
exists; the page polls it while a long request is in flight. The run row
already carries what is needed: `status` (running, completed, failed) and
`stage` (`stage_v3_compose`). The screen prints them.

**2c. Per question progress during research.** Research is ten sequential web
searches and one structuring call. The gather loop writes a progress row as it
goes, so the screen can say "searching 4 of 10" and name the question, instead
of going silent for five to ten minutes.

**2d. A finished state, and the article on screen.** There is no view of a
completed run at all. The run ends, the article exists in the database, and the
page still shows the research screen. This wants: the title, the readiness
stamp, the measured checks including the new sentence spread, and the article
itself, readable.

**2e. Spend, once it is true.** Deliberately last in this phase, because the
number is currently wrong: the grounded search calls are unmetered and the
grill's own call is recorded as `unattributed`. A spend display today would
under report a run by most of its actual cost. Fixing the accounting is a
prerequisite, not a feature, and it also matters because the per run token
ceiling is guarding that same wrong number.

## Phase 3: the title

The title stage never sees the seed. `_title_material` sends the promise, the
spine, the article opening and the headings, and the prompt then says "keep the
original title's intent" about a field v3 supplied as `original_title` and v4
removed. Denied the author's own words, it falls back on search engine
instinct: a colon, keywords, and a comparison the article never makes.

Run 90b3f9bc produced "Lima vs. Cusco: Why a 2-3 Day Stopover Beats a Layover
Before Machu Picchu" from the seed "Lima is no longer simply the stopover
before Cusco". The seed is the better headline: declarative, holds a view, no
colon, true to the piece.

**The decision.** The seed becomes the title, and the operator edits it. The
stage, its model call and its prompt are deleted rather than repaired. Twenty
candidate headlines from a chatbot that has read the finished article beat one
from a stage that never read the brief's author.

Needs a short ADR: ADR 0030 commissioned the title, ADR 0031 made the seed
provenance only. Both are amended by this.

**Attempted 2026-08-31 and backed out. Do not start this without reading the
next paragraph.** The blast radius is not the graph, it is the resume suite.
`TitleFailsLLM` raises on `invoke_text`, and the title stage is the only stage
in the graph that calls `invoke_text` at all -- so it is the only way eight
resume tests can simulate a run dying near the end. Removing the model call
breaks all eight, whether the node is deleted or merely made deterministic.

Those tests protect money: resume exists so a run that dies late is not paid
for twice. Rewriting them means choosing a new "last fallible stage" (the
audit, most likely) and re-deriving what a second leg should re-buy from it.
That is a deliberate change to the safety net, not a mechanical rename, and it
should be made with the owner awake. Two attempts are recorded in this session:
a full deletion touching eleven source files and fifteen tests, and a minimal
version keeping the node and dropping only the model call. Both hit the same
wall.

## Phase 4: the copy out polish prompt

Everything the run already knows about its own output (constraint measurements,
readiness blockers, the audit's named problems, the new sentence spread)
assembled into one prompt the operator copies into a flagship model along with
the finished article.

Not new machinery. The pieces exist and are currently recorded where nobody
reads them.

**It must carry the brief, not only the complaints.** A model told "the
sentences are too uniform" will smooth the prose and may quietly drift the
piece. A model told what the article is for, who reads it, and the `fails_if`
line fixes the flatness while protecting what the article is.

**Two things to settle before building:**

- The generated prompt is not hand edited. Operator influence belongs in a
  control carrying its own validated field, never in typed text, or nothing
  downstream knows what was actually asked for.
- Where the improved article goes has to be decided. Pasted back, the run's
  record stays true. Not pasted back, the published piece and the recorded
  piece diverge, and every diagnosis after that runs against the wrong text.

## Phase 5: where the person comes in

Written 2026-08-31 after run 76b36468, the Medellín piece. The pipeline is
built to be as autonomous as it can be, and this phase is about the places
where that is the wrong goal. Three of them showed up in one run.

The through line: the machine should do what machines are good at -- finding,
checking, structuring, never inventing -- and hand the operator the judgments
only a person can make. An article that had a person at those points reads as
made by a person, because it was.

### 5a. Pin the country, in three places

Run 76b36468 asked for "a community-led project offering guided neighborhood
visits in Buenos Aires" and came back with a garden collective in Puerto
Madero, Argentina. The article is about Medellín, whose Buenos Aires is the
neighbourhood the Ayacucho tram runs through.

The chain:

    grill extracted location:  "Medellín"        (no country)
    brief carries:             "Medellín"
    gather prompt says:        "a travel article about Medellín"
    the question said:         "in Buenos Aires in 2024"
    the search went to:         Argentina

v3 had the operator type a location and the owner always typed "city, country".
v4 replaced that with a field the grill infers from the seed, with no format
rule, and nothing replaced the habit. The location is also only a framing line,
so a place name inside the question outranks it.

Latin America makes this structural rather than unlucky: Buenos Aires, Comuna
13, La Candelaria, San Antonio, Santa Fe and Bolívar all repeat across a dozen
countries.

- **The grill asks for a country.** Its instruction says to set `location` when
  the line names a place clearly enough to act on, and says nothing about
  format. It should ask for city and country.
- **The work order writes unambiguous questions.** It had "Location: Medellín"
  in front of it and still wrote "in Buenos Aires" bare. A place name that
  exists elsewhere gets qualified.
- **The search pins it.** The one that actually holds: everything in this
  question is in `{location}`, and a name that also exists elsewhere is the one
  in `{location}`. Without this a correct location field still loses to a place
  name inside the question, which is exactly what happened.

Prompt only. No extra calls.

### 5b. Omit, as the third thing to do with a blocked question

The gate offers two moves: answer it, or say nobody publishes it. A third is
missing -- drop the question. There is precedent: cutting a load-bearing
question is already permitted at the work order stage, answered once with what
the article can no longer claim, then obeyed.

Not tangled. Dropping a requirement means dropping any claim that served only
it and keeping claims that also served others, which is the same reconciliation
the evidence reader already does.

The cost is stated the same way the work order cut states it, naming the spine
the article will no longer be able to rest on.

### 5c. The liveness check

Research found Moravia Tours, its site, and both founders by name, and every
word was true. What it could not see: last Instagram post 2024, a janky
checkout, tired photos. A business winding down. That is not on a page, it is
the absence of recent activity and the feel of a site, and no amount of better
research closes it.

So before writing, the operator sees only the claims that name somewhere a
reader could actually go. In run 76b36468 that is five claims out of nineteen,
two of them the same operator -- a two minute job, not a chore, because most
claims are facts rather than places.

Each one gets three marks: fine, drop it, or a note in the operator's words
that travels to the writer.

Two things this is not.

**It is not a second gate.** Exactly one gate blocks in this pipeline
(ADR 0030) and that is not being changed. This rides on the screen already
shown before writing, with a "these all look fine" button that clears the whole
list in one click.

**It is not a quality judgment.** Call it liveness. The operator has not taken
these tours either and cannot say whether they are good. They can tell alive
from abandoned, which is exactly what went wrong, and naming it accurately is
what keeps it a two minute job instead of a review of places nobody has been.

Needs one optional field on a claim, tagged by the structure model when a claim
names a bookable or visitable place. No extra call.

## Order, and why

1. **Phase 1** first because it is free, it is small, and the next real article
   cannot be judged until it is in.
2. **Phase 2** next because every remaining item needs the pipeline run again,
   and running it blind is what made tonight exhausting. 2a before anything
   else in the phase; it is ten minutes and it stops an accident.
3. **Phase 3** any time; it is independent.
4. **Phase 4** last; it consumes what phases 1 and 2 produce.

Phases 1 and 2 want one real run between them and phase 3, so the rhythm change
is judged on its own.

**Phase 5 goes before phase 3 and phase 4.** 5a is the only item in the plan
that fixes a wrong fact rather than a rough edge: run 76b36468 answered a
question about the wrong country and that answer was marked `supported`, so
nothing downstream would have caught it. 5b and 5c both unblock work already
paid for. Phases 3 and 4 improve articles that are already correct.

Within phase 5: 5a first, because it is prompt only and stops the next run
inheriting the same fault; then 5b, which is small; then 5c, which needs a
field on the evidence contract.

## Not in this plan, and deliberately

- **Article quality checking by an AI reader.** Deferred on 2026-08-30 and
  still deferred. Mechanics only. Whether the article is good is read by a
  person.
- **The manual research paste path.** Discussed and worth building, but the
  automatic path produced a usable dossier on 2026-08-31 and has not been given
  a fair second run. Revisit after one more.

## Loose ends carried from the same session

- The Claude credential status reads only the database and never checks whether
  the Keychain item still exists. It showed "connected" for two days with no
  secret behind it, and the operator found out at the write step, after paying
  for the grill, the brief, the plan and twenty minutes of web searches.
- Roughly thirty files from 2026-08-30 and 31 are uncommitted, including every
  change that made the pipeline work end to end.
