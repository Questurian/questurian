import { API_BASE_URL } from './config'

/**
 * Single entry point for every request to the AI Blog Writer backend.
 *
 * Call sites pass a path relative to the backend root (`/youtube2blog/tones`,
 * `/images/upload`) rather than building the base URL themselves. Routing all
 * backend traffic through one function means request-wide concerns — the
 * `X-API-Key` header, and anything after it — have exactly one place to live.
 *
 * Requests to Payload and to the converter service are deliberately NOT routed
 * here: they are different origins with different credentials, and must not
 * receive backend headers.
 *
 * This is a transparent pass-through to `fetch`. `init` is forwarded untouched,
 * which matters for the multipart call sites: they omit `Content-Type` so the
 * browser can generate the multipart boundary, and nothing here may add it.
 */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, init)
}
