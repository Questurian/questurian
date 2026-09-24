import type { ClientErrorReport } from './error-reporting'
import { wellFormedRequestId } from './request-id'

/**
 * The shape `/api/client-errors` accepts, and nothing else.
 *
 * The website reports its errors here instead of to Sentry directly (see
 * docs/procedures/sentry-setup.md for why), so this is an unauthenticated
 * endpoint anyone can post to. Every field is optional except the two that
 * say what happened, every field has a length cap, and anything that does not
 * fit is dropped rather than trusted: a report is a hint for a human, not
 * input for the program.
 */

export const MAX_REPORT_BYTES = 8 * 1024

const BOUNDARIES = new Set(['global-error', 'error', 'request', 'unhandled'])

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed
}

function token(value: unknown, max: number): string | undefined {
  const out = text(value, max)
  return out && /^[A-Za-z0-9._-]+$/.test(out) ? out : undefined
}

export function parseClientErrorReport(raw: string): ClientErrorReport | null {
  if (raw.length > MAX_REPORT_BYTES) return null

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return null
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const input = body as Record<string, unknown>

  const source = input.source === 'browser' || input.source === 'worker' ? input.source : null
  const message = text(input.message, 500)
  if (!source || !message) return null

  const boundary = typeof input.boundary === 'string' && BOUNDARIES.has(input.boundary) ? input.boundary : 'unknown'
  const path = text(input.path, 300)
  const digest = token(input.digest, 64)
  const requestId = wellFormedRequestId(typeof input.requestId === 'string' ? input.requestId : undefined)
  const release = token(input.release, 64)
  const stack = text(input.stack, 4000)

  const report: ClientErrorReport = { source, boundary, message }
  if (path?.startsWith('/')) report.path = path
  if (digest) report.digest = digest
  if (requestId) report.requestId = requestId
  if (release) report.release = release
  if (stack) report.stack = stack
  return report
}
