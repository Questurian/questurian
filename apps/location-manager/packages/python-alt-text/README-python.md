# Image Alt Text Generator (Vertex)

FastAPI service for image alt-text generation using Google Vertex AI Gemini.

## Features

- Vertex Gemini alt-text generation (`gemini-2.5-pro` by default)
- Accessibility-focused prompt (single concise sentence, under ~125 chars)
- Local API endpoint consumed by `@questurian/lm-server`
- No local LLM/model inference

## Endpoints

### `GET /test`

Health endpoint.

Example response:

```json
{
  "status": "ok",
  "message": "Server is working",
  "provider": "vertex-gemini",
  "model": "gemini-2.5-pro"
}
```

### `POST /alt`

Generate alt text from an uploaded image.

- Content type: `multipart/form-data`
- Field: `image`

Example response:

```json
{
  "alt": "Chef plating ceviche at a restaurant counter"
}
```

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GOOGLE_CLOUD_PROJECT` | Yes | - | Google Cloud project used for Vertex AI |
| `GOOGLE_CLOUD_LOCATION` | No | `us-central1` | Vertex AI region |
| `ALT_TEXT_MODEL` | No | `gemini-2.5-pro` | Gemini model name |

## Authentication

This service uses Google Application Default Credentials (ADC).

On this machine, ADC is expected at:

`~/.config/gcloud/application_default_credentials.json`

If credentials are missing or expired:

```bash
gcloud auth application-default login
```

## Local Development

From `packages/python-alt-text`:

```bash
pnpm run dev
```

Service URL: `http://localhost:8642`
