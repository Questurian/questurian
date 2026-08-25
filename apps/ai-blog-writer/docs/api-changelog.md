# API Changelog

## 2026-08-25

### Added
- Prompt2Blog v3, the commission-driven pipeline (ADR 0029):
  - `POST /prompt2blog/pipeline-v3` — queue a run from an approved commission
    and its verified evidence package, or answer `needs_research` on a 200
    without queueing anything.
  - `GET /prompt2blog/editorial-options` — the 15 article forms, 10 topic
    modules, audience tags, scope modes and reference roles.
- `GET /prompt2blog/result/{run_id}` and `/debug/{run_id}` expose a
  `pipeline_v3` artifact and `stage_v3_*` stages, and attach the LangGraph
  trace to whichever artifact key a run recorded.

### Changed
- The Prompt2Blog UI submits only `pipeline-v3`. `POST /prompt2blog/run` and
  `POST /prompt2blog/pipeline-v2` still work and are unchanged, but have no UI
  caller; they remain as a fallback until v3 is proven on a controlled real run.
- `POST /prompt2blog/pipeline-v3` refuses `enable_editorial_augmentation` with
  a 400 rather than accepting the flag and ignoring it.
- `pipeline_v2` result artifacts stay readable and stageable. Nothing about the
  shared 42-row `article_types` catalog, its routes, its guideline files or its
  seeding scripts changed; URL2Blog and YouTube2Blog still own them.

### Removed
- `POST /prompt2blog/pipeline-v3/intake`, added earlier in this series as a
  validate-and-assemble preview and made redundant by `POST /pipeline-v3`
  answering `needs_research` itself. It never had a caller.

## 2026-02-24

### Added
- New direct YouTube URL pipeline endpoint:
  - `POST /youtube2blog/from-url`

### Changed
- `youtube2blog` now runs from YouTube URL input by extracting transcripts server-side.
- Frontend `youtube2blog` flow is URL-only.
- `youtube2blog` now applies an always-on editorial augmentation step between compose and title.
- `GET /youtube2blog/status/{run_id}` can report `stage_editorial_augmentation`.
- `GET /youtube2blog/debug/{run_id}` now includes `stage_editorial_augmentation` when present.
- `GET /youtube2blog/result/{run_id}` now returns markdown built from generated title + editorially augmented content.

### Removed
- Legacy upload endpoint:
  - `POST /youtube2blog/upload`
- Legacy CSV input mode in the `youtube2blog` UI.

## 2026-02-07

### Added
- Canonical shared article-type endpoints at:
  - `GET /article-types`
  - `POST /article-types`
  - `PUT /article-types/{article_type_id}`
  - `DELETE /article-types/{article_type_id}`

### Changed
- `PUT /article-types/{article_type_id}` now updates by `article_type_id`.
- Duplicate-name updates now return `409 Conflict`.
- Updating a missing `article_type_id` now returns `404 Not Found`.

### Removed
- Legacy alias endpoints were removed in dev:
  - `GET /youtube2blog/article-types`
  - `POST /youtube2blog/article-types`
  - `PUT /youtube2blog/article-types/{article_type_id}`
  - `DELETE /youtube2blog/article-types/{article_type_id}`
