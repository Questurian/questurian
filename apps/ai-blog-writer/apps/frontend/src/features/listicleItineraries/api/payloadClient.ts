const PAYLOAD_API_URL =
  import.meta.env.VITE_PAYLOAD_API_URL || 'http://localhost:4000'

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
    throw new Error(formatPayloadHttpError(errBody, response.status))
  }

  return response.json()
}
