# API Changelog

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
