import { offlineDevSessionActive } from '../../auth/dev-session'

const PAYLOAD_API_URL =
  import.meta.env.VITE_PAYLOAD_API_URL || 'http://localhost:4000'

/**
 * Payload's 403 body is the same sentence whoever you are, which is useless
 * when the reason is that you are nobody. The offline dev login fakes an admin
 * in this app's own UI without ever obtaining Payload's `payload-token` cookie,
 * so every read here arrives anonymous and the collection refuses it -- the
 * screen then says "not allowed" to someone the app is showing as an admin.
 * Say which of the two it is, because the cure is different for each.
 */
function explainForbidden(message: string): string {
  if (!offlineDevSessionActive()) return message
  return (
    `${message} You are signed in with the offline dev login ` +
    '(VITE_DEV_OFFLINE_LOGIN), which is not a real Payload session, so Payload ' +
    'sees this request as signed out. Unset that flag and sign in to Payload ' +
    'for real to read and write documents.'
  )
}

function formatFieldError(entry: Record<string, unknown>): string {
  const msg = typeof entry.message === 'string' ? entry.message.trim() : ''
  const path = Array.isArray(entry.path)
    ? entry.path
        .filter((p) => typeof p === 'string' || typeof p === 'number')
        .join('.')
    : typeof entry.path === 'string'
      ? entry.path
      : ''
  const data = entry.data
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const nested = (data as Record<string, unknown>).errors
    if (Array.isArray(nested) && nested.length > 0) {
      const inner = nested
        .map((item) => {
          if (!item || typeof item !== 'object') return ''
          return formatFieldError(item as Record<string, unknown>)
        })
        .filter(Boolean)
        .join('; ')
      if (inner) return inner
    }
  }
  if (msg && path) return `${path}: ${msg}`
  return msg || path
}

function formatPayloadHttpError(body: unknown, status: number): string {
  if (!body || typeof body !== 'object') {
    return `Payload request failed (${status})`
  }
  const record = body as Record<string, unknown>
  const rootMessage =
    typeof record.message === 'string' ? record.message.trim() : ''

  const errors = record.errors
  if (Array.isArray(errors) && errors.length > 0) {
    const detail = errors
      .map((entry) => {
        if (typeof entry === 'string') return entry
        if (!entry || typeof entry !== 'object') return ''
        return formatFieldError(entry as Record<string, unknown>)
      })
      .filter(Boolean)
      .join('; ')
    if (detail) {
      return rootMessage ? `${rootMessage} — ${detail}` : detail
    }
  }

  return rootMessage || `Payload request failed (${status})`
}

export async function payloadRequest<T>(
  endpoint: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${PAYLOAD_API_URL}${endpoint}`, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers || {})
    }
  })

  if (!response.ok) {
    const errBody = await response.json().catch(() => null)
    const message = formatPayloadHttpError(errBody, response.status)
    throw new Error(
      response.status === 401 || response.status === 403
        ? explainForbidden(message)
        : message,
    )
  }

  return response.json()
}
