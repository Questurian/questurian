import { afterEach, describe, expect, it, vi } from 'vitest'

import { REDACTED, REDACTED_EMAIL, isSensitiveKey, redact, redactString } from './redact'

describe('redactString', () => {
  it.each([
    ['email', 'no account for Reader.Name+tag@example.co.uk', `no account for ${REDACTED_EMAIL}`],
    ['bearer', 'Authorization: Bearer abcdefgh12345678', `Authorization: Bearer ${REDACTED}`],
    ['stripe secret', `key ${['sk', 'live', 'abcdefgh1234'].join('_')} rejected`, `key ${REDACTED} rejected`],
    ['stripe restricted', ['rk', 'test', 'abcdefgh1234'].join('_'), REDACTED],
    ['webhook secret', `${['whsec', 'abcdefgh1234'].join('_')}`, REDACTED],
    ['stripe signature', 't=1700000000,v1=0123456789abcdef0123456789abcdef', REDACTED],
    ['resend key', ['re', 'abcdefgh', 'ijklmnop'].join('_'), REDACTED],
    ['url credentials', 'postgres://app:hunter2@db.example.com/questura', `postgres://${REDACTED}@db.example.com/questura`],
    [
      'session cookie pair',
      'cookie: better-auth.session_token=abc.def; theme=dark',
      `cookie: better-auth.session_token=${REDACTED}; theme=dark`,
    ],
    ['secure session cookie', '__Secure-better-auth.session_token=xyz', `__Secure-better-auth.session_token=${REDACTED}`],
    ['payload token', 'payload-token=eyJhbGciOi', `payload-token=${REDACTED}`],
  ])('removes a %s', (_name, input, expected) => {
    expect(redactString(input)).toBe(expected)
  })

  it('leaves ordinary text alone', () => {
    const text = 'GET /api/public/articles/rome-guide 500 in 120ms (release abc123)'
    expect(redactString(text)).toBe(text)
  })
})

describe('isSensitiveKey', () => {
  it.each(['cookie', 'Cookie', 'set-cookie', 'Set-Cookie', 'authorization', 'stripe-signature', 'password',
    'newPassword', 'token', 'sessionToken', 'renderToken', 'clientSecret', 'email', 'userEmail', 'x-api-key', 'apiKey'])(
    'treats %s as sensitive',
    (key) => expect(isSensitiveKey(key)).toBe(true),
  )

  it.each(['status', 'path', 'requestId', 'from', 'to', 'digest', 'emailVerified_at_count'])(
    'leaves %s alone',
    (key) => expect(isSensitiveKey(key)).toBe(false),
  )
})

describe('redact', () => {
  it('removes sensitive keys whole, at any depth, and redacts strings everywhere else', () => {
    const input = {
      path: '/api/me',
      headers: { cookie: 'a=b', authorization: 'Basic abc', 'stripe-signature': 't=1,v1=2', 'user-agent': 'x' },
      visitor: { email: 'reader@example.com', note: 'wrote from reader@example.com' },
      list: [{ password: 'hunter2' }, 'mail me at a@b.io'],
    }

    expect(redact(input)).toEqual({
      path: '/api/me',
      headers: { cookie: REDACTED, authorization: REDACTED, 'stripe-signature': REDACTED, 'user-agent': 'x' },
      visitor: { email: REDACTED, note: `wrote from ${REDACTED_EMAIL}` },
      list: [{ password: REDACTED }, `mail me at ${REDACTED_EMAIL}`],
    })
  })

  it('keeps booleans and numbers under sensitive names', () => {
    expect(redact({ hasSecret: true, tokenCount: 3 })).toEqual({ hasSecret: true, tokenCount: 3 })
  })

  it('does not mutate its input', () => {
    const input = { cookie: 'a=b', nested: { email: 'x@y.io' } }
    redact(input)
    expect(input).toEqual({ cookie: 'a=b', nested: { email: 'x@y.io' } })
  })

  it('turns an Error into its redacted name, message, stack and digest', () => {
    const error = Object.assign(new Error('no account for reader@example.com'), { digest: '123456' })
    const out = redact({ error }) as unknown as { error: Record<string, unknown> }

    expect(out.error.name).toBe('Error')
    expect(out.error.message).toBe(`no account for ${REDACTED_EMAIL}`)
    expect(out.error.digest).toBe('123456')
    expect(String(out.error.stack)).not.toContain('reader@example.com')
    // An Error would otherwise serialise as {}.
    expect(JSON.stringify(out)).toContain(REDACTED_EMAIL)
  })

  it('redacts Headers objects by name', () => {
    const headers = new Headers({ cookie: 'a=b', 'x-request-id': 'req-12345678' })
    expect(redact({ headers })).toEqual({ headers: { cookie: REDACTED, 'x-request-id': 'req-12345678' } })
  })

  it('survives cycles and very deep objects', () => {
    const cyclic: Record<string, unknown> = { name: 'loop' }
    cyclic.self = cyclic
    expect(redact(cyclic)).toEqual({ name: 'loop', self: '[circular]' })

    let deep: Record<string, unknown> = { leaf: true }
    for (let i = 0; i < 20; i++) deep = { child: deep }
    expect(JSON.stringify(redact(deep))).toContain('[truncated]')
  })
})

/**
 * The origin secret (ADR-0016, launch fix plan item 10). `proxy.ts` strips
 * the header before any route runs; these are the locks behind that one.
 */
describe('the origin secret', () => {
  const SECRET = 'origin-secret-for-tests-0123456789abcdef'

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is removed by header name, in any spelling', () => {
    for (const key of ['x-questura-origin-auth', 'X-Questura-Origin-Auth', 'x_questura_origin_auth', 'originAuth']) {
      expect(isSensitiveKey(key), key).toBe(true)
    }
    const headers = new Headers({ 'x-questura-origin-auth': SECRET, 'user-agent': 'curl' })
    expect(redact(headers)).toEqual({ 'x-questura-origin-auth': REDACTED, 'user-agent': 'curl' })
    expect(redact({ headers: { 'X-Questura-Origin-Auth': SECRET } })).toEqual({ headers: { 'X-Questura-Origin-Auth': REDACTED } })
  })

  it('is removed when the header is written into a message', () => {
    expect(redactString(`forwarded with x-questura-origin-auth: ${SECRET} and more`)).toBe(
      `forwarded with x-questura-origin-auth: ${REDACTED} and more`,
    )
    expect(redactString(`{"x-questura-origin-auth":"${SECRET}"}`)).toBe(`{"x-questura-origin-auth":"${REDACTED}"}`)
  })

  it('is removed by value wherever it appears, once configured', () => {
    vi.stubEnv('ORIGIN_AUTH_SECRET', SECRET)
    expect(redactString(`fetch failed: ${SECRET}`)).toBe(`fetch failed: ${REDACTED}`)
    expect(redact({ message: `a${SECRET}b`, nested: [`${SECRET}`] })).toEqual({ message: `a${REDACTED}b`, nested: [REDACTED] })
  })

  it('does not treat a short configured value as something to hunt for', () => {
    vi.stubEnv('ORIGIN_AUTH_SECRET', 'a')
    expect(redactString('a banana')).toBe('a banana')
  })
})
