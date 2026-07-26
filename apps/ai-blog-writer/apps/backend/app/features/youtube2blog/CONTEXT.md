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
| `routes.py` | Thin public facade preserving the feature router and handler imports |
| `api/router.py` | Aggregates route-family routers under `/youtube2blog` |
| `api/pipeline.py` | YouTube intake, run status/results, and tone options |
| `api/diagnostics.py` | Stage-by-stage run diagnostics |
| `api/testing.py` | Development-only Stage 1 probe endpoints |
| `api/articles.py` | Completed-article listing, deletion, and run cleanup |
| `api/sync.py` | Payload Sync bookkeeping |
| `api/expansion.py` | Listicle detection and Deep Expansion job lifecycle |
| `models.py` | Public API request shapes |
| `orchestrator.py` | Run initialization and the graph entrypoint |
| `content/` | Pure Markdown transformations and measurements |
| `quality/` | Pure Quality Gate, retry, near-pass, and rollback policy |
| `quality/article_assessment.py` | Pure Stage 3 assessment normalization and heuristic fallback |
| `quality/article_revision.py` | Pure Stage 3 rewrite-mode selection and targeted feedback |
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
| `content/editorial_blocks.py` | Pure Editorial Augmentation Markdown marker repair |
| `stages/editorial_augmentation_prompts.py` | Editorial Augmentation prompt policy |
| `stages/editorial_augmentation_validation.py` | Model-output normalization and preservation checks |
| `stages/editorial_augmentation_llm.py` | Editorial model invocation, JSON retry, and prose repair |
| `stages/stage_editorial_augmentation.py` | Stable thin Editorial Augmentation Stage facade |
| `stages/stage_3_guidelines.py` | Stage 3 general and Article Type guideline retrieval |
| `stages/stage_3_coverage.py` | Coverage Analysis prompt, invocation, and response parsing |
| `stages/stage_3_supplement.py` | Missing-section supplementation and prose repair |
| `stages/stage_3_composition.py` | Final article prompt, composition, and prose repair |
| `stages/stage_3_pipeline.py` | Legacy sequential Stage 3 orchestration |
| `stages/stage_3.py` | Stable thin Stage 3 facade and compatibility seams |
| `stages/stage_3_quality_assessment.py` | Stage 3 quality prompt, LLM invocation, and fallback selection |
| `stages/stage_3_quality_rewrite.py` | Stage 3 rewrite prompt, LLM invocation, anti-AI repair, and length safeguard |
| `stages/stage_3_quality.py` | Stable thin Stage 3 quality facade |
| `content/seo_metrics.py` | Pure keyword, heading, and paragraph measurements shared by SEO phases |
| `quality/seo_brief.py` | Pure SEO brief normalization and heuristic fallback policy |
| `stages/stage_seo_prompts.py` | SEO brief and article enrichment prompt policy |
| `stages/stage_seo_brief.py` | SEO brief LLM invocation and fallback selection |
| `stages/stage_seo_enrichment.py` | SEO rewrite prompt, LLM invocation, anti-AI repair, and keyword safeguards |
| `quality/seo_assessment.py` | Pure deterministic SEO Quality Gate assessment |
| `stages/stage_seo.py` | Stable thin SEO Stage facade |

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
