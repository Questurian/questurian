# Context: URL2Blog feature

## Scope

Owns the `/url2blog` pipeline: turn a source URL or pasted text into a
publish-ready rewritten article. Exposes the REST surface (status/result/articles
+ the `pipeline-v2` entrypoint), runs the LangGraph pipeline via `graph/runner.py`,
and holds every prompt, sanitizer, and stage phase the pipeline needs.

## Out of scope

- Run lifecycle storage primitives → `app.core` (`write_status`, `read_output`, …).
- Vertex client + grounding → `packages/utils` (`get_vertex_llm`,
  `invoke_google_grounded_text`).
- Completed-article persistence/sync bookkeeping → `storage.py`.

## Module map

`routes.py` was a single 7.2k-line file; it is now a thin orchestration layer plus
domain modules. Everything below is re-exported from `routes.py` so existing
callers and tests that reach in via `url2blog_routes.<name>` keep working.

| Module | Holds |
| --- | --- |
| `routes.py` | FastAPI handlers, the **LLM-invocation layer** (`_invoke_json_llm*`, `_invoke_markdown_long_output`, `_invoke_title_generation`, `_invoke_google_grounded_json`, build helpers), text-cleanup, stage1/stage2/core orchestration, and back-compat re-exports. |
| `config.py` | Model/profile constants, env-flag knobs, and their resolvers (`_resolve_*`, `_read_*_env`, `_use_*`). |
| `models.py` | Pydantic request models (`ExtractRequest`, `Stage2ClassifyRequest`, `PipelineV2Request`). |
| `prompts/` | All prompt templates, grouped by domain (extract, cleanup, rewrite, audit, facts, length, editorial). Pure strings. |
| `llm/coerce.py` | Value coercion + normalization (`_safe_*`, `_normalize_*`, similarity helpers). |
| `llm/parsing.py` | JSON extraction/repair for LLM output + parse-failure tracking context. |
| `content/markdown.py` | Pure markdown/text shaping (`_ensure_markdown_section_headers`, `_remove_academic_conclusion_phrases`). |
| `content/editorial_blocks.py` | Editorial markers, metadata boxes, labels, blueprint formatting. |
| `content/sanitizers.py` | `_sanitize_v2_*` — normalize raw LLM JSON for each stage (imports `content/editorial_blocks`). |
| `pipeline_v2/gating.py` | Quality/fact gating decisions + rewrite-retry feedback. |
| `pipeline_v2/phases.py` | Compatibility exports for the 5 pipeline phases. |
| `pipeline_v2/rewrite_quality*.py` | Thin rewrite/quality orchestrator plus setup, blueprint, composition, repair, and persistence steps. |
| `pipeline_v2/fact_length*.py` | Thin fact/length orchestrator plus fact repair, expansion, final audit, and persistence steps. |
| `pipeline_v2/editorial.py` | Editorial Augmentation phase. |
| `pipeline_v2/editorial_recheck.py` | Post-augmentation quality/fact recheck and rollback decision. |
| `pipeline_v2/finalize*.py` | Thin response finalizer plus artifact/response assembly steps. |

## Key constraint: test monkeypatching

The test-suite patches functions on the `url2blog_routes` module object
(`monkeypatch.setattr(url2blog_routes, "_invoke_json_llm", …)`). For a patch to be
visible, the patched function **and its bare-name caller must live in the same
module** (`routes.py`). That is why the invocation layer stays in `routes.py`.

The pipeline-v2 phase modules call two patched wrappers — `_invoke_json_llm_tracked`
and `_invoke_google_grounded_json` — as `routes.<name>(...)` (attribute lookup at
call time) so patches still apply. Non-patched helpers are imported directly.

## Key constraint: import cycle

The pipeline-v2 phase modules import the invoke/build wrappers from `routes.py`,
and `routes.py` imports the compatibility exports back (so the graph runner can call
`url2blog_routes._pipeline_v2_run_*`). The cycle is closed by importing the phases
at the **bottom** of `routes.py`, after those wrappers are defined.

Full poison set (functions monkeypatched on `url2blog_routes`, so pinned to
`routes.py` or accessed via `routes.<name>`): `_invoke_json_llm`,
`_invoke_json_llm_tracked`, `_invoke_google_grounded_json`, `extract_article`,
`classify_article_type`, `get_vertex_llm`, `get_article_type_by_id`,
`read_output`, `read_stage_result`, `read_status`, `run_url2blog_pipeline_graph`.
