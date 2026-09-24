import { afterEach, describe, expect, it, vi } from 'vitest'

import { runWithRequestId } from '@/shared/observability/request-id'
import { logger } from './logger'

/**
 * Launch fix plan item 3: the redaction and the request id are the logger's
 * job now, not each call site's. Vitest runs with NODE_ENV=test, so the logger
 * writes the production JSON shape.
 */

afterEach(() => vi.restoreAllMocks())

function captureLines(run: () => void): Array<Record<string, unknown>> {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  run()
  return log.mock.calls.map(([line]) => JSON.parse(String(line)))
}

describe('logger', () => {
  it('writes a forced error as exactly one redacted line carrying the request id', () => {
    const error = new Error('lookup failed for reader@example.com')

    const lines = captureLines(() =>
      runWithRequestId('req-forced-0001', () =>
        logger.error('Checkout failed for reader@example.com', {
          error,
          headers: { cookie: 'better-auth.session_token=abc', authorization: 'Bearer abcdefghijkl' },
          stripeSignature: 't=1700000000,v1=0123456789abcdef0123',
          email: 'reader@example.com',
        }),
      ),
    )

    expect(lines).toHaveLength(1)
    const [line] = lines
    expect(line.level).toBe('error')
    expect(line.requestId).toBe('req-forced-0001')
    expect(line.message).toBe('Checkout failed for [email]')
    expect(line.email).toBe('[redacted]')
    expect(line.stripeSignature).toBe('[redacted]')
    expect(line.headers).toEqual({ cookie: '[redacted]', authorization: '[redacted]' })
    expect((line.error as { message: string }).message).toBe('lookup failed for [email]')

    const raw = JSON.stringify(line)
    expect(raw).not.toContain('reader@example.com')
    expect(raw).not.toContain('abcdefghijkl')
    expect(raw).not.toContain('session_token=abc')
  })

  it('writes no request id outside a request', () => {
    const [line] = captureLines(() => logger.info('Server starting'))
    expect(line).not.toHaveProperty('requestId')
  })
})
