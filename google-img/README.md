# Vertex AI Image Transformer (Turbo Monorepo)

Minimal black/gray/white web app that lets users:

1. Enter a prompt
2. Optionally upload an image (drag-and-drop or file browser)
3. Generate a **16:9 landscape** output with automatic model routing:
   - **No upload** -> Imagen 4 Ultra text-to-image (2K)
   - **With upload** -> Nano Banana Pro image-to-image (`gemini-3-pro-image-preview`)

## Stack

- **Monorepo:** Turbo + npm workspaces
- **Frontend:** React + Vite + TypeScript
- **Backend:** Express + TypeScript
- **AI SDK:** `@google-cloud/aiplatform` using **Application Default Credentials (ADC)**

## Project structure

```text
.
├── apps
│   ├── api
│   │   ├── src
│   │   │   ├── config.ts
│   │   │   ├── errors.ts
│   │   │   ├── index.ts
│   │   │   └── vertex.ts
│   │   └── package.json
│   └── web
│       ├── src
│       │   ├── App.tsx
│       │   ├── main.tsx
│       │   └── styles.css
│       └── package.json
├── package.json
└── turbo.json
```

## Environment setup

The backend expects these environment variables:

- `GOOGLE_CLOUD_PROJECT` (required)
- `GOOGLE_CLOUD_LOCATION` (required)
- `PORT` (optional, default `8080`)
- `FRONTEND_ORIGIN` (optional, default `http://localhost:5173,http://localhost:5183`; comma-separated list supported)
- `MAX_UPLOAD_MB` (optional, default `10`)
- `VERTEX_IMAGE_MODEL` (optional, default `imagen-4.0-ultra-generate-001`; text-to-image)
- `VERTEX_IMAGE_EDIT_MODEL` (optional, default `gemini-3-pro-image-preview`; image-to-image)
- `VERTEX_SAMPLE_IMAGE_SIZE` (optional, `1K` or `2K`, default `2K`)

The API auto-loads `.env` from the workspace root (`./.env`) and `apps/api/.env` (if present).

Frontend variables:

- `VITE_API_BASE_URL` (optional, default `http://localhost:8080`)
- `VITE_MAX_UPLOAD_MB` (optional, default `10`)

## Google authentication (ADC)

This app intentionally uses host ADC only. It does **not** implement OAuth or service account flows.

Expected host setup:

- ADC file at `~/.config/gcloud/application_default_credentials.json`
- Env vars:
  - `GOOGLE_CLOUD_PROJECT=circular-symbol-484517-g2`
  - `GOOGLE_CLOUD_LOCATION=us-central1`

If auth fails, run manually:

```bash
gcloud auth application-default login
```

## Run locally

```bash
npm install
npm run dev
```

- Web: `http://localhost:5173`
- API: `http://localhost:8080`

## API

`POST /api/transform` (multipart form data)

- `image`: image file (optional)
- `prompt`: text prompt (required)

Response includes:

- `output.imageDataUrl` (base64 data URL)
- `output.mimeType`
- `output.mode` (`text-to-image` or `image-to-image`)
- `output.model` (actual model used)
- `output.aspectRatio` (`16:9`)
- `output.sampleImageSize` (`2K` for text-to-image responses)

## Behavior highlights

- Clear upload validation feedback (type + size limit)
- Prompt-only generation works without any upload
- Uploaded image is rendered immediately in the UI preview panel
- Notification toasts for upload success, submission, errors, and result readiness
- Backend and frontend both enforce upload-size limits
- Backend maps Vertex/auth/quota failures to readable API errors
