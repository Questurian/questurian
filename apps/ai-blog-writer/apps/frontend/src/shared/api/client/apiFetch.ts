import { abwApiKey, API_BASE_URL } from './config'

const API_KEY_HEADER = 'X-API-Key'

/**
 * Single entry point for every request to the AI Blog Writer backend.
 *
 * Call sites pass a path relative to the backend root (`/youtube2blog/tones`,
 * `/images/upload`) rather than building the base URL themselves. Routing all
 * backend traffic through one function means request-wide concerns — the
 * `X-API-Key` header, credential mode, and anything after them — have exactly
 * one place to live.
 *
 * Requests to Payload and to the converter service are deliberately NOT routed
 * here: they are different origins with different credentials, and must not
 * receive backend headers.
 *
 * ## Who the caller is
 *
 * `credentials: 'include'`, always. The caller is identified by the httpOnly
 * `payload-token` cookie Payload set at login, which the browser attaches on
 * its own — the backend reads it as caller identity (`app/core/staff_token.py`).
 * This used to be an `Authorization: Bearer` header read from the in-memory
 * session store, which meant a privileged Staff JWT had to be readable by
 * JavaScript for every backend call. It no longer is.
 *
 * `'include'` rather than `'same-origin'` because the backend never is
 * same-origin with this app: it is a sibling subdomain in production and a
 * different port in development.
 *
 * Two things have to be true at the backend for the cookie to count, and both
 * fail closed rather than silently degrading:
 *
 * - `ABW_ALLOWED_ORIGINS` must list this app's exact origin. A wildcard forces
 *   `allow_credentials=False`, so the browser withholds the cookie, and the
 *   backend refuses cookie auth under a wildcard anyway. Local development has
 *   to pin it (`http://localhost:3003`, this app's dev port) — see
 *   `apps/backend/.env.example`.
 * - The `payload-token` cookie's `Domain` must cover this host, which is what
 *   `PAYLOAD_COOKIE_DOMAIN` configures on the Payload side.
 *
 * A call site may still set `Authorization` itself and it is never overridden,
 * but nothing in this app does any more: the cookie is the only credential.
 *
 * `Content-Type` is deliberately never set: the multipart call sites omit it
 * so the browser can generate the boundary.
 */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${API_BASE_URL}${path}`
  const key = abwApiKey()

  // `Headers` normalizes the three shapes `HeadersInit` allows, so an existing
  // Authorization header survives regardless of how the call site wrote it.
  const headers = new Headers(init?.headers)

  if (key) {
    headers.set(API_KEY_HEADER, key)
  }

  return fetch(url, { ...init, credentials: 'include', headers })
}
