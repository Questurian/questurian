import { describe, expect, it } from 'vitest'
import {
  HOST_ONLY_COOKIE_DOMAIN,
  readCookieDomain,
  readRequiredCookieHosts,
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

describe('required staff cookie hosts', () => {
  it('reads a comma-separated list, normalized and de-duplicated', () => {
    expect(
      readRequiredCookieHosts(' CMS.questurian.com , www.questurian.com,cms.questurian.com. ')
    ).toEqual(['cms.questurian.com', 'www.questurian.com'])
  })

  it('reads an unset or empty list as no required hosts', () => {
    expect(readRequiredCookieHosts(undefined)).toEqual([])
    expect(readRequiredCookieHosts(' , ,')).toEqual([])
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

  const OPERATOR_HOSTS = [
    'cms.questurian.com',
    'www.questurian.com',
    'abw.questurian.com',
    'abw-api.questurian.com',
  ]

  it.each(['questurian.com', '.questurian.com'])(
    'accepts %s, which reaches every operator host',
    (domain) => {
      expect(validateCookieDomain(domain, OPERATOR_HOSTS)).toBeNull()
    }
  )

  // The bug this replaced: a domain equal to Payload's own host is
  // self-consistent and still never reaches a sibling, so staff auth on the AI
  // Blog Writer fails as an unexplained 401.
  it('rejects the Payload host itself and names the hosts left out', () => {
    const problem = validateCookieDomain('cms.questurian.com', OPERATOR_HOSTS)

    expect(problem).toContain('www.questurian.com')
    expect(problem).toContain('abw.questurian.com')
    expect(problem).toContain('abw-api.questurian.com')
    expect(problem).not.toContain('cms.questurian.com')
  })

  it.each(['vercel.app', 'pages.dev', 'trycloudflare.com', 'co.uk'])(
    'rejects %s, a public suffix browsers refuse to store',
    (domain) => {
      expect(validateCookieDomain(domain, [`app.${domain}`])).toContain('public suffix')
    }
  )

  it('rejects a domain that covers only some required hosts', () => {
    expect(validateCookieDomain('abw.questurian.com', OPERATOR_HOSTS)).toContain(
      'cms.questurian.com'
    )
  })

  it('accepts a domain equal to a host that is a parent of the others', () => {
    expect(
      validateCookieDomain('cms.questurian.com', ['cms.questurian.com', 'abw.cms.questurian.com'])
    ).toBeNull()
  })

  it('rejects an unrelated registrable domain', () => {
    expect(validateCookieDomain('example.com', OPERATOR_HOSTS)).toContain('cms.questurian.com')
  })

  it('ignores case and a trailing root dot in required hosts', () => {
    expect(validateCookieDomain('questurian.com', ['CMS.Questurian.com.'])).toBeNull()
  })
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
