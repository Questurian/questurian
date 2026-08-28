# Context: Prompt2Blog

## Scope

Owns the `/prompt2blog` feature: option and editorial catalogs, the research
gate, article generation stages, quality gates, title generation, run
recording, and the final Markdown artifact.

Prompt2Blog remains one feature boundary. Its internal modules separate domain
logic, application stages, and infrastructure adapters; they are not separate
bounded contexts.

## Two pipelines, one default

**v3 is the pipeline.** The frontend submits only `POST /pipeline-v3`, with an
approved commission and a verified evidence package. Everything about the v3
path is described in ADR 0029.

**v2 is a fallback, not a product surface.** `POST /run` and
`POST /pipeline-v2` still work and the v2 engine is intact, but nothing in the
UI calls them. They stay until the owner's controlled real run proves v3 end to
end; until that gate passes, v2 is the only working way to produce an article
if v3 turns out to be wrong. Retiring them belongs after that run, not before.

Both artifact keys are read forever: a finished run records exactly one of
`pipeline_v2` or `pipeline_v3`, and old result pages must keep opening.

## The shared 42-type catalog is not ours

The `article_types` SQLite table, its routes, its guideline Markdown, and its
seeding scripts belong to URL2Blog and YouTube2Blog as much as to Prompt2Blog.
The v3 redesign removed Prompt2Blog's *dependency* on them; it deleted nothing
from the shared catalog and repurposed no row IDs. `options.py` still reads
them for the v2 fallback. Do not delete or renumber them.

## Module map

| Area | Owns |
| --- | --- |
| `api/` and `routes.py` | FastAPI handlers and the public router facade |
| `models.py`, `contracts_v3.py` | Versioned HTTP requests, editorial contracts, and runtime pipeline input |
| `config.py`, `options.py`, `editorial_catalog.py` | Feature constants plus legacy and v3 Markdown-backed catalogs |
| `evidence_v3.py`, `instructions_v3.py` | V3 evidence normalization and the layered instruction stack |
| `research_readiness_v3.py`, `intake_v3.py` | The v3 research gate, its `needs_research` result, and v3 run input |
| `stages/v3/`, `prompts/editorial_v3.py`, `content/outline_v3.py` | V3 writing stages, their prompts, and pure section-plan scope guards |
| `orchestrator_v3.py`, `graph/topology_v3.py` | The v3 run entrypoints and its shorter generation topology |
| `resume_v3.py` | The state snapshot a failed v3 run is picked back up from |
| `content/` | Pure source-text, Markdown, and editorial-block transformations |
| `quality.py` | Deterministic checks, sanitizers, and repair gating |
| `llm.py`, `dependencies.py` | Shared-LLM adapter and explicit dependency bundle |
| `stages/` | One operation per persisted v2 pipeline stage |
| `graph/` | Typed graph state and ordered LangGraph execution |
| `run_recorder.py` | The only adapter that writes lifecycle/status/artifact data |
| `orchestrator.py` | Thin v2 full-run and runtime-run entrypoints |

## Dependency direction

```text
API → orchestrator → graph → stages → content / quality
                                  ↘ LLM dependency
                                  ↘ RunRecorder
```

- `content/` and `quality.py` must not import FastAPI, LangGraph, `app.core`
  persistence, or provider clients.
- Stage functions receive `PipelineDependencies`; tests inject fakes through
  that contract rather than monkeypatching the route module.
- Only `llm.py` imports the shared LLM client.
- Only `run_recorder.py` writes statuses, stage results, or artifacts.

## Preserved contracts

- Every v2 REST path, request shape and persisted stage name is unchanged.
  `POST /pipeline-v3` was added; `POST /pipeline-v3/intake` was added and then
  removed once the run route made it redundant, and it never had a caller.
- `run_id`, completed artifact structure, Markdown output, debug trace shape,
  and option-file semantics are unchanged.
- No new canonical top-level `Stage[N]Output` was introduced.
- Quality Gate repair still performs a second audit before finalization.
- The `reported-people-scenes-quotations` source gate is implemented twice on
  purpose — TypeScript in `composer/evidence-import.ts`, Python in
  `research_readiness_v3.py`. One runs before the user spends money on
  research, the other decides whether a run may start. They must not drift.
- Readiness findings are derived, never stored. The composer keeps only the
  evidence package and recomputes.
