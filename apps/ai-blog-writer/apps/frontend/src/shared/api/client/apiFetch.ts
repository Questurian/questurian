import { apiAuthToken } from './auth-token'
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
 * Two headers are attached when available, and nothing else:
 *
 * - `X-API-Key` from `VITE_ABW_API_KEY`, satisfying the backend's coarse
 *   `ABW_API_KEY` gate. Not a secret; see `abwApiKey`.
 * - `Authorization: Bearer <staff token>` from the registered auth provider,
 *   which is what actually identifies the caller. Never overrides a token the
 *   call site set itself.
 *
 * `Content-Type` is deliberately never set: the multipart call sites omit it
 * so the browser can generate the boundary.
 *
 * With neither configured this is a transparent pass-through and `init` is
 * forwarded byte-identical, so local development is unaffected.
 */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${API_BASE_URL}${path}`
  const key = abwApiKey()
  const token = apiAuthToken()

  if (!key && !token) {
    return fetch(url, init)
  }

  // `Headers` normalizes the three shapes `HeadersInit` allows, so an existing
  // Authorization header survives regardless of how the call site wrote it.
  const headers = new Headers(init?.headers)

  if (key) {
    headers.set(API_KEY_HEADER, key)
  }

  // Never override a token the call site chose deliberately — the image routes
  // pass an explicit one, and it may differ from the ambient session.
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  return fetch(url, { ...init, headers })
}
