import { describe, expect, it } from 'vitest'

import { edgeOriginFromIp, isLocalHost, parseOptions, sessionCookieHeader } from './options'

/**
 * Which checks `launch:verify` may leave out (launch fix plan item 6).
 * Against the real site: none of the lockdown or rate-limit checks. `--local`
 * lifts that, and only for this machine.
 */

const REAL = ['--client', 'https://www.questurian.com', '--api', 'https://api.questurian.com']
const ALL = [...REAL, '--bypass', 'https://questura.up.railway.app', '--edge-ip', '203.0.113.9', '--rate-limit-probe']
const SANDBOX = ['--client', 'http://app.readiness.localhost:3100', '--api', 'http://api.readiness.localhost:4100', '--allow-http']

const parse = (argv: string[], env: Record<string, string | undefined> = {}) => parseOptions(argv, env)
const error = (argv: string[], env: Record<string, string | undefined> = {}) => {
  const parsed = parse(argv, env)
  return 'error' in parsed ? parsed.error : null
}
const target = (argv: string[], env: Record<string, string | undefined> = {}) => {
  const parsed = parse(argv, env)
  if ('error' in parsed) throw new Error(parsed.error)
  return parsed.target
}

describe('launch:verify options', () => {
  it('runs against the real site with every required flag', () => {
    const t = target(ALL)
    expect(t.bypassOrigin).toBe('https://questura.up.railway.app')
    expect(t.originEdge).toBe('https://203.0.113.9')
    expect(t.rateLimitProbe).toBe(true)
    expect(t.imageCheck).toBe(true)
    expect(t.cookie).toBeUndefined()
  })

  it.each([
    ['--bypass', ['--bypass', 'https://questura.up.railway.app']],
    ['--edge-ip', ['--edge-ip', '203.0.113.9']],
    ['--rate-limit-probe', ['--rate-limit-probe']],
  ])('refuses the real site without %s', (flag, pair) => {
    const argv = ALL.filter((value, index) => {
      const at = ALL.indexOf(pair[0]!)
      return index < at || index >= at + pair.length
    })
    expect(error(argv)).toMatch(new RegExp(`missing .*${flag.replace(/-/g, '\\-')}`))
    expect(error(argv)).toContain('all-green')
  })

  it('names every missing flag at once', () => {
    const message = error(REAL)!
    expect(message).toContain('--bypass')
    expect(message).toContain('--edge-ip')
    expect(message).toContain('--rate-limit-probe')
  })

  it('accepts --origin-edge in place of --edge-ip, but not both', () => {
    const withOrigin = [...REAL, '--bypass', 'https://b.up.railway.app', '--origin-edge', 'https://edge.up.railway.app/', '--rate-limit-probe']
    expect(target(withOrigin).originEdge).toBe('https://edge.up.railway.app')
    expect(error([...withOrigin, '--edge-ip', '203.0.113.9'])).toMatch(/give one/)
  })

  it('--local lets the sandbox leave them out', () => {
    const t = target([...SANDBOX, '--local', '--no-image-check'])
    expect(t.bypassOrigin).toBeUndefined()
    expect(t.originEdge).toBeUndefined()
    expect(t.rateLimitProbe).toBe(false)
    expect(t.imageCheck).toBe(false)
  })

  it('--local still runs whatever is given', () => {
    const t = target([...SANDBOX, '--local', '--bypass', 'http://127.0.0.1:4110', '--edge-ip', '127.0.0.1:4110'])
    expect(t.bypassOrigin).toBe('http://127.0.0.1:4110')
    expect(t.originEdge).toBe('http://127.0.0.1:4110')
  })

  it('--media names the sandbox media server, only with --local and only on this machine', () => {
    expect(target([...SANDBOX, '--local', '--media', 'http://media.readiness.localhost:3190']).mediaHost).toBe('media.readiness.localhost:3190')
    expect(target([...SANDBOX, '--local']).mediaHost).toBeUndefined()
    expect(error([...ALL, '--media', 'http://media.readiness.localhost:3190'])).toMatch(/--media is for the readiness sandbox only/)
    expect(error([...SANDBOX, '--local', '--media', 'https://questurian-cdn.b-cdn.net'])).toMatch(/refused for/)
  })

  it('the sandbox without --local is held to the same rule as the real site', () => {
    expect(error(SANDBOX)).toMatch(/missing/)
  })

  it.each([
    [['--client', 'https://www.questurian.com', '--api', 'http://api.readiness.localhost:4100']],
    [['--client', 'http://app.readiness.localhost:3100', '--api', 'https://api.questurian.com']],
    [['--client', 'http://localhost.questurian.com', '--api', 'http://127.0.0.1:4100']],
  ])('refuses --local for any host that is not this machine: %j', (argv) => {
    expect(error([...argv, '--local'])).toMatch(/--local is for the readiness sandbox only/)
  })

  it('knows which hosts are this machine', () => {
    for (const host of ['localhost', 'api.readiness.localhost', '127.0.0.1', '127.1.2.3', '[::1]']) expect(isLocalHost(host)).toBe(true)
    for (const host of ['api.questurian.com', 'localhost.questurian.com', '10.0.0.1', '1127.0.0.1', 'x.up.railway.app']) expect(isLocalHost(host)).toBe(false)
  })

  describe('--edge-ip', () => {
    it.each([
      ['203.0.113.9', 'https://api.questurian.com', 'https://203.0.113.9'],
      ['203.0.113.9:8443', 'https://api.questurian.com', 'https://203.0.113.9:8443'],
      ['127.0.0.1:4110', 'http://api.readiness.localhost:4100', 'http://127.0.0.1:4110'],
      ['2001:db8::1', 'https://api.questurian.com', 'https://[2001:db8::1]'],
      ['[2001:db8::1]:443', 'https://api.questurian.com', 'https://[2001:db8::1]:443'],
    ])('%s with %s probes %s', (value, api, expected) => {
      expect(edgeOriginFromIp(value, api)).toBe(expected)
    })

    it.each(['edge.up.railway.app', 'https://203.0.113.9', '203.0.113', ''])('refuses %j: it wants an address', (value) => {
      expect(edgeOriginFromIp(value, 'https://api.questurian.com')).toEqual({ error: expect.stringContaining('--edge-ip wants an IP address') })
    })

    it('is refused on the command line the same way', () => {
      expect(error([...REAL, '--bypass', 'https://b.test', '--edge-ip', 'edge.example', '--rate-limit-probe'])).toMatch(/wants an IP address/)
    })
  })

  describe('LAUNCH_VERIFY_COOKIE', () => {
    it('takes the value DevTools shows, a name=value pair, or a whole Cookie header, and keeps only the session token', () => {
      expect(sessionCookieHeader('tok.sig')).toBe('__Secure-questura_visitor.session_token=tok.sig')
      expect(sessionCookieHeader('tok.c2ln%3D')).toBe('__Secure-questura_visitor.session_token=tok.c2ln%3D')
      expect(sessionCookieHeader('tok.c2ln==')).toBe('__Secure-questura_visitor.session_token=tok.c2ln==')
      expect(sessionCookieHeader('__Secure-questura_visitor.session_token=tok.sig')).toBe('__Secure-questura_visitor.session_token=tok.sig')
      expect(sessionCookieHeader('questura_visitor.session_token=tok.sig')).toBe('questura_visitor.session_token=tok.sig')
      expect(
        sessionCookieHeader('theme=dark; __Secure-questura_visitor.session_data=cache; __Secure-questura_visitor.session_token=tok.sig'),
      ).toBe('__Secure-questura_visitor.session_token=tok.sig')
    })

    it('refuses a cookie header without the session token', () => {
      expect(sessionCookieHeader('theme=dark; __Secure-questura_visitor.session_data=cache')).toEqual({ error: expect.stringContaining('no __Secure-questura_visitor.session_token') })
      expect(sessionCookieHeader('   ')).toEqual({ error: 'LAUNCH_VERIFY_COOKIE is empty' })
    })

    it('needs LAUNCH_VERIFY_COOKIE_MEMBER, so "the member flag is right" has an expected answer', () => {
      expect(error(ALL, { LAUNCH_VERIFY_COOKIE: 'tok.sig' })).toMatch(/LAUNCH_VERIFY_COOKIE_MEMBER=yes or no/)
      expect(error(ALL, { LAUNCH_VERIFY_COOKIE: 'tok.sig', LAUNCH_VERIFY_COOKIE_MEMBER: 'maybe' })).toMatch(/yes or no/)
      expect(target(ALL, { LAUNCH_VERIFY_COOKIE: 'tok.sig', LAUNCH_VERIFY_COOKIE_MEMBER: 'yes' }).cookie).toEqual({
        header: '__Secure-questura_visitor.session_token=tok.sig',
        member: true,
      })
      expect(target(ALL, { LAUNCH_VERIFY_COOKIE: 'tok.sig', LAUNCH_VERIFY_COOKIE_MEMBER: 'No' }).cookie?.member).toBe(false)
    })
  })
})
