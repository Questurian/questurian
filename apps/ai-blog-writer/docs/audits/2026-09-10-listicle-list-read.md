# Reading the bars and cevicherias lists against their briefs

2026-09-10. Task 1 of the handoff's next-actions table. **Cost: $0** — every
number here comes from re-analysing the stored replies of the three live runs
already paid for, at no additional spend.

The hotels list had already been read this way. This does the other two, and
because the same analysis runs over all three, the hotels numbers are restated
where they changed.

---

## The short version

The lists are good. The three faults found are not in what the searches
returned — they are in how the pipeline **counts and ranks** what came back.

| # | fault | severity | state |
|---|---|---|---|
| 1 | A name shortened to one word was never flagged as a duplicate | small | **fixed**, this commit |
| 2 | Agreement between angles is understated on exactly the rows the pipeline itself flags | **real** | reported, not built |
| 3 | Every angle returns exactly the number it was asked for, always | **structural** | reported, decision needed |

Fault 3 is the one that matters most, and it lands directly on the deferred
Batch H decision.

---

## What the lists actually contain

Re-pooled with current code. "Distinct venues" resolves each flagged
possible-duplicate cluster by hand into one place.

| case | rows returned | candidate rows | distinct venues | target |
|---|---|---|---|---|
| narrow-bars | 28 | 24 | **16** | 15 |
| narrow-hotels | 36 | 34 | **28** | 20 |
| specialist-restaurants | 36 | 32 | **29** | 20 |

All three clear their target. Every one of the eighteen angles returned rows;
none failed, none retried.

### Bars — 16 distinct venues against a target of 15

Six duplicate clusters, all correctly flagged, plus one that was not
(`Saha` / `SAHA Rooftop` — fault 1, now fixed). `Rooftop La Guardia at Casa
República` came back under **three** spellings from three different angles.

The brief set a hard standard: *an actual roof terrace open to guests*. It is
in the prompt, on every angle. But nothing checks the answers against it, and
**four of the sixteen came back with evidence that does not establish it**:

- `27 Tapas` — "Panoramic views over the ocean and Lima skyline"
- `Celeste Solar Bar` — "Access via reservation for high-level mixology"
- `Muelle 10` — "always lively, with live music"
- `Pisco Bar` — "focus on Peru's most iconic cocktail, the Pisco Sour"

A panoramic view is not a roof terrace; it is also what a top-floor window
sells. Two more are arguable on category rather than evidence: `Mercado 28` is
a food hall with a rooftop, `Barranco Beer Company` is a brewery with one.
Neither is wrong, and neither is a rooftop bar.

This is §7.3 of the handoff — nothing verifies a returned place — showing up
against a brief that had written the check down.

### Cevicherias — 29 distinct venues against a target of 20

The strongest of the three lists. Two clusters flagged (`Chez Wong` under two
different districts, `La Mar`), one missed (`Sonia` / `Cevichería Sonia`,
**in the same district** — fault 1 again, now fixed).

**Angle a6, "ceviche counters inside Lima's markets", is the best angle in any
of the three runs.** Its six rows carry addresses precise enough to check:
*Mercado San José, Puesto 438*; *Mercado Lobatón*; *Puestos 12, 62 y 63,
Mercado de Magdalena*; *Mercado N°1 de Surquillo*. Note that this angle was in
direct tension with a prompt rule — "Not a market, a street or a district; if
the answer is 'the stalls in X market', name the individual stalls or leave it
out" — and the rule worked exactly as written. It named the stalls.

**Angle a4 lost its own discriminating word.** It asked for cevicherias that
"buy direct from **named** local fishermen" and got back `family of fishermen,
fish direct from pier` and `buys direct from artisanal fishermen`. Two rows,
neither naming a fisherman. The word that made the angle specific did not
survive into the evidence, so the angle is indistinguishable from a generic
"buys fresh fish" angle in the record.

One row does not obviously survive the brief's exclusion (*general restaurants
where ceviche is one line on the menu*): `El Mercado`, whose evidence reads
"refined, lunch-only" and says nothing about ceviche at all.

---

## Fault 2 — agreement is understated on the flagged rows

`overlap` is `len(found_by)` **on one candidate row**. The pipeline sorts on it
(`runner.py:583`, `:619`) and the screen prints it as "found by N searches"
(`SearchResults.tsx:276`).

But a flagged duplicate is the pipeline saying *these rows may be one place*.
When it says that, the agreement is split across the rows and the number shown
is smaller than the truth — on precisely the rows the pipeline has singled out.

**Sixteen venues across the three runs are understated.** The worst:

