import { describe, expect, it } from 'vitest'
import {
  HOST_ONLY_COOKIE_DOMAIN,
  readCookieDomain,
  resolveSessionCookieConfig,
  validateCookieDomain,
} from './session-cookie'

describe('session cookie domain parsing', () => {
  it('treats an unset or blank variable as no domain', () => {
    expect(readCookieDomain(undefined)).toBeUndefined()
    expect(readCookieDomain('')).toBeUndefined()
    expect(readCookieDomain('   ')).toBeUndefined()
  })

  it('reads the host-only sentinel as no domain', () => {
    expect(readCookieDomain(HOST_ONLY_COOKIE_DOMAIN)).toBeUndefined()
    expect(readCookieDomain('  HOST-ONLY  ')).toBeUndefined()
  })

  it('trims a configured domain', () => {
    expect(readCookieDomain('  questurian.com  ')).toBe('questurian.com')
  })

  it('keeps a leading dot, which RFC 6265 ignores', () => {
    expect(readCookieDomain('.questurian.com')).toBe('.questurian.com')
  })
})

describe('session cookie domain validation', () => {
  it.each(['questurian.com', '.questurian.com', 'staging.questurian.com'])(
    'accepts %s',
    (domain) => {
      expect(validateCookieDomain(domain)).toBeNull()
    }
  )

  it('rejects a URL rather than a bare host', () => {
    expect(validateCookieDomain('https://questurian.com')).toContain('not a URL')
  })

  it('rejects a port, which a Domain attribute cannot carry', () => {
    expect(validateCookieDomain('questurian.com:4000')).toContain('port')
  })

  it('rejects a path', () => {
    expect(validateCookieDomain('questurian.com/cms')).toContain('path')
  })

  it('rejects localhost, which browsers refuse as a cookie Domain', () => {
    expect(validateCookieDomain('localhost')).toContain('single-label')
  })

  it('rejects an IP address', () => {
    expect(validateCookieDomain('127.0.0.1')).toContain('IP address')
  })

  it.each(['-questurian.com', 'questurian-.com', 'questurian..com', 'questurian.com.'])(
    'rejects invalid hostname labels in %s',
    (domain) => {
      expect(validateCookieDomain(domain)).toContain('valid hostname labels')
    }
  )

  it.each(['questurian.com', '.questurian.com', 'cms.questurian.com'])(
    'accepts %s when Payload runs on cms.questurian.com',
    (domain) => {
      expect(validateCookieDomain(domain, 'cms.questurian.com')).toBeNull()
    }
  )

  it.each(['staging.questurian.com', 'example.com'])(
    'rejects %s when Payload runs on cms.questurian.com',
    (domain) => {
      expect(validateCookieDomain(domain, 'cms.questurian.com')).toContain(
        'does not domain-match'
      )
    }
  )
})

describe('session cookie config', () => {
  it('is host-only and insecure in development, so localhost can store it', () => {
    const config = resolveSessionCookieConfig({ isProduction: false, domain: undefined })

    expect(config).toEqual({ sameSite: 'Lax', secure: false })
    expect(config).not.toHaveProperty('domain')
  })

  it('scopes to the registrable domain and requires TLS in production', () => {
    expect(
      resolveSessionCookieConfig({ isProduction: true, domain: 'questurian.com' })
    ).toEqual({ sameSite: 'Lax', secure: true, domain: 'questurian.com' })
  })

  it('stays Lax rather than None — sibling subdomains are same-site', () => {
    expect(
      resolveSessionCookieConfig({ isProduction: true, domain: 'questurian.com' }).sameSite
    ).toBe('Lax')
  })

  it('omits domain entirely when host-only, rather than sending an empty one', () => {
    const config = resolveSessionCookieConfig({ isProduction: true, domain: undefined })

    expect(config).toEqual({ sameSite: 'Lax', secure: true })
    expect(Object.keys(config)).not.toContain('domain')
  })
})
