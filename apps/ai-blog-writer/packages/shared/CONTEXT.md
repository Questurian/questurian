# Context: AI Blog Writer / packages / shared

## Scope

Type-only package. Pydantic models that define **the pipeline contract**: how stage outputs and run artifacts are shaped, what envelope wraps them in storage.

## Out of Scope

- Any I/O (no DB, no HTTP, no filesystem).
- Any business logic.
- TypeScript types — the frontend mirrors these shapes manually.

## Purpose

Multiple features write into the same storage table for stages, and the backend assembles a `PipelineArtifact` from them. Centralising the shape here means features can be added or retired without re-defining the run lifecycle.

## Tech Stack

- Python, Pydantic `BaseModel`.

## Glossary

### `RawVideoRecord`

Input video metadata. Fields: `video_id`, `title`, `description`, `transcript`, `transcript_status`.

### `PipelineMeta`

Run-level metadata. Fields: `run_id`, `version`, `created_at`, `source`, `notes`.

### `Stage0Output`

Raw input envelope. Carries `RawVideoRecord` or the moral equivalent for non-YouTube pipelines.

### `Stage1Output`

Cleaned transcript. Fields: `video_id`, `title`, `cleaned_transcript`.

### `Stage2Output`

Classification. Fields: `article_type`, `confidence`, `reasoning`.

### `Stage3Output`

Composed article. Fields: `coverage_analysis`, `missing_sections`, `final_article`.

### `StageEditorialAugmentationOutput`

Augmented content. Fields: the augmented article plus `components_added` (pull_quote / key_takeaways / faq / …) and diagnostic info.

### `Stage4Output`

Titled article. Fields: `title`, `content`, `article_type`, `title_guideline_used`.

### `StageResult`

Storage envelope. Fields: `run_id`, `stage`, `created_at`, `input_refs`, `data`.

### `PipelineArtifact`

Full run. Fields: `meta` (`PipelineMeta`), `stages` (dict), `markdown_path`, `created_at`.

## Relationships

- A **`PipelineArtifact`** has one **`PipelineMeta`** and many **`StageResult`** entries, one per stage executed.
- A **`StageResult.data`** is one of the `Stage[N]Output` variants (or a feature-specific output for non-article pipelines).
- The Markdown referenced by `markdown_path` is the canonical output — `Stage4Output.content` should match it.

## Domain Rules

- Models are strict (Pydantic `model_config = ConfigDict(extra="forbid")` where used). Unknown fields fail.
- A new `Stage[N]` introduces a contract change — bump versions on `PipelineMeta` if added.
- Schema is forward-only; renaming a field requires a migration of stored runs or a compatibility shim.

## Naming Conventions

- One class per file under `src/shared/`.
- Class names: `Stage[N]Output`, `StageEditorialAugmentationOutput`, `StageResult`, `PipelineArtifact`, `PipelineMeta`.

## Decisions

- **Pydantic, not dataclasses**, for validator support and JSON parity.
- **No re-export of TS types.** Frontend mirrors by hand to keep Python out of the JS bundle.

## AI Guidance

- **Inspect first:** the specific `Stage[N]Output` you're touching and `StageResult`.
- **Preserve verbatim:** every name in the glossary; storage and parsing rely on them.
- **Do not** add I/O here. Anything that calls out is wrong-package.
- **Do not** loosen models with `extra="allow"` without an explicit decision.

## Open Questions

- The Python ↔ TS mirror is hand-maintained. Should we generate the TS types from the Pydantic JSON schema?
- Should we version each `Stage[N]Output` individually, or only `PipelineMeta.version`?
- Non-article features (`location_documents`) don't fit the Stage[0..4] model — should the contract acknowledge them explicitly?