| truly found by | shown as | venue |
|---|---|---|
| 4 angles | 2, 1, 1 | Rooftop La Guardia at Casa República |
| 3 angles | 2, 1 | 27 Tapas (Iberostar Selection Miraflores) |
| 3 angles | 2, 1 | Ambra Rooftop Bar (Pullman Lima Miraflores) |
| 3 angles | 2, 1 | Celeste Solar Bar (Hyatt Centric San Isidro) |
| 3 angles | 2, 1 | La Mar Cebichería |
| 3 angles | 2, 1 | Chez Wong |

In the bars run, **nothing displays above "found by 2 searches"** — so the one
venue four of six angles independently agreed on is invisible as such, sitting
in a tie at the top with three others.

Genuine cross-angle agreement, once clusters are resolved:

| case | venues found by >1 angle | of |
|---|---|---|
| narrow-bars | 7 | 16 |
| narrow-hotels | 7 | 28 |
| specialist-restaurants | 5 | 29 |

**Not fixed, deliberately.** Summing overlap across a cluster would assert the
merge ADR 0037 refuses to assert. The honest version is a second, visibly
provisional number — *this row, or the rows it may duplicate, were found by 4
searches* — ranked on, without merging anything. That is a design decision, not
a bug fix, and it is the operator's.

---

## Fault 3 — `wanted` is a quota, not a floor

Every angle in every run returned **exactly** the number of rows it was asked
for. Eighteen of eighteen.

```
narrow-bars              target= 15   sum(wanted)= 28   rows returned= 28
narrow-hotels            target= 20   sum(wanted)= 36   rows returned= 36
specialist-restaurants   target= 20   sum(wanted)= 36   rows returned= 36
```

`wanted` is not observed. It is arithmetic: `role_allowances(target, roles)` —
the target times `OVERSHOOT = 1.8`, split by role weight and clamped to a role
floor and ceiling. Nothing about the world enters it.

The prompt asks for a floor — *"Find 8. Keep going until you have 8 or have
genuinely run out — listing four when eight exist is the failure mode here"* —
and the model reads it as a ceiling too. Three consequences:

1. **The pipeline never learns whether an angle had more to give.** Angle a4
   was allowed 2 and returned 2. Whether four Lima cevicherias name their
   fishermen, or two, or none and it padded, is not in the record.
2. **`shortfall` cannot report anything.** It is
   `max(0, target - len(candidates))`, and `len(candidates)` is `target × 1.8`
   minus whatever duplicates collapse. All three runs report `shortfall: 0` and
   could not have reported otherwise. It is currently a constant.
3. **It puts a hole in Batch H.** That experiment compares two angle wordings
   on what they discover. Both arms will return `sum(wanted)` rows, because
   every arm always does. Count cannot separate them, so the whole $13 would
   have to be settled on quality judged by hand — which is §6's argument for
   deferring it, now with a mechanism behind it rather than a cost estimate.

**Not fixed.** The cheap probe is one angle asked for a deliberately absurd
number and one asked for none, to find out whether the ask is a ceiling, a
target, or the entire answer. That is roughly **$0.09** — two grounded searches
at the measured $0.045 — and it would tell us more about the discovery layer
than the $13 comparison.

---

## Method

Everything above is reproducible offline from the stored receipts, because the
harness records `provider_calls[].rows_text`.

```bash
cd apps/ai-blog-writer
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=apps/backend:packages/shared/src:packages/utils/src \
  .venv/bin/python - <<'PY'
import json, glob
from app.features.listicle_pipeline.search import parse_rows, pool_sightings, Sighting
for f in sorted(glob.glob('docs/audits/listicle-angle-comparison-*-live-*.json')):
    doc = json.loads(open(f).read())
    s = [Sighting(angle=m['angle'], angle_id=m['angle_id'], name=n, district=d, evidence=e)
         for c in doc['provider_calls'] if c.get('outcome') == 'answered'
         for m in [next(a for a in doc['angles'] if a['angle'] in c['prompt'])]
         for n, d, e in parse_rows(c.get('rows_text', ''))]
    pool = pool_sightings(s)
    print(doc['case'], 'rows', len(s), 'candidates', len(pool),
          'flagged', sum(1 for c in pool if c.possible_duplicates))
PY
```

Re-analysing paid replies is free and it has now found three faults across two
sittings. Keep `rows_text` in the receipt.

---

## What this changes in the plan

The handoff's next-actions table stands, with one addition. Revised:

| # | task | cost |
|---|---|---|
| 1 | ~~Read the bars and cevicherias lists~~ | **done, $0** |
| 1b | **Probe whether `wanted` is a ceiling** (fault 3) | ~$0.09 |
| 2 | Run one live interview | ~$0.15 |
| 3 | One full run end to end | ~$0.30 |
| — | Decide on fault 2 (cluster-level overlap) | $0, a decision |
| 4 | Batch H | ~$13, still deferred — now for a second reason |
