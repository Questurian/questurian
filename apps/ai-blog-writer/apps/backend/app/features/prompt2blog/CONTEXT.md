# Context: Prompt2Blog

## Scope

Owns the `/prompt2blog` feature: option and guideline catalogs, structured
source preparation, article generation stages, quality gates, editorial
augmentation, title generation, run recording, and the final Markdown artifact.

Prompt2Blog remains one feature boundary. Its internal modules separate domain
logic, application stages, and infrastructure adapters; they are not separate
bounded contexts.

## Module map

| Area | Owns |
| --- | --- |
| `api/` and `routes.py` | FastAPI handlers and the public router facade |
| `models.py`, `contracts_v3.py` | Versioned HTTP requests, editorial contracts, and runtime pipeline input |
| `config.py`, `options.py`, `editorial_catalog.py` | Feature constants plus legacy and v3 Markdown-backed catalogs |
| `evidence_v3.py`, `instructions_v3.py` | V3 evidence normalization and the layered instruction stack |
| `research_readiness_v3.py`, `intake_v3.py` | The v3 research gate, its `needs_research` result, and v3 run input |
| `stages/v3/`, `prompts/editorial_v3.py`, `content/outline_v3.py` | V3 writing stages, their prompts, and pure section-plan scope guards |
| `content/` | Pure source-text, Markdown, and editorial-block transformations |
| `quality.py` | Deterministic checks, sanitizers, and repair gating |
| `llm.py`, `dependencies.py` | Shared-LLM adapter and explicit dependency bundle |
| `stages/` | One operation per persisted pipeline stage |
| `graph/` | Typed graph state and ordered LangGraph execution |
| `run_recorder.py` | The only adapter that writes lifecycle/status/artifact data |
| `orchestrator.py` | Thin full-run and runtime-run entrypoints |

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

- Public REST paths and request/response shapes are unchanged.
- Persisted stage names are unchanged.
- `run_id`, completed artifact structure, Markdown output, debug trace shape,
  and option-file semantics are unchanged.
- No new canonical top-level `Stage[N]Output` was introduced.
- Quality Gate repair still performs a second audit before finalization.

## Internal graph

The generation graph exposes these first-class nodes:

1. guideline
2. coverage
3. supplement
4. compose
5. quality audit
6. repair
7. editorial augmentation
8. title
9. finalize

The full-run graph prepends source preparation. Individual stages continue to
record their existing `stage_*` payloads through `RunRecorder`.

`RunRecorder` snapshots the token tracker's cumulative totals on `start_stage`
and writes the delta into each stage payload as `stage_usage`, which is also
what feeds the `by_stage` rows of the `run_cost` receipt. Recorders built
without a `usage_reader` -- every test that constructs one directly -- behave
as they did before attribution existed.
