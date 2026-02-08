# Route Reference

Comprehensive route list for this workspace.

## Backend API (FastAPI, default `http://localhost:4003`)

### Core

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check endpoint |
| GET | `/openapi.json` | OpenAPI schema (FastAPI auto-generated) |
| GET | `/docs` | Swagger UI (FastAPI auto-generated) |
| GET | `/docs/oauth2-redirect` | Swagger OAuth redirect helper |
| GET | `/redoc` | ReDoc UI (FastAPI auto-generated) |

### YouTube2Blog (`/youtube2blog`)

| Method | Path | Description |
|---|---|---|
| POST | `/youtube2blog/upload` | Upload CSV with video rows and queue runs |
| GET | `/youtube2blog/status/{run_id}` | Get pipeline run status |
| GET | `/youtube2blog/result/{run_id}` | Get run output (`json` or `?format=md`) |
| GET | `/youtube2blog/debug/{run_id}` | Get stage-by-stage debug payload |
| POST | `/youtube2blog/test-stage1` | Execute Stage 1 test flow |
| POST | `/youtube2blog/test` | Execute test pipeline flow |
| POST | `/youtube2blog/clear` | Clear YouTube2Blog run data |
| GET | `/youtube2blog/articles` | List completed YouTube2Blog articles |
| POST | `/youtube2blog/articles/{run_id}/sync` | Mark article as synced to Payload |
| GET | `/youtube2blog/articles/{run_id}/sync` | Get Payload sync status for article |

### URL2Blog (`/url2blog`)

| Method | Path | Description |
|---|---|---|
| POST | `/url2blog/extract` | Extract and optionally translate article content from a URL |
| POST | `/url2blog/pipeline-v2` | Simplified one-call pipeline (extract + classify + strict guideline rewrite + quality gate + fact-retention audit/repair) returning lean JSON and `final_markdown` (`include_debug=true` adds raw internals, optional `narrative_focus` steers framing, optional `model_name` selects Gemini model, short articles use capped Google-grounded enrichment) |

### Review2Blog (`/review2blog`)

| Method | Path | Description |
|---|---|---|
| POST | `/review2blog/upload` | Process uploaded review JSON (phase 1) |
| POST | `/review2blog/phase2` | Aggregate phase 1 signals into profile |
| POST | `/review2blog/phase3` | Generate listicle blurb from profile/context |
| GET | `/review2blog/status/{run_id}` | Pipeline status placeholder (currently returns 501) |
| GET | `/review2blog/result/{run_id}` | Pipeline result placeholder (currently returns 501) |
| POST | `/review2blog/clear` | Clear Review2Blog run data |
| GET | `/review2blog/articles` | List completed Review2Blog articles |

### Images (`/images`)

| Method | Path | Description |
|---|---|---|
| POST | `/images/upload` | Upload one image, process variants, upload to Payload |
| POST | `/images/upload-variants` | Upload pre-processed variants to Payload |
| POST | `/images/process-only` | Process image variants without Payload upload |
| POST | `/images/generate-alt-text` | Generate alt text with Gemini vision (optional `narrative_focus` to emphasize audience-relevant details) |

### Shared Article Types (`/article-types`)

| Method | Path | Description |
|---|---|---|
| GET | `/article-types` | List all article types |
| GET | `/article-types/name-definitions` | List article types with only `name` and `definition` |
| GET | `/article-types/{article_type_id}/guidelines` | Get `guideline` and `title_guideline` by article type ID |
| GET | `/article-types/by-name/{name}/guidelines` | Get `guideline` and `title_guideline` by article type name |
| POST | `/article-types` | Create article type |
| PUT | `/article-types/{article_type_id}` | Update article type by ID |
| DELETE | `/article-types/{article_type_id}` | Delete article type by ID |

## Converter API (Express, default `http://localhost:4010`)

| Method | Path | Description |
|---|---|---|
| GET | `/` | Converter service info and endpoint docs |
| GET | `/health` | Converter health check |
| POST | `/convert/markdown` | Convert Markdown to Lexical JSON |
| POST | `/convert/html` | Convert HTML to Lexical JSON |
| POST | `/convert/validate` | Validate Lexical JSON shape |
| OPTIONS | `*` | CORS preflight handler |

## Frontend App Routes (React Router, default `http://localhost:3003`)

| Route Path | Access | Screen |
|---|---|---|
| `/login` | Public | Login page |
| `/` | Auth required | Landing page |
| `/youtube2blog` | Auth required | YouTube2Blog main page |
| `/youtube2blog/articles` | Auth required | Saved articles page |
| `/youtube2blog/article-types` | Auth required | Article types management page |
| `/youtube2blog/image-pipeline` | Auth required | Image pipeline page |
| `/youtube2blog/stage` | Auth required | Stage workflow page |
| `/youtube2blog/stage-article` | Auth required | Stage article editor page |
| `/review2blog` | Auth required | Review2Blog page |
| `/url2blog` | Auth required | URL2Blog page |
