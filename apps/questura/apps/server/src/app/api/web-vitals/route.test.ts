import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { NextRequest } from 'next/server'

import { resetLocalCounters } from '@/shared/lib/rate-limit-counter'
import { parseWebVitalsReport } from '@/shared/observability/web-vitals-report'
import { MAX_VITALS_PER_ADDRESS, POST } from './route'

// Launch fix plan item 13: real readers' page speed reaches the logs through
// a beacon guarded like the error beacon.

const ALLOWED_ORIGIN = 'http://localhost:3000'
const SAMPLE = {
  path: '/peru/lima',
  navigationType: 'navigate',
  release: 'abc123',
  metrics: [
    { name: 'LCP', value: 1834.6, rating: 'good' },
    { name: 'CLS', value: 0.012345, rating: 'good' },
    { name: 'INP', value: 72, rating: 'good' },
  ],
}

function request({
  body = SAMPLE,
  origin = ALLOWED_ORIGIN,
  ip = '192.0.2.10',
  raw,
}: { body?: unknown; origin?: string | null; ip?: string; raw?: string } = {}): NextRequest {
  const headers = new Headers({ 'x-forwarded-for': ip })
  if (origin) headers.set('origin', origin)
  const text = raw ?? JSON.stringify(body)
  headers.set('content-length', String(text.length))
  return { headers, text: async () => text } as unknown as NextRequest
}

let logLines: Array<Record<string, unknown>>

beforeEach(() => {
  resetLocalCounters()
  logLines = []
  vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
    logLines.push(JSON.parse(String(line)))
  })
})

afterEach(() => vi.restoreAllMocks())

describe('POST /api/web-vitals', () => {
  it('logs one flat line per batch', async () => {
    const response = await POST(request())

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe(ALLOWED_ORIGIN)
    expect(logLines).toHaveLength(1)
    expect(logLines[0]).toMatchObject({
      level: 'info',
      message: 'Web vitals',
      path: '/peru/lima',
      navigationType: 'navigate',
      release: 'abc123',
      lcp: 1835,
      lcpRating: 'good',
      cls: 0.0123,
      inp: 72,
    })
  })

  it('refuses another site', async () => {
    expect((await POST(request({ origin: 'https://evil.example' }))).status).toBe(403)
    expect(logLines).toHaveLength(0)
  })

  it('refuses a malformed batch', async () => {
    expect((await POST(request({ raw: '{"path":"/x","metrics":[]}' }))).status).toBe(400)
    expect(logLines).toHaveLength(0)
  })

  it('refuses an oversize body before reading it', async () => {
    const req = request()
    req.headers.set('content-length', String(64 * 1024))
    expect((await POST(req)).status).toBe(413)
  })

  it('stops logging one address past its limit, and still answers 204', async () => {
    for (let i = 0; i < MAX_VITALS_PER_ADDRESS + 5; i++) {
      expect((await POST(request())).status).toBe(204)
    }
    expect(logLines).toHaveLength(MAX_VITALS_PER_ADDRESS)

    await POST(request({ ip: '192.0.2.11' }))
    expect(logLines).toHaveLength(MAX_VITALS_PER_ADDRESS + 1)
  })
})

describe('parseWebVitalsReport', () => {
  const parse = (body: unknown) => parseWebVitalsReport(JSON.stringify(body))

  it('keeps only the known metrics, ratings and navigation types', () => {
    const report = parse({ ...SAMPLE, navigationType: 'teleport', metrics: [{ name: 'LCP', value: 900, rating: 'great' }] })
    expect(report).toEqual({ path: '/peru/lima', release: 'abc123', metrics: [{ name: 'LCP', value: 900 }] })
  })

  it.each([
    ['a query string', { ...SAMPLE, path: '/account?email=reader@example.com' }],
    ['a fragment', { ...SAMPLE, path: '/x#token' }],
    ['another host', { ...SAMPLE, path: '//evil.example/x' }],
    ['a full address', { ...SAMPLE, path: 'https://evil.example/x' }],
    ['an unknown metric', { ...SAMPLE, metrics: [{ name: 'FID', value: 3 }] }],
    ['a repeated metric', { ...SAMPLE, metrics: [{ name: 'LCP', value: 3 }, { name: 'LCP', value: 4 }] }],
    ['a negative value', { ...SAMPLE, metrics: [{ name: 'LCP', value: -1 }] }],
    ['a value that is not a number', { ...SAMPLE, metrics: [{ name: 'LCP', value: '900' }] }],
    ['a broken clock', { ...SAMPLE, metrics: [{ name: 'TTFB', value: 11 * 60 * 1000 }] }],
    ['an impossible CLS', { ...SAMPLE, metrics: [{ name: 'CLS', value: 500 }] }],
    ['no metrics', { ...SAMPLE, metrics: [] }],
    ['an array', [SAMPLE]],
  ])('refuses %s', (_label, body) => {
    expect(parse(body)).toBeNull()
  })

  it('refuses a body over 2 KB and bad JSON', () => {
    expect(parseWebVitalsReport(`{"path":"/${'a'.repeat(3000)}"}`)).toBeNull()
    expect(parseWebVitalsReport('{')).toBeNull()
  })

  it('drops a release that is not a plain token', () => {
    expect(parse({ ...SAMPLE, release: 'x y' })?.release).toBeUndefined()
  })
})
