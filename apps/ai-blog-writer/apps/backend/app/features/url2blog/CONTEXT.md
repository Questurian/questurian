# Context: URL2Blog feature

## Scope

Owns the `/url2blog` pipeline: turn a source URL or pasted text into a
publish-ready rewritten article. It exposes the REST surface (status, results,
articles, options, and the `pipeline-v2` entrypoint) and runs the staged
LangGraph workflow.

## Out of scope

- Run lifecycle storage primitives → `app.core` (`write_status`, `read_output`,
  and related functions).
- Vertex client and grounding → `packages/utils` (`get_vertex_llm`,
  `invoke_google_grounded_text`).
- Completed-article persistence and sync bookkeeping → `storage.py`.

## Module map

| Module | Responsibility |
| --- | --- |
| `api/` | Thin FastAPI transport adapters grouped by runs, articles, generation, and options. |
| `dependencies.py` | `Url2BlogLLM`, its production adapter, and the explicit `PipelineDependencies` seam. |
| `run_recorder.py` | Sole lifecycle mutation adapter for status, StageResults, and Pipeline Artifacts. |
| `observability.py` | Stage-trace append/read helpers. |
| `graph/state.py` | Shared LangGraph state contract. |
| `graph/routing.py` | Pure gate decisions and editorial rollback policy. |
| `graph/topology.py` | Graph nodes, edges, conditional branches, and compilation boundary. |
| `graph/nodes.py` | Cohesive graph-node family that delegates into pipeline phases. |
| `graph/runner.py` | Checkpoint setup, execution, trace collection, and top-level failure handling. |
| `pipeline_v2/intake.py` | Source extraction, normalization, classification, and narrative-focus selection. |
| `pipeline_v2/context.py` | Pure assembly of shared pipeline context and configuration. |
| `pipeline_v2/*phase*.py` | Deep phase modules for rewrite, fact/length, editorial, and finalization. |
| `llm/` | Canonical invocation, parsing, and value-normalization infrastructure. |
| `content/` | Text cleanup, Markdown shaping, editorial blocks, and output sanitizers. |
| `prompts/` | Prompt templates grouped by pipeline concern. |
| `storage.py` | Completed-article persistence and synchronization. |

## Architectural constraints

- There is no route-level compatibility facade. API adapters import the owning
  module, and pipeline code receives collaborators through
  `PipelineDependencies`.
- Only `RunRecorder` may call `write_status`, `write_stage_result`, or
  `write_artifact`.
- Routing policy is deterministic and side-effect free. Topology describes the
  graph; the runner executes it; node families implement application flow.
- LLM-backed stages call `Url2BlogLLM`, never FastAPI adapters or a route module.
- Tests inject fake collaborators. They must not install process-wide fake
  modules or rely on collection order.
- The graph is the only pipeline execution path. Do not add a parallel
  sequential implementation.

## Compatibility boundary

Refactors must preserve REST request/response contracts, persisted Stage names
and payloads, Pipeline Artifact shape, model selection, token policy, and trace
behavior unless a separate product change explicitly revises them.
