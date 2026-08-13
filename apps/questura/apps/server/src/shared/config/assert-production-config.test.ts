import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function load(env: Record<string, string>) {
  vi.resetModules()
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value)
  }
  return import('./assert-production-config')
}

const VALID_PRODUCTION_ENV = {
  NODE_ENV: 'production',
  NEXT_PUBLIC_APP_URL: 'https://questurian.com',
  BACKEND_URL_LOCAL: 'https://api.questurian.com',
  CORS_ALLOWED_ORIGINS: 'https://questurian.com',
  REDIS_URL: 'redis://cache.internal:6379',
  PAYLOAD_COOKIE_DOMAIN: 'questurian.com',
}

describe('production config assertion', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    vi.stubEnv('NEXT_PUBLIC_FRONTEND_URL', '')
    vi.stubEnv('BACKEND_URL_LOCAL', '')
    vi.stubEnv('CORS_ALLOWED_ORIGINS', '')
    vi.stubEnv('REDIS_URL', '')
    vi.stubEnv('PAYLOAD_COOKIE_DOMAIN', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('is a no-op outside production, even with nothing configured', async () => {
    const { assertProductionConfig, collectProductionConfigProblems } = await load({
      NODE_ENV: 'development',
    })

    expect(collectProductionConfigProblems()).toEqual([])
    expect(() => assertProductionConfig()).not.toThrow()
  })

  it('passes on a correctly configured production environment', async () => {
    const { assertProductionConfig, collectProductionConfigProblems } =
      await load(VALID_PRODUCTION_ENV)

    expect(collectProductionConfigProblems()).toEqual([])
    expect(() => assertProductionConfig()).not.toThrow()
  })

  it('rejects a production boot with no app url', async () => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      NEXT_PUBLIC_APP_URL: '',
    })

    expect(collectProductionConfigProblems().join('\n')).toContain('NEXT_PUBLIC_APP_URL is not set')
  })

  it('rejects a production boot with no backend url', async () => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      BACKEND_URL_LOCAL: '',
    })

    expect(collectProductionConfigProblems().join('\n')).toContain('BACKEND_URL_LOCAL is not set')
  })

  it.each(['not-a-url', 'ftp://cms.questurian.com'])(
    'rejects malformed or unsupported production URL %s',
    async (url) => {
      const { collectProductionConfigProblems } = await load({
        ...VALID_PRODUCTION_ENV,
        BACKEND_URL_LOCAL: url,
      })

      expect(collectProductionConfigProblems().join('\n')).toMatch(/not a valid URL|must use http/)
    }
  )

  it.each([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://localhost:3000',
  ])('rejects %s as a production app url', async (url) => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      NEXT_PUBLIC_APP_URL: url,
    })

    expect(collectProductionConfigProblems().join('\n')).toContain('points at localhost')
  })

  it('rejects an empty CORS origin list in production', async () => {
    const { collectProductionConfigProblems } = await load({
      NODE_ENV: 'production',
      NEXT_PUBLIC_APP_URL: '',
      BACKEND_URL_LOCAL: 'https://api.questurian.com',
      CORS_ALLOWED_ORIGINS: '',
    })

    expect(collectProductionConfigProblems().join('\n')).toContain('No CORS origins configured')
  })

  it('rejects a production boot with no shared rate-limit backend', async () => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      REDIS_URL: '',
    })

    expect(collectProductionConfigProblems().join('\n')).toContain('REDIS_URL is not set')
  })

  it('rejects a production boot with no session cookie domain decision', async () => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      PAYLOAD_COOKIE_DOMAIN: '',
    })

    expect(collectProductionConfigProblems().join('\n')).toContain(
      'PAYLOAD_COOKIE_DOMAIN is not set'
    )
  })

  it('accepts a deliberate host-only deployment', async () => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      PAYLOAD_COOKIE_DOMAIN: 'host-only',
    })

    expect(collectProductionConfigProblems()).toEqual([])
  })

  it.each([
    ['https://questurian.com', 'not a URL'],
    ['questurian.com:4000', 'port'],
    ['localhost', 'single-label'],
  ])('rejects %s as a session cookie domain', async (domain, expected) => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      PAYLOAD_COOKIE_DOMAIN: domain,
    })

    const problems = collectProductionConfigProblems().join('\n')
    expect(problems).toContain('PAYLOAD_COOKIE_DOMAIN')
    expect(problems).toContain(expected)
  })

  it('rejects a cookie domain that the Payload host cannot set', async () => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      BACKEND_URL_LOCAL: 'https://cms.questurian.com',
      PAYLOAD_COOKIE_DOMAIN: 'staging.questurian.com',
    })

    expect(collectProductionConfigProblems().join('\n')).toContain(
      'does not domain-match the Payload host (cms.questurian.com)'
    )
  })

  it('reports every problem at once rather than one per boot', async () => {
    const { collectProductionConfigProblems } = await load({
      NODE_ENV: 'production',
      NEXT_PUBLIC_APP_URL: '',
      BACKEND_URL_LOCAL: '',
      CORS_ALLOWED_ORIGINS: '',
    })

    expect(collectProductionConfigProblems().length).toBeGreaterThanOrEqual(3)
  })

  it('throws a message naming each problem', async () => {
    const { assertProductionConfig } = await load({
      NODE_ENV: 'production',
      NEXT_PUBLIC_APP_URL: '',
      BACKEND_URL_LOCAL: '',
      CORS_ALLOWED_ORIGINS: '',
    })

    expect(() => assertProductionConfig()).toThrow(/Refusing to boot/)
    expect(() => assertProductionConfig()).toThrow(/NEXT_PUBLIC_APP_URL/)
    expect(() => assertProductionConfig()).toThrow(/BACKEND_URL_LOCAL/)
  })
})
