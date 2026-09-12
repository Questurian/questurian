# The first live interview, and the first full run

2026-09-10, run `abb7004b`. **Spend: about $0.50** — 4 grounded searches on
probes, 1 grounded seed lookup, 3 interview turns, 5 grounded searches on the
run itself.

This closes items 1b, 2 and 3 of the handoff's next-actions table. Batch H is
cancelled, by the operator, on the reasoning in §6 of the handoff plus the
mechanism found in the list read: both arms return `sum(wanted)` rows, so
count cannot separate them.

---

## The headline

**The interview works, and the run it produced found 25 distinct venues
against a target of 15 — where the previous hand-driven run found 16.**

| | hand-written angles, 2026-09-10 | model-written angles, this run |
|---|---|---|
| searches | 6 | 5 |
| rows | 28 | 38 |
| **distinct venues** | **16** | **25** |
| flagged rows | 15 of 24 | 22 of 38 |
| false flags | 0 | 0 |

The gain is the broad-angle floor going 6 → 12. The extra rows are real places,
not padding: nine clusters, every one a genuine same-venue cluster, and not a
single false flag in either run.

---

## What ran, in order

`start` → seed lookup, live and grounded. It reported Lima has "at least 44
notable rooftop bars", which is the check the `count` marker is supposed to
make and it made it.

Turn 1 asked the bar. Answered as a statement, in the operator's voice:

> It has to have a real open-air roof terrace that any member of the public can
> walk up to and drink on. A top-floor room with big windows and a view does
> not count, and neither does a restaurant that happens to be upstairs. If the
> bar is inside a hotel it still counts, but only if you can get in without
> being a guest.

**The interview split that one answer into `bar` and `cut` by itself**, and
correctly — the "does not count" half became the cut. That is the marker
machinery working as designed on a real answer.

Turn 2 asked the angles and offered a 22-option menu. Turn 3 asked the count,
which it had already settled twice — a bug, now fixed (see below). Then it
agreed, and the order passed its conflict check against the cut.

---

## Fault found and fixed: a forgotten marker became an unasked question

`count` was covered on turn 1 and turn 2, and left out of turn 3's
`markers_covered`. The list is authoritative-replace, so the marker un-covered
itself and the interview went back to ask whether 15 meant 15 — after it had
built the whole search order on that number.

Markers reached by being *asked* about were already permanent. Markers claimed
without asking were not, and the prompt actively encourages claiming without
asking. So the cheaper road to a settled marker was the only one you could fall
off.

Covered is sticky now, and reopening — the single exit from every dead end —
clears `markers_covered` explicitly instead of relying on a model to shorten a
list. Six tests said reopening must still un-cover; they were right, and they
pass.

---

## The angles the model wrote, read against its own prompt

This was the point of the exercise, and it is the weakest part of the run.

Its five picks:

```
[broad      ] setting          Rooftop bars Lima with panoramic ocean views
[broad      ] district         Rooftop bars Miraflores Barranco Lima
[distinctive] drink-specialty  Rooftop bars Lima known for Pisco cocktails and innovative mixology
[broad      ] the-experience   Rooftop bars Lima with vibrant atmosphere, DJs, or live music
[broad      ] luxury           Luxury and chic rooftop bars Lima high-end sophisticated
```

Five rules from its own prompt, broken:

1. **"Two or three `broad` ones at most."** It picked four of five.
2. **"No 'AND'. No quality clause."** "Pisco cocktails **and** innovative
   mixology". "**Luxury and** chic … high-end sophisticated" — four words for
   one idea. "vibrant atmosphere, DJs, **or** live music" — three alternatives.
3. **"Up to four angles the catalogue has no shape for."** It wrote **zero**.
   Every one of the 22 options came off the catalogue, so the part of the menu
   meant to carry local knowledge — the prompt's own example is ceviche by the
   fishing landings — was empty.
4. **"Write it as a search, not a label … a plain description."**
   "Rooftop bars Miraflores Barranco Lima" is a keyword string with no verb.
5. **"'Hidden gem' is a label."** Named in the prompt as the counter-example.
   The menu contains "Hidden gem rooftop bars Lima local recommendations".

### What the bad wording actually cost

Not a guess — the run's own contribution table:

```
rows shared ONLY  role         angle
  12      3    9  broad        panoramic ocean views
  12      2   10  broad        Miraflores Barranco Lima
   4      4    0  distinctive  Pisco cocktails AND innovative mixology
  12      8    4  broad        vibrant atmosphere, DJs, or live music
  12      7    5  broad        Luxury and chic … high-end sophisticated
```

**The one angle carrying an "AND" returned zero exclusive places.** All four of
its rows had already been found by other searches. A whole grounded search,
about 4.5 cents, bought nothing — which is exactly the failure its prompt
predicts for a volunteered extra condition. The hand-written version of the
same shape, "rooftop bars in Lima built around pisco", found Pisco Bar and SAHA
exclusively.

**No validator is proposed.** The operator picks from the menu on screen, and a
badly worded angle is visible and editable before a penny is spent. The menu is
the check. What this says is that the picks arrive needing edits, not that the
pipeline needs another rule engine.

---

## The interaction the floor change created

Four broad angles at 12 each gives a planned capacity of **52 against a target
of 15** — 3.5×, where the intended overshoot is 1.8×. Raising the broad floor
made correct role labelling load-bearing, and the model over-labels broad.

It is left as it is, deliberately. 52 planned rows produced 38 actual rows and
25 distinct venues, and a list of 15 chosen from 25 is a better list than 15
chosen from 16. The cost is a longer list to read, and it is visible: the order
screen prints "planned capacity: 52 vs target 15" before anything is bought.

Revisit it if a run ever comes back with six broad angles.

---

## Identity: the fix worked, and a third spelling appeared

`Saha` / `SAHA Rooftop` was flagged — first time in a live run, and the reason
the containment floor came down this morning.

A spelling this pipeline had not seen before turned up: **the qualifier written
in prose rather than in brackets.** One bar arrives three ways:

```
Insumo Rooftop
Insumo Rooftop (AC Hotel by Marriott Lima Miraflores)
Insumo Rooftop at AC Hotel Lima Miraflores
```

The prompt asks for brackets. The model wrote "at". Containment linking caught
all three, so nothing was lost and nothing was merged — but it is why 22 of 38
rows carry a flag. Every one of those flags is true; there are no false
positives. That is a different situation from the 17-of-34 case the handoff
called a fault, where the flags were wrong.

Worth watching, not worth fixing yet: two different hotels were claimed for one
bar — `27 Tapas (Souma Hotel Lima)` and `27 Tapas at Iberostar Selection
Miraflores`. The earlier paid run said Iberostar consistently. One search is
wrong about the building, and the pipeline correctly refuses to decide which.

---

## Measured prices, for the next budget conversation

| thing | price |
|---|---|
| one grounded search | ~$0.045 |
| a full interview (seed lookup + 3 turns) | ~$0.06 |
| one complete run, 5 searches | ~$0.29 |
| this whole session | ~$0.50 |

---

## What is still not built

Unchanged from the handoff, minus what this closed:

1. **Nothing verifies a place is real or still open.** The cut check reads what
   the search said; it does not look the place up. `gate.assess` exists,
   answers a different question, and is not wired. This is now the largest gap.
2. **No article is written from any of this.** The pipeline ends at a pool.
3. Cluster-level overlap (fault 2 of the list read) is still a decision waiting
   on the operator, not a bug waiting on a fix.
