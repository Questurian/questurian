import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { NextRequest } from 'next/server'

import { resetLocalCounters } from '@/shared/lib/rate-limit-counter'
import { MAX_REPORTS_PER_ADDRESS, POST } from './route'

// Outside production `CORS_ORIGINS` carries the localhost dev origins.
const ALLOWED_ORIGIN = 'http://localhost:3000'

function request({
  body = { source: 'browser', boundary: 'global-error', message: 'Boom for reader@example.com', path: '/rome' },
  origin = ALLOWED_ORIGIN,
  ip = '192.0.2.10',
  raw,
}: { body?: unknown; origin?: string | null; ip?: string; raw?: string } = {}): NextRequest {
  const headers = new Headers({ 'x-forwarded-for': ip, 'x-request-id': 'req-beacon-0001' })
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

describe('POST /api/client-errors', () => {
  it('accepts a report from the site as one redacted log line', async () => {
    const response = await POST(request())

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe(ALLOWED_ORIGIN)
    expect(logLines).toHaveLength(1)
    expect(logLines[0]).toMatchObject({
      level: 'error',
      message: 'Client error reported',
      clientMessage: 'Boom for [email]',
      source: 'browser',
      boundary: 'global-error',
      path: '/rome',
      reportRequestId: 'req-beacon-0001',
    })
    expect(JSON.stringify(logLines[0])).not.toContain('reader@example.com')
  })

  it('accepts a report from the Worker, which sends no Origin', async () => {
    const response = await POST(request({ origin: null, body: { source: 'worker', boundary: 'request', message: 'x' } }))
    expect(response.status).toBe(204)
    expect(logLines).toHaveLength(1)
  })

  it('refuses another site', async () => {
    const response = await POST(request({ origin: 'https://evil.example' }))
    expect(response.status).toBe(403)
    expect(logLines).toHaveLength(0)
  })

  it('refuses a malformed report', async () => {
    const response = await POST(request({ raw: '{"nope":true}' }))
    expect(response.status).toBe(400)
    expect(logLines).toHaveLength(0)
  })

  it('refuses an oversize body before reading it', async () => {
    const req = request()
    req.headers.set('content-length', String(64 * 1024))
    const response = await POST(req)
    expect(response.status).toBe(413)
  })

  it('stops logging one address past its limit, and still answers 204', async () => {
    for (let i = 0; i < MAX_REPORTS_PER_ADDRESS + 5; i++) {
      expect((await POST(request())).status).toBe(204)
    }
    expect(logLines).toHaveLength(MAX_REPORTS_PER_ADDRESS)

    await POST(request({ ip: '192.0.2.11' }))
    expect(logLines).toHaveLength(MAX_REPORTS_PER_ADDRESS + 1)
  })
})
