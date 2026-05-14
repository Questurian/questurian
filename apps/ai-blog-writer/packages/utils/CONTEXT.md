# AI Blog Writer / packages / utils — Context

## Purpose
Cross-feature Python helpers: Vertex LLM client, JSON parsing/cleanup, grounded generation, CSV loading.

## Tech stack
- Python, `google-cloud-aiplatform` (Vertex AI)

## Ubiquitous language

| Term | Definition |
|------|------------|
| `get_vertex_llm()` | Vertex AI client factory with presets. |
| `LLMPresets` | Config enum: temperature, token limits, model. |
| `parse_json_response(text)` | Extract JSON object from possibly-noisy LLM text. |
| `extract_json_field(data, field)` | Safe nested-field access. |
| `validate_json_structure(data, schema)` | Schema conformance check. |
| `invoke_google_grounded_text(prompt, sources)` | Retrieval-augmented generation. |
| `GroundedGenerationResult` | `content` + `citations` + metadata. |
| `parse_csv(file)` | CSV → `list[dict]`. |

## Boundary

- **Owns:** utility functions only.
- **Delegates:** everything else. No business logic, no storage, no routes.

## Shared contracts

Consumed by feature modules in `apps/backend` (prompt2blog, youtube2blog, keyword_intel, location_documents). No reverse dependency.