- A requirement has four verdicts, and only two of them are work: `supported`
  and `unpublished` are settled, `partial` and `missing` are open.
  `unpublished` exists because a fact nobody has ever published had no way to be
  reported — the desk could only say `partial`, which blocked, which sent the
  operator back to ask again for the same answer at full package cost. The
  writer is told to write around it and never to mention the absence: prose
  explaining what could not be found reads like a database, not an article. It
  is not
  a way past the gate: it needs a `gap` naming the authorities, documents and
  dates checked, and a package with no `supported` requirement at all is still
  `needs_research` (`nothing_answered`), because an article with no findable
  facts has nothing to write from.

## Internal graphs

The v3 generation graph, which every real run uses:

1. outline
2. compose
3. groundedness
4. quality audit
5. repair
6. quality settle
7. title
8. finalize

The repair loop buys **one** automatic attempt, and only while the run can
afford it. A repair pass is a whole chain -- full-article rewrite on the
writing model, anti-AI enforcement, grounding re-check, re-audit -- which cost
85,012 tokens (35% of the run) on the measured Lima article. `decide_repair`
in `policies.py` refuses an attempt for one of three reasons and records which:
the draft passed, the single attempt is used up, or the next attempt would
carry the run past `P2B_RUN_TOKEN_BUDGET`. A draft that is still weak comes
back `needs_revision` for a human rather than buying another rewrite. The
decision travels on the run: stage rows, the settle payload, and
`quality_review.repair_decision` in the finished article, so an operator can
tell a draft the auditor failed from one the pipeline stopped paying for.

It is shorter than v2 by design. There is no guideline fetch, no coverage
check, and no supplement node: research readiness is settled before a run
starts, and v3 never generates a fact it did not receive. Grounding sits inside
the repair loop, so a repaired draft is re-checked against the evidence rather
than trusted. Stage payloads persist as `stage_v3_*`.

## Resuming a failed run

A v3 run can spend most of its tokens before the last stage, so a failure near
the end used to throw away an outline, a draft, a grounding verdict and an
audit that were all still correct. Every completed node now writes the whole
graph state to the run's own `resume_snapshot` stage row, and
`resume_pipeline_v3` restores it and re-enters the same graph at the node the
failure interrupted. `POST /prompt2blog/resume/{run_id}` starts that;
`GET` the same path answers what it would do, for free, before anything is
spent.

The run keeps its `run_id`. The article, the stage rows, the token ledger and
any link the operator already has therefore all stay pointed at one run, and
the client keeps polling the status it was already polling.

Deliberate decisions worth not re-litigating:

- **Not LangGraph's checkpoints.** They exist and are already discarded on the
  way out of every run. They are shared, opaque, run-sized, and empty in the
  case that matters most -- a process that died hard never ran the cleanup
  either. The stage row is this run's own durable record and can be read.
- **The resumed leg runs on its own LangGraph thread id.** A crashed process
  leaves its checkpoints on disk; re-entering under the same thread id would
  replay that stale snapshot instead of the state we restored.
- **Correctness before saving money.** An unreadable snapshot, one written by a
  different `RESUME_SNAPSHOT_VERSION`, one whose recorded commissions disagree,
  or a run that is not actually failed, all refuse -- and a refusal costs
  nothing, because starting a fresh run is what happens today anyway.
- **The token ledger carries forward.** A resumed leg starting from zero would
  report the cheap tail as the cost of the article and would hand the repair
  gate a budget the run had already spent.
- **The allowance is counted from the attempt history, not the snapshot.** A
  resume that dies before finishing a node writes no new snapshot, so counting
  there would leave the allowance untouched by exactly the failure it bounds.
- **`finalize` writes no snapshot, and success deletes the row.** A finished
  run has an article instead, and the state is whole-graph sized.

Editorial augmentation has no v3 node. `POST /pipeline-v3` refuses
`enable_editorial_augmentation` with a 400 rather than accepting the flag and
ignoring it: augmentation is a full-article rewrite of already-audited prose
and has not been re-verified against the evidence model. Re-enabling it means
wiring `stages/augmentation.py` plus a v3 re-grounding pass into
`graph/topology_v3.py` — the reason v2 has `final_verify` at all.

The v2 generation graph, kept for the fallback described above:

1. guideline
2. coverage
3. supplement
4. compose
5. quality audit
6. repair
7. editorial augmentation
8. title
9. finalize

The v2 full-run graph prepends source preparation. Individual stages continue
to record their existing `stage_*` payloads through `RunRecorder`.

`RunRecorder` snapshots the token tracker's cumulative totals on `start_stage`
and writes the delta into each stage payload as `stage_usage`, which is also
what feeds the `by_stage` rows of the `run_cost` receipt. Recorders built
without a `usage_reader` -- every test that constructs one directly -- behave
as they did before attribution existed.
