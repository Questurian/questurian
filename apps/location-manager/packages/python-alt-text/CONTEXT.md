# Location Manager / packages / python-alt-text — Context

## Purpose
Stateless Vertex AI microservice. Generates image alt text, neighborhood descriptions, and accommodation-field suggestions on demand.

## Tech stack
- Python 3, FastAPI, Uvicorn
- Google Vertex AI Gemini (2.5 Pro / Flash)
- `google-genai` SDK

## Ubiquitous language

| Term | Definition |
|------|------------|
| `NeighborhoodDescriptionRequest` | Input: location metadata → prose. |
| `AccommodationsFieldSuggestionRequest` | Input: image → suggested accommodation fields. |
| `AccommodationsOption` | Pydantic shape for the suggestions. |
| Image processing | Base64 decode + validation before model call. |

## Routes

- `GET /test`
- `POST /alt` — image → alt text
- `POST /neighborhood-description` — context → prose
- `POST /accommodations-field-suggestion` — image → field suggestions

## Boundary

- **Owns:** inference only. No DB. No persistence.
- **Delegates:** caller (typically `packages/server`) handles batching, storage, retries.

## Shared contracts

No package-level imports from siblings. Request/response over JSON. Called by `packages/server` over HTTP.
