import { describe, expect, it } from 'vitest'

import { MAX_REPORT_BYTES, parseClientErrorReport } from './client-error-report'

const parse = (body: unknown) => parseClientErrorReport(JSON.stringify(body))

describe('parseClientErrorReport', () => {
  it('accepts a full report from the browser', () => {
    expect(
      parse({
        source: 'browser',
        boundary: 'global-error',
        message: 'Boom',
        path: '/rome',
        digest: '123456',
        requestId: '8b3c1f2a9d0e1f23-LHR',
        release: 'abc1234',
        stack: 'Error: Boom\n    at x (app.js:1:1)',
      }),
    ).toEqual({
      source: 'browser',
      boundary: 'global-error',
      message: 'Boom',
      path: '/rome',
      digest: '123456',
      requestId: '8b3c1f2a9d0e1f23-LHR',
      release: 'abc1234',
      stack: 'Error: Boom\n    at x (app.js:1:1)',
    })
  })

  it.each([
    ['not JSON', 'not json'],
    ['an array', '[]'],
    ['no source', JSON.stringify({ message: 'x' })],
    ['an unknown source', JSON.stringify({ source: 'server', message: 'x' })],
    ['no message', JSON.stringify({ source: 'browser' })],
    ['a blank message', JSON.stringify({ source: 'browser', message: '   ' })],
    ['an oversize body', JSON.stringify({ source: 'browser', message: 'x'.repeat(MAX_REPORT_BYTES) })],
  ])('refuses %s', (_name, raw) => {
    expect(parseClientErrorReport(raw)).toBeNull()
  })

  it('drops fields it cannot trust instead of passing them on', () => {
    expect(
      parse({
        source: 'worker',
        boundary: 'made-up',
        message: 'Boom',
        path: 'https://evil.example/x',
        digest: 'has spaces in it',
        requestId: 'bad\nid',
        release: '<script>',
      }),
    ).toEqual({ source: 'worker', boundary: 'unknown', message: 'Boom' })
  })

  it('caps long fields', () => {
    const report = parse({ source: 'browser', message: 'm'.repeat(2000), stack: 's'.repeat(5000) })!
    expect(report.message.length).toBeLessThanOrEqual(501)
    expect(report.stack!.length).toBeLessThanOrEqual(4001)
  })
})
