# Context: YouTube2Blog

## Scope

Owns the `/youtube2blog` Feature: YouTube source intake, Transcript cleanup,
Classification, article composition, Quality Gates, SEO enrichment, Editorial
Augmentation, title generation, and the final Markdown Pipeline Artifact.

YouTube2Blog remains one Feature. Its internal modules separate deterministic
policy, graph orchestration, lifecycle persistence, and LLM-backed Stage
operations.

## Module map

| Area | Owns |
| --- | --- |
| `routes.py` | Pipeline Routes and request/response handling |
| `orchestrator.py` | Run initialization and the graph entrypoint |
| `content/` | Pure Markdown transformations and measurements |
| `quality/` | Pure Quality Gate, retry, near-pass, and rollback policy |
| `dependencies.py` | Explicit external collaborators |
| `run_recorder.py` | The only adapter that writes lifecycle, StageResult, trace, or Pipeline Artifact data |
| `graph/state.py` | Typed graph state |
| `graph/routing.py` | Pure branch routing |
| `graph/topology.py` | Node registry validation and LangGraph edges |
| `graph/nodes/` | Cohesive node families for Transcript, Classification, composition, SEO, Editorial Augmentation, title, and finalization |
| `graph/runner.py` | Model/tone resolution, graph execution, checkpointing, and tracing |
| `stages/` | LLM-backed Stage implementations and prompt handling |
| `stages/deep_expansion.py` | Gap analysis and additive article expansion |
| `stages/listicle_rewrite.py` | Listicle detection and complete curated-item rewrites |
| `stages/deep_expand_llm.py` | JSON/text LLM invocation policy shared by the two expansion paths |
| `stages/stage_deep_expand.py` | Stable public facade, branch selection, and terminal job status |

## Dependency direction

```text
Pipeline Route → orchestrator → graph runner → topology → node families
                                      ↘ RunRecorder
node families → quality policy / content transforms / LLM-backed stages
```

- `content/` and `quality/` do not import LangGraph, persistence, or provider
  clients.
- `graph/topology.py` knows node names and routes, not node implementation.
- `run_recorder.py` is the only lifecycle persistence adapter.
- LLM calls continue to enter through the existing `stages/` modules and shared
  LLM utilities.

## Preserved contracts

- Public REST paths and request/response shapes are unchanged.
- Canonical `Stage[N]Output`, persisted Stage names, `input_refs`, and
  Pipeline Artifact shape are unchanged.
- Existing retry limits, near-pass behavior, SEO rollback, Editorial
  Augmentation skip behavior, model selection, and LangSmith trace recording
  are unchanged.
- No new canonical top-level Stage was introduced.

## Testing rules

- Quality policy tests cross the pure policy interface.
- Topology tests use fake nodes and exercise branch routing.
- Lifecycle tests inject in-memory writers through `RunRecorder`.
- Tests must not replace process-wide modules through `sys.modules`.
