# Context: AI Blog Writer / packages / utils

## Scope

Cross-feature Python helpers used by the backend's feature modules:

- Vertex AI text and multimodal client factories.
- JSON parsing and structure validation for LLM output.
- Google grounded generation.
- CSV loading utility.

## Out of Scope

- Business logic.
- Storage.
- HTTP routing.
- Anything feature-specific.

## Purpose

Without this package every feature would re-create Vertex clients and re-implement "extract JSON from noisy LLM output". Centralising means model defaults, retries, parsing, and grounding policy can be tuned once.

## Tech Stack

- Python.
- `google-cloud-aiplatform` (Vertex AI).
- Optional `google-genai` SDK paths where the newer API is preferred.

## Glossary

### `get_vertex_llm()`

Factory that returns a configured text LLM client. Gemini models use Vertex AI; Claude models route to Anthropic through the same `.invoke(prompt)` surface.

### `invoke_vertex_multimodal_text(parts)`

Factory-backed Gemini multimodal call for image/text parts. Feature code builds parts with `vertex_part_from_data` and never imports Vertex SDKs directly.

### `parse_json_response(text)`

Given possibly-noisy LLM text, extract the first valid JSON object. Tolerates code fences and prose preambles.

### `extract_json_field(data, field)`

Safe nested-field access (`a.b.c`) over a dict.

### `validate_json_structure(data, schema)`

Asserts that `data` conforms to a lightweight schema spec.

### `invoke_google_grounded_text(prompt, sources)`

Retrieval-augmented generation. Returns a `GroundedGenerationResult`.

### `GroundedGenerationResult`

`content` + `citations` + metadata (model, sources used, tokens).

### `parse_csv(file)`

CSV → `list[dict]`.

## Relationships

- Consumed by feature modules in `apps/backend` (`prompt2blog`, `youtube2blog`, `location_documents`, `editor_assist`).
- No reverse dependency: utils does not know about features.

## Domain Rules

- All Vertex AI calls in the backend **must** route through `packages/utils` helpers. Features may not instantiate Vertex clients directly.
- `parse_json_response` is the canonical entry point for parsing LLM JSON; ad-hoc regex parsing in feature code is a bug.
- Grounded calls log citations; do not strip them downstream.

## Naming Conventions

- Snake_case functions.
- Preset names lower-case-with-underscores.

## Decisions

- **One client factory** rather than per-feature clients — easier to swap providers later.
- **Tolerant JSON parsing** instead of failing on minor LLM noise; reduces retry pressure.

## AI Guidance

- **Inspect first:** the function you're touching plus its consumers in `apps/backend/app/features/`.
- **Preserve verbatim:** `get_vertex_llm`, `invoke_vertex_multimodal_text`, `vertex_part_from_data`, `parse_json_response`, `invoke_google_grounded_text`, `GroundedGenerationResult`.
- **Do not** add domain logic here. Anything that knows what an "article" or "run" is is wrong-package.
- **Ask before** swapping the Vertex SDK or model defaults — every feature depends on these presets.

## Open Questions

- Should grounded generation be a separate utility package, given that it's used only by a couple of features?
