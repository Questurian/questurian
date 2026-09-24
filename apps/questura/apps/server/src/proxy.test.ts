import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'

import { proxy } from './proxy'

/**
 * The request id goes in (forwarded to the route, where the logger and the
 * error reporter read it) and out (on the response). NextResponse.next()
 * carries forwarded request headers as `x-middleware-request-*`.
 */

function run(headers: Record<string, string> = {}) {
  const response = proxy(new NextRequest('http://localhost:4000/api/me', { headers }))
  return {
    echoed: response.headers.get('x-request-id'),
    forwarded: response.headers.get('x-middleware-request-x-request-id'),
    overridden: response.headers.get('x-middleware-override-headers') ?? '',
  }
}

describe('proxy request id', () => {
  it("keeps a well-formed id from the caller, forwards it and echoes it", () => {
    const { echoed, forwarded, overridden } = run({ 'x-request-id': '8b3c1f2a9d0e1f23-LHR' })
    expect(echoed).toBe('8b3c1f2a9d0e1f23-LHR')
    expect(forwarded).toBe('8b3c1f2a9d0e1f23-LHR')
    expect(overridden.split(',')).toContain('x-request-id')
  })

  it('makes a new id when there is none', () => {
    const { echoed, forwarded } = run()
    expect(echoed).toMatch(/^[0-9a-f-]{36}$/)
    expect(forwarded).toBe(echoed)
  })

  it('replaces a malformed id rather than logging it', () => {
    const { echoed } = run({ 'x-request-id': 'no good' })
    expect(echoed).not.toBe('no good')
    expect(echoed).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('keeps the rest of the request headers', () => {
    const response = proxy(
      new NextRequest('http://localhost:4000/api/me', { headers: { cookie: 'a=b', origin: 'http://localhost:3000' } }),
    )
    expect(response.headers.get('x-middleware-request-cookie')).toBe('a=b')
    expect(response.headers.get('x-middleware-request-origin')).toBe('http://localhost:3000')
  })
})
