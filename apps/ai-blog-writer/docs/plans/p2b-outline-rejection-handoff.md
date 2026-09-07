# Handoff: the outline is rejected and the article is written blind

## Resolution — 2026-09-06

Fixed locally; original investigation follows below as historical evidence.

- Root cause: lexical identity was mistaken for editorial coverage. The full
  airport name was required even when the complete short name appeared.
  `_names_subject` is not a safe substitute: it accepts the word **El**.
- Coverage now allows conservative descriptive suffix removal (`International
  Airport`, `Airport`, `cuisine`), retaining the entire remaining name.
  El Dorado passes; El Centro, Dorado alone, and International Airport alone
  do not. This is a bounded lexical check, not general entity resolution.
- Genuine invalid plans still degrade under the existing nonblocking policy.
  Passing every rejected plan through, or adding the subject to a heading,
  would conceal real drift. Both result screens now disclose when the writer
  had to structure the article without a usable section plan. Saving remains
  available. The stage also stores `candidate_outline` before fallback so the
  rejected sections remain directly inspectable.
- All five mystery records are v3-era runs (`pipeline_input_v3.schema_version`
  is 3). Their raw responses contain plans; their stored empty outlines are
  the old rejection output. Four geographic subjects pass the current matcher.
  `16872313` instead uses “The current shift underway in Lima's dining scene”
  as its primary subject and still fails. No legacy runtime path was restored.
- Read-only SQLite backup replay: all 26 previously accepted outlines pass;
  both Bogotá candidates pass with six sections; `a3c20e41` remains rejected.
  Historical work orders came from stored commission/result data or the
  recorded prompt for interrupted runs. Claim IDs were reconstructed from
  each plan for this scope replay; this does not independently re-audit the
  old evidence packets.
- Fixture-based regression tests replay the three real candidates through
  the outline stage using a fake LLM, without making paid model calls.
  Validation: 79 backend tests, 46 frontend tests, frontend TypeScript check.

## Original handoff

Written 2026-09-06 for whoever picks this up. Everything below is measured
against the stored runs in `apps/ai-blog-writer/data/pipeline.db`, not
reasoned about. **Nothing here is fixed.** One likely cause is identified and
one candidate fix is proposed and deliberately not applied — see "Why I did
not just fix it".

---

## The symptom

Prompt2Blog plans an article before writing it. The outline stage produces
sections, each with a heading, a purpose, a word budget and the claims that
belong in it. That plan is then validated. **If validation fails, the entire
section plan is discarded and the article is written with no plan at all.**

The discard is total and silent to the operator. From
`content/outline_v3.py:284`:

```python
def outline_focus_only(outline: dict[str, Any]) -> dict[str, Any]:
    return {
        "working_title": _safe_str(outline.get("working_title")),
        "direct_answer_focus": _safe_str(outline.get("direct_answer_focus")),
        "sections": [],                      # <- the plan is gone
        "takeaway_focus": _safe_str(outline.get("takeaway_focus")),
        "brief_alignment": "Brief alignment not stated.",
        "unsupported_requirements": [],
    }
```

Compose then receives a working title, a one-line answer focus and a one-line
takeaway focus, and writes ~900 words of structured article from that. It
carries `outline_accepted: False` into its trace, so the state is recorded —
but nothing acts on it and nothing tells the operator.

The articles have come out well-organised anyway. That is the model writing
well unaided; nothing planned it.

## How often

All 35 stored outline stages:

| | count |
|---|---:|
| accepted | 26 |
| **rejected** | **9** |

Of the 9 rejections, the failing check was:

| check | rejections |
|---|---:|
| `covers_primary_subject` | **7** |
| `no_context_only_sections` | 2 |

So one check causes three quarters of them.

## What `covers_primary_subject` does

`content/outline_v3.py:205`:

```python
subject_fields = [
    _safe_str(outline.get("working_title")),
    _safe_str(outline.get("direct_answer_focus")),
    _safe_str(outline.get("takeaway_focus")),
    _safe_str(outline.get("brief_alignment")),
    *(value for section in sections
      for value in (section["heading"], section["purpose"])),
]
covers_primary_subject = not primary_subject or any(
    _mentions(value, primary_subject) for value in subject_fields
)
```

`_mentions` (line 61) normalises accents and case, then requires a
**whole-phrase** match. Its one concession is geographic: it also tries the
text before the first comma, so a work order storing `"Medellín, Colombia"`
matches a heading saying `"Medellín"`.

## The reproducible cause

Two runs fail this for a reason I can demonstrate. Both are the Bogotá airport
piece — the stored run `e23257c0` and my re-run `bogota-replan-0906`.

The work order's `primary_subject` is:

    'El Dorado International Airport'

The outline's own working title is:

    'Sorting Your Ride From El Dorado Before You Land'   (bogota-replan-0906)
    'What to Book Before You Land at El Dorado'          (e23257c0)

The outline plainly names the subject. It is rejected because:

- `_mentions` requires the full four-word phrase `El Dorado International Airport`
- the comma shorthand does not apply — **there is no comma in the subject**, so
  `name.split(",")[0]` returns the whole string again and the two candidates
  are identical
- no field in either outline contains the full phrase. Verified:

