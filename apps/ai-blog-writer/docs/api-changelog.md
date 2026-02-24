# API Changelog

## 2026-02-24

### Added
- New direct YouTube URL pipeline endpoint:
  - `POST /youtube2blog/from-url`

### Changed
- `youtube2blog` now supports URL-first runs by extracting transcripts server-side.
- Frontend `youtube2blog` flow defaults to YouTube URL input while retaining CSV as fallback.

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
