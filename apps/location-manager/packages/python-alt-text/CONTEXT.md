# Context: Location Manager / packages / python-alt-text

## Scope

Stateless Vertex AI microservice. Generates:

- Image alt text.
- Neighborhood prose descriptions.
- Accommodations field suggestions from an image.

## Out of Scope

- Persistence — caller (typically `packages/server`) stores results.
- Batching, retries, request queueing — the caller is responsible.
- Knowing about Locations, Tours, or Payload sync. The service is content-blind.

## Purpose

Vertex AI calls need a Python process (SDK familiarity, image handling). Keeping inference in a separate service lets:

- the Bun server stay fast and small,
- the model warm-load once,
- inference policy (model choice, presets) live in one place.

## Tech Stack

- Python 3, FastAPI, Uvicorn.
- Google Vertex AI Gemini (2.5 Pro / Flash).
- `google-genai` SDK.

## Glossary

### `NeighborhoodDescriptionRequest`

Input: location metadata. Output: a paragraph of prose suitable for a neighborhood-level location guide.

### `AccommodationsFieldSuggestionRequest`

Input: image (base64 or url) + context. Output: suggested values for accommodations fields.

### `AccommodationsOption`

Pydantic shape used for accommodations field suggestions. Mirrors the LM-shared enumeration.

### Image processing

The service base64-decodes and validates inputs before model calls. No long-term storage.

## Routes

- `GET /test` — liveness.
- `POST /alt` — image → alt text.
- `POST /neighborhood-description` — context → prose.
- `POST /accommodations-field-suggestion` — image → field suggestions.

## Module map

- `app.py` — FastAPI routes and backwards-compatible public imports.
- `vertex_runtime.py` — local environment loading and lazy Vertex initialization.
- `models.py` — request schemas and the accommodations compatibility adapter.
- `prompts.py` — pure prompt construction.
- `grounding.py` — grounded-source extraction, JSON parsing, and URL validation.
- `generation.py` — Vertex text, multimodal, grounded, and field-suggestion calls.

## Relationships

- No package-level imports from siblings. Called by `packages/server` over HTTP.

## Domain Rules

- Stateless. Each request must carry all context it needs.
- Image inputs must be validated (size, format) before model call.
- No retries — caller handles transient failures.

## Naming Conventions

- Route paths: kebab-case noun phrases.
- Pydantic models: `<Domain>Request` / `<Domain>Response`.

## Decisions

- **Separate process** rather than in-Bun inference: model warm-up, GPU portability, SDK ergonomics.
- **Vertex Gemini**, not OpenAI, to share auth + billing with the rest of the AI stack.
- **Slow startup is expected** — the dashboard's `slowStartup: true` flag handles this in monitoring.

## AI Guidance

- **Inspect first:** the route file under `scripts/` or app module, plus the request/response Pydantic models.
- **Do not** add storage. Persistence belongs in the caller.
- **Do not** introduce sibling-package imports.
- **Preserve verbatim:** `NeighborhoodDescriptionRequest`, `AccommodationsFieldSuggestionRequest`, `AccommodationsOption`.

## Open Questions

- Where should accommodations-option enumerations live canonically — here, in `lm-shared`, or in `lm-server`? Currently mirrored in two places.
- No `/health` (uses `/test`); should this conform to the rest of the meta-mono's `/health` convention?
