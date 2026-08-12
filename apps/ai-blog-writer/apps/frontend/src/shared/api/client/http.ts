import { PAYLOAD_API_URL } from './config'

/**
 * Requests to Payload.
 *
 * The caller is identified by the httpOnly `payload-token` cookie, which
 * `credentials: 'include'` sends and which no script can read. These used to
 * take a `token` and set `Authorization: Bearer`, which meant a privileged
 * Staff JWT had to be readable by JavaScript to reach Payload at all.
 *
 * Passing a token here would be worse than redundant: `extractJWT` returns the
 * *first* credential it finds in `jwtOrder` (JWT, Bearer, cookie) and verifies
 * only that one, so a stale header shadows a perfectly good cookie and fails
 * the request.
 *
 * Payload gates *cookie* auth on its `csrf` allowlist, not its `cors` list —
 * this app's origin has to appear in `CORS_ALLOWED_ORIGINS` on the server, or
 * these come back 401 with nothing else to explain it.
 */
export async function payloadRequest(endpoint: string) {
  const response = await fetch(`${PAYLOAD_API_URL}${endpoint}`, {
    method: 'GET',
    mode: 'cors',
    cache: 'no-store',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch from ${endpoint}: ${response.status}`)
  }

  return response.json()
}

export async function payloadMutation(
  endpoint: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
) {
  const response = await fetch(`${PAYLOAD_API_URL}${endpoint}`, {
    method,
    mode: 'cors',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Failed ${method} ${endpoint}: ${response.status}${text ? ` — ${text}` : ''}`)
  }

  return response.json()
}