```
fields containing the FULL phrase (_mentions): 0
fields _names_subject would accept          : 1
fields saying "El Dorado" but not the full phrase:
  - Sorting Your Ride From El Dorado Before You Land
```

So a correct plan is thrown away over a two-word abbreviation that any reader
would accept.

## The candidate fix, and why it is not obvious

The same file already contains a helper for exactly this problem —
`_names_subject` at line 87 — written for a different check:

```python
def _names_subject(heading: str, primary_subject: str) -> bool:
    """Whether a heading names the article's own subject.

    `_mentions` wants the whole phrase ... A subject that is not a place does
    not decompose that way: `primary_subject` was "Chifa cuisine" and every
    heading said "Chifa", so nothing matched and headings that plainly named
    the subject read as drift.

    So the leading word counts too. "Chifa cuisine" is named by "Chifa";
    "The Malecon" by "Malecon". An article is a poor fit for this check if its
    subject's first word is a bare category noun, which is why it is only ever
    used to *permit* a heading, never to condemn one.
    """
```

Its docstring describes this failure class precisely. It is used by
`no_context_only_sections` and **not** by `covers_primary_subject`.

Swapping `_mentions` for `_names_subject` in `covers_primary_subject` makes
both reproducible cases pass. Verified against the stored outlines:

```
e23257c0  subject='El Dorado International Airport'  _names_subject accepts: True
bogota-r  subject='El Dorado International Airport'  _names_subject accepts: True
```

**Do not apply that blindly.** Three reasons to think first:

1. `_names_subject` matches on the subject's **first word**. For
   `El Dorado International Airport` the first word is `El` — the Spanish
   definite article. `_SUBJECT_LEAD_SKIP` only skips English `the/a/an`. So it
   probably passes on the *second* word, but confirm which word is actually
   matching before trusting it; passing for the wrong reason is not passing.
2. The helper's own docstring says it is "only ever used to *permit* a
   heading, never to condemn one" — i.e. it was written to be deliberately
   loose in a context where looseness is safe. `covers_primary_subject` is a
   check that *condemns*, and loosening it weakens the drift detection it
   exists for. Establish what genuine drift looks like and confirm it still
   fails.
3. It fixes the matcher, not the discard. See "The bigger question".

## The other five rejections

Five of the seven `covers_primary_subject` failures are runs with **no
`stage_v4_work_order` row and an empty outline** (`working_title == ''`):

    16872313, 835e8a30, a106967c, 81b36191, 79e60885

I do not know what these are. They may be v3-era runs, runs whose work order
was deleted, or runs where the outline call failed and produced nothing.
`covers_primary_subject` returns `True` when `primary_subject` is empty, so the
subject was non-empty when they ran. **Do not assume the fix above covers
them — establish what they are first.** They may be a second, unrelated fault.

## The bigger question

Even with a perfect matcher, the design is worth challenging:

**Should a failed check delete the whole plan?**

Six sections were planned. One check failed, and it was a check about whether
the *subject was named* — not about whether the sections were any good. The
other five checks all passed:

```json
{"enough_sections": true, "headings_unique": true, "within_word_budget": true,
 "claims_resolve": true, "no_context_only_sections": true,
 "covers_primary_subject": false, "section_count": 6,
 "planned_word_count": 735, "target_word_count": 900}
```

The pipeline has a well-established pattern for this — degrade rather than
fail — and `no_context_only_sections` already follows it: it drops the
offending sections and keeps the rest (`drop_context_only_sections`).
`covers_primary_subject` has no equivalent. A heading that does not name the
subject could be *repaired* (rewrite that heading) or the check could be
*advisory* (record it, write anyway) rather than fatal.

There is also no operator surface. A run whose plan was discarded looks
identical to one whose plan was used. The only trace is `accepted: false` in
the stage record and a `logger.warning`.

## How to verify any change

Do not trust a synthetic fixture — replay real runs.

```bash
# from apps/ai-blog-writer
PYTHONPATH="apps/backend:packages/shared/src:packages/utils/src" .venv/bin/python
```

Copy `data/pipeline.db` before reading it. The stage row is double-wrapped:
`json.loads(row.data)` gives `{created_at, data}`, and the outline is at
`["data"]["outline"]`, the check results at `["data"]["checks"]`.

A change is good if:

- **all 26 currently-accepted outlines still pass** — this is the regression
  that matters, and it is cheap to run over the stored DB
- `e23257c0` and `bogota-replan-0906` flip to accepted
- a deliberately drifting outline still fails. Run `a3c20e41` is the recorded
  case of genuine drift: its work order set `primary_subject` to `"Lima, Peru"`
  for an article about the Malecón, every district was filed `context_only`,
  and all three sections were rejected. That run is a *work order* fault, not a
  matcher fault — it is the case that must keep failing.

## What this is not

This is not caused by the research-scope change merged in #546. The check
predates it and the two Bogotá runs — one before that change, one after —
fail identically.

It is also already known: `p2b-research-scope-handoff.md` lists
`covers_primary_subject` under "Open issues not being fixed here", with the
note that the owner has deprioritised it and a suggested fix of accepting the
brief's `location` as well as the primary subject. That suggestion is a third
option worth weighing against the two above — though note it would not have
helped either Bogotá run, whose `location` is `Bogotá, Colombia` and whose
outlines do not say "Bogotá" in the fields checked either.
