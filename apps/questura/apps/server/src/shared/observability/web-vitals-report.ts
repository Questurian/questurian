/**
 * The shape `/api/web-vitals` accepts, and nothing else (launch fix plan
 * item 13).
 *
 * The website measures its real readers' page speed with Next's built-in
 * `useReportWebVitals` and posts one small batch per page view here, beside
 * the error beacon (`/api/client-errors`). Like that endpoint it is
 * unauthenticated, so every field is checked and capped, and anything that
 * does not fit is dropped: a sample is a number for a dashboard, not input for
 * the program.
 */

export const MAX_VITALS_BYTES = 2 * 1024

/** The metrics Next reports. LCP, INP and CLS are the three that count. */
export const VITAL_NAMES = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'] as const
export type VitalName = (typeof VITAL_NAMES)[number]

const NAMES = new Set<string>(VITAL_NAMES)
const RATINGS = new Set(['good', 'needs-improvement', 'poor'])
const NAVIGATION_TYPES = new Set(['navigate', 'reload', 'back-forward', 'back-forward-cache', 'prerender', 'restore'])

/** Beyond these a value is a broken clock, not a slow page. */
const MAX_MS = 10 * 60 * 1000
const MAX_CLS = 100

export type WebVital = {
  name: VitalName
  value: number
  rating?: string
}

export type WebVitalsReport = {
  path: string
  navigationType?: string
  release?: string
  metrics: WebVital[]
}

function metric(value: unknown): WebVital | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  if (typeof input.name !== 'string' || !NAMES.has(input.name)) return null
  const name = input.name as VitalName
  const number = input.value
  if (typeof number !== 'number' || !Number.isFinite(number) || number < 0) return null
  if (number > (name === 'CLS' ? MAX_CLS : MAX_MS)) return null

  // Milliseconds to the millisecond, CLS to four places: nothing finer means anything.
  const out: WebVital = { name, value: name === 'CLS' ? Math.round(number * 10_000) / 10_000 : Math.round(number) }
  if (typeof input.rating === 'string' && RATINGS.has(input.rating)) out.rating = input.rating
  return out
}

export function parseWebVitalsReport(raw: string): WebVitalsReport | null {
  if (raw.length > MAX_VITALS_BYTES) return null

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return null
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const input = body as Record<string, unknown>

  // A pathname only: no query string, no fragment, no other host.
  const path = typeof input.path === 'string' ? input.path.trim() : ''
  if (!path.startsWith('/') || path.startsWith('//') || path.length > 300 || /[?#\s]/.test(path)) return null

  if (!Array.isArray(input.metrics) || input.metrics.length === 0 || input.metrics.length > VITAL_NAMES.length) return null
  const metrics: WebVital[] = []
  const seen = new Set<string>()
  for (const entry of input.metrics) {
    const parsed = metric(entry)
    if (!parsed || seen.has(parsed.name)) return null
    seen.add(parsed.name)
    metrics.push(parsed)
  }

  const report: WebVitalsReport = { path, metrics }
  if (typeof input.navigationType === 'string' && NAVIGATION_TYPES.has(input.navigationType)) {
    report.navigationType = input.navigationType
  }
  if (typeof input.release === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(input.release)) report.release = input.release
  return report
}

/** One flat log line: `lcp: 1840, lcpRating: 'good', …`, which a log search can chart. */
export function webVitalsLogFields(report: WebVitalsReport): Record<string, unknown> {
  const fields: Record<string, unknown> = { path: report.path }
  if (report.navigationType) fields.navigationType = report.navigationType
  if (report.release) fields.release = report.release
  for (const { name, value, rating } of report.metrics) {
    const key = name.toLowerCase()
    fields[key] = value
    if (rating) fields[`${key}Rating`] = rating
  }
  return fields
}
