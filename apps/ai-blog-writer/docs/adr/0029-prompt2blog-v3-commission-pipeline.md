# Prompt2Blog v3 runs an approved commission against verified evidence

## Context

ADR 0024 made every Prompt2Blog generation step a first-class LangGraph node.
It did not change what the pipeline was asked to write, and that was the real
defect. One Easy Setup call chose the editorial direction, the article type,
the audience, the requirements and the research prompt at the same time. The
chosen type from a 42-row shared catalog then became structural authority, the
operator's original title never reached the run, coverage found gaps research
had not filled, and a supplement stage generated the missing material because
its prompt simultaneously forbade invention and demanded every hard constraint
be met.

The audited Lima run is the case: a Lima-centred analysis became a three-city
comparison, grounding failed, two repair attempts settled back to a weaker
draft, and the receipt was 312,555 tokens across 24 calls.

## Decision

Prompt2Blog runs on a v3 pipeline whose authority model is explicit.

**The commission is the controlling document.** A human picks one of three
AI-proposed editorial directions, edits it if they want, and approves it. The
approved commission fixes the original title, the location, the article form,
zero to four topic modules, the audience, the primary subject, the scope mode
and every reference's role, the requirements, and the exclusions. It carries a
fingerprint of its own contents.

**Research answers the commission and can never change it.** The research
prompt is generated from the approved commission and locks it as read-only.
The returned evidence package is validated deterministically: sources carry
publisher, URL and dates; claims map to sources and requirements in both
directions; every commission requirement appears exactly once. Evidence is
stored against the fingerprint it was researched for and dropped the moment the
commission changes.

**Insufficient research stops the run instead of starting one.**
`POST /pipeline-v3` runs a deterministic readiness gate before queueing
anything and returns `needs_research` on a 200 with the findings, the open
requirements, the unresolved conflicts, the unmet source gates, and a follow-up
research prompt that closes exactly those. It is a product state, not a
failure: nothing is queued and no writer-model token is spent reaching it.

**There is no supplemental-fact generation stage.** v3 writes from the evidence
it was given or it does not write.

The persisted v3 stage contract, versioning ADR 0024's rather than reusing it:

| Stage | Records |
| --- | --- |
| `pipeline_input_v3` | The versioned run input: fingerprint, form, modules, audience, scope mode, requirement ids, precedence, evidence receipt, profiles, routing |
| `stage_v3_outline` | The section plan and any requirement it could not support |
| `stage_v3_compose` | The draft and its alignment summary |
| `stage_v3_groundedness` | Every claim checked against the exact evidence records |
| `stage_v3_quality_audit` | Commission fidelity, informativeness, originality, brief adherence, SEO |
| `stage_v3_repair` | A repaired draft, forbidden from adding facts or widening scope |
| `stage_v3_quality_settle` | The best-scoring draft of the attempts |
| `stage_v3_title` | The headline, generated against the original title and the commission |
| `stage_v3_finalize` | `pipeline_v3`: the commission, form, instruction meta, evidence receipt, quality review and run cost |

Grounding sits inside the repair loop, so a repaired draft is re-checked
against the evidence rather than trusted.

The 15 article forms, 10 topic modules, audience tags and house/headline rules
are file-backed with stable string ids, owned by Prompt2Blog. The shared
42-row `article_types` table keeps every row and id for URL2Blog and
YouTube2Blog.

## Consequences

- The article's subject, shape and scope are decided once, by a person, before
  any money is spent on research or writing.
- A run that cannot be supported costs nothing rather than costing a repair
  loop.
- A finished run can be audited from its artifact alone: the commission it
  answers and the evidence it used are both in `pipeline_v3`.
- Two pipelines exist. `pipeline_v2` artifacts stay readable and stageable
  forever, and `POST /run` and `POST /pipeline-v2` remain until the owner's
  controlled real run proves v3 end to end.
- `enable_editorial_augmentation` is refused with a 400 on v3 rather than
  accepted and ignored. It rewrites audited prose and has not been re-verified
  against the evidence model.
- The `reported-people-scenes-quotations` source gate is implemented in both
  TypeScript and Python on purpose — one runs before research is commissioned,
  the other decides whether a run may start. They must not drift.
