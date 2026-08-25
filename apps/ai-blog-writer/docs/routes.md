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
| POST | `/youtube2blog/from-url` | Start pipeline from a YouTube video URL (extract transcript server-side) |
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

### Prompt2Blog (`/prompt2blog`)

| Method | Path | Description |
|---|---|---|
| POST | `/prompt2blog/pipeline-v3` | Queue a commission-driven run, or return `needs_research` |
| GET | `/prompt2blog/editorial-options` | Load the v3 catalogs (forms, topic modules, audience tags, scope modes, reference roles) |
| GET | `/prompt2blog/input-options` | Load writing-profile catalogs (`tones`, `lengths`, `brand_voices`, defaults; also still carries legacy `article_types`) |
| GET | `/prompt2blog/status/{run_id}` | Get run status |
| GET | `/prompt2blog/result/{run_id}` | Get run output (`markdown` + `artifact`) |
| GET | `/prompt2blog/articles` | List completed Prompt2Blog articles |
| POST | `/prompt2blog/articles/{run_id}/sync` | Mark article as synced to Payload |
| GET | `/prompt2blog/articles/{run_id}/sync` | Get Payload sync status for article |
| POST | `/prompt2blog/pipeline-v2` | Legacy fallback: queue the structured v2 run. No UI caller. |
| POST | `/prompt2blog/run` | Legacy fallback: one-click v2 run (same schema as `pipeline-v2`). No UI caller. |
| GET | `/prompt2blog/article-types/{article_type_id}/guideline-preview` | Legacy: resolved guideline + title guideline markdown for a shared 42-type id |

`POST /prompt2blog/pipeline-v3` takes an approved commission and its verified
evidence package:
- `commission` (required): fingerprint, original title, location, approved
  direction, `form_id`, up to four `topic_module_ids`, audience, primary
  subject, scope mode and reference roles, requirements, exclusions
- `evidence_package` (required): sources, claims, per-requirement status,
  conflicts, gaps — its fingerprint must match the commission's, and its
  requirements must match the commission's exactly
- `profiles` (required): `tone_id`, `length_id`, optional `brand_voice_id`,
  `creativity_level`
- `model_routing`, `include_debug` (optional)
- `enable_editorial_augmentation` is refused with a 400. See ADR 0029.

It answers with either `{"status": "queued", "run_id"}` or, on a 200,
`{"status": "needs_research", findings, unresolved_requirements,
unresolved_conflict_ids, missing_source_requirements,
follow_up_research_prompt}`. `needs_research` queues nothing and spends no
writer-model token; it is a result to show, not an error.

Legacy v2 run input (unchanged, still accepted on the two fallback routes):
- `article_type_id` (required), `source_material` (required array of raw text blocks)
- `article_goal`, `target_reader`, `destination_context` (required)
- `tone_id`, `length_id` (required; loaded from `/prompt2blog/input-options`)
- `brand_voice_id`, `primary_keyword`, `secondary_keywords`, `must_include`, `audience_profile`, `negative_instructions` (optional)
- `prompt_enhance`, `creativity_level`, `include_debug`, `enable_editorial_augmentation`, `model_name` (optional controls)
- `enable_editorial_augmentation` defaults to `false`; callers must opt in to editorial extras

### Editor Assist (`/editor-assist`)

| Method | Path | Description |
|---|---|---|
| POST | `/editor-assist/rewrite-block` | Rewrite one markdown block using editor instruction |
| POST | `/editor-assist/generate-title` | Improve an existing article title using editor instruction |

### Images (`/images`)

| Method | Path | Description |
|---|---|---|
| POST | `/images/upload` | Upload one image, process variants, upload to Payload |
| POST | `/images/upload-variants` | Upload pre-processed variants to Payload |
| POST | `/images/process-only` | Process image variants without Payload upload |
| POST | `/images/flux-edit` | Proxy a FLUX.2 edit using the exact prompt, one required primary reference image, optional supporting reference images, and advanced model/size/safety controls, then return generated image bytes |
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
| POST | `/convert/lexical` | Convert Lexical JSON to Markdown |
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
| `/prompt2blog` | Auth required | Prompt2Blog main page |
| `/prompt2blog/articles` | Auth required | Prompt2Blog saved articles page |
| `/prompt2blog/stage` | Auth required | Prompt2Blog stage workflow page |
| `/prompt2blog/stage-article` | Auth required | Prompt2Blog stage article editor page |
| `/url2blog` | Auth required | URL2Blog page |
| `/image-recreation-prompts` | Auth required | Image recreation prompts page |
