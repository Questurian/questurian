# AI Blog Writer / packages / shared — Context

## Purpose
Pydantic models for the pipeline contract. Type definitions only — no I/O, no logic.

## Tech stack
- Python, Pydantic `BaseModel`

## Ubiquitous language

| Term | Definition |
|------|------------|
| `RawVideoRecord` | Input video metadata: `video_id`, `title`, `description`, `transcript`, `transcript_status`. |
| `PipelineMeta` | Run-level metadata: `run_id`, `version`, `created_at`, `source`, `notes`. |
| `Stage0Output` | Raw input envelope. |
| `Stage1Output` | Cleaned transcript: `video_id`, `title`, `cleaned_transcript`. |
| `Stage2Output` | Classification: `article_type`, `confidence`, `reasoning`. |
| `Stage3Output` | Composed article: `coverage_analysis`, `missing_sections`, `final_article`. |
| `StageEditorialAugmentationOutput` | Augmented content + `components_added` + diagnostic. |
| `Stage4Output` | Titled article: `title`, `content`, `article_type`, `title_guideline_used`. |
| `StageResult` | Storage envelope: `run_id`, `stage`, `created_at`, `input_refs`, `data`. |
| `PipelineArtifact` | Full run: `meta`, `stages` dict, `markdown_path`, `created_at`. |

## Boundary

- **Owns:** types + validators.
- **Delegates:** everything else.

## Shared contracts

- Imported by `apps/backend` (`core.storage`, feature modules).
- Frontend re-implements parallel TS types — no direct import (Python ↔ TS boundary).
