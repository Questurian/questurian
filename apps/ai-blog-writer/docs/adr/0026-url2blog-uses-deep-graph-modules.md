# URL2Blog uses explicit collaborators and deep graph modules

## Context

URL2Blog's 449-line `routes.py` was both its HTTP adapter and a compatibility
facade for status storage, synchronization, LLM invocation, and pipeline
execution. Pipeline phases imported back through that facade, creating an
import cycle and forcing tests to monkeypatch private route names.

The graph runner also owned state, nodes, routing policy, topology, execution,
and tracing. A second sequential pipeline remained beside the active graph,
increasing the number of execution paths that changes had to preserve.

## Decision

URL2Blog remains one Feature and preserves its staged LangGraph workflow.
Its implementation is decomposed internally as follows:

- FastAPI handlers are transport adapters under `api/`.
- LLM calls enter through the `Url2BlogLLM` interface in
  `PipelineDependencies`.
- `RunRecorder` is the only adapter allowed to write lifecycle status,
  StageResults, and Pipeline Artifacts.
- Graph state, pure routing policy, topology, execution, and cohesive node
  families live in separate modules under `graph/`.
- Tests inject `PipelineDependencies` instead of patching a route-level service
  locator.
- The route compatibility facade and inactive sequential pipeline are removed.

Existing REST contracts, persisted Stage names and payloads, Pipeline Artifact
shape, model selection, and trace behavior remain unchanged.

## Consequences

- HTTP transport, application orchestration, LLM infrastructure, and
  persistence now meet at explicit seams.
- Graph topology and routing policy can be reviewed without loading every
  pipeline phase.
- Lifecycle mutation has one owner, including active-stage failure reporting.
- Tests no longer depend on process-wide module replacement or collection
  order.
- Node families stay deep enough to hide related pipeline behavior instead of
  creating one shallow module per node.
