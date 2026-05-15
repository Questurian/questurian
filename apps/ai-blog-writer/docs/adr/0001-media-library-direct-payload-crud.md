# ADR 0001 — Media Library: direct Payload CRUD from the ABW frontend

## Status

Accepted

## Context

The Media Library feature needs to read and write Questura's `MediaSet` and `MediaAsset` collections (browse, filter, field edits, audit queries, orphan detection). Two options were considered:

**Option A — Direct:** the ABW React frontend calls Questura's Payload REST API (`/api/media-sets`, `/api/media`) directly over HTTP.

**Option B — Proxied:** all Payload traffic goes through ABW's FastAPI backend, which adds its own `/images/media-sets` routes and forwards to Payload.

## Decision

**Option A (direct).** The ABW frontend already calls Payload directly for Sync operations (Draft → Payload). Extending that pattern to Media Library CRUD is consistent with the established architecture. A FastAPI proxy adds latency, a second failure point, and a maintenance burden with no benefit — the backend adds value only for AI-heavy operations (variant generation, alt-text via Vertex AI), which still go through the backend as before.

The split is: **AI work → ABW backend; CRUD reads/writes → Payload direct.**

## Consequences

- The ABW frontend holds a `PAYLOAD_API_URL` env var (already present via `shared/api/client/config`).
- New write calls use `PATCH /api/media-sets/:id` and `PATCH /api/media/:id` directly on Payload.
- Auth token from the ABW session is forwarded in the `Authorization: Bearer` header on every request.
- Alt-text generation for existing MediaSets calls the ABW backend (`POST /images/generate-alt-text-from-url`) because it requires Vertex AI — the backend fetches the image by URL server-side.
- If Payload's REST API changes its schema, the ABW frontend types must be updated manually (no auto-generated client).
