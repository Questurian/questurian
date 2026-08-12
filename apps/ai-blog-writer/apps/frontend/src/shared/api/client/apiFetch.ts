import { abwApiKey, API_BASE_URL } from './config'

const API_KEY_HEADER = 'X-API-Key'

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
 * When `VITE_ABW_API_KEY` is configured this attaches the `X-API-Key` header
 * the backend's `ABW_API_KEY` gate expects. Only that header is added: the
 * multipart call sites omit `Content-Type` so the browser can generate the
 * boundary, and nothing here may set it.
 *
 * With no key configured this is a transparent pass-through and `init` is
 * forwarded byte-identical, so local development is unaffected.
 */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${API_BASE_URL}${path}`
  const key = abwApiKey()

  if (!key) {
    return fetch(url, init)
  }

  // `Headers` normalizes the three shapes `HeadersInit` allows, so an existing
  // Authorization header survives regardless of how the call site wrote it.
  const headers = new Headers(init?.headers)
  headers.set(API_KEY_HEADER, key)

  return fetch(url, { ...init, headers })
}
