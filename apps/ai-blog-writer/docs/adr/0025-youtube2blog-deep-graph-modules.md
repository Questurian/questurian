# YouTube2Blog uses deep graph modules and one lifecycle recorder

## Context

YouTube2Blog's `graph/runner.py` had grown to 1,507 lines. Its main function
contained more than 30 nested nodes, gates, retry/rollback handlers, routers,
storage writes, formatting helpers, graph construction, and tracing.

`orchestrator.py` also retained a second sequential pipeline implementation.
One test validated that inactive implementation, while graph tests installed a
process-wide fake dependency module during import. The YouTube2Blog test suite
therefore depended on collection order.

Prompt2Blog had already established first-class stage nodes and an explicit
lifecycle recorder in ADR-0024.

## Decision

YouTube2Blog remains one Feature and keeps its branching LangGraph workflow.
Its implementation is decomposed internally as follows:

- Pure Markdown transformations live in `content/`.
- Pure Quality Gate and retry/rollback decisions live in `quality/`.
- Graph state, routing, topology, and execution are separate modules.
- Graph nodes are grouped into cohesive pipeline families under `graph/nodes/`.
- `RunRecorder` is the only adapter allowed to write lifecycle status,
  StageResults, traces, and Pipeline Artifacts.
- `orchestrator.py` initializes a Run or delegates to the active graph; the
  inactive sequential pipeline is removed.

Existing REST contracts, persisted Stage names and payloads, Pipeline Artifact
shape, Quality Gate behavior, model selection, and trace behavior remain
unchanged.

## Consequences

- The graph topology can be reviewed and tested without loading LLM-backed
  Stage implementations.
- Quality policy is deterministic and has locality outside orchestration.
- Storage mutation and failure-stage tracking are concentrated behind one
  interface.
- Node families remain large enough to hide related implementation rather than
  creating one shallow module per node.
- Tests inject adapters or fake nodes instead of modifying process-wide module
  state.
- Adding a branch now requires an explicit topology change and a corresponding
  routing test.
