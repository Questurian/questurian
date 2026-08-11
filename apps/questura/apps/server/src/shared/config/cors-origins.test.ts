import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `shared/config` reads `process.env` at module load, so each case has to stub
 * the environment and then re-import the module.
 */
async function loadOrigins(env: Record<string, string | undefined>) {
  vi.resetModules()
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      vi.stubEnv(key, '')
    } else {
      vi.stubEnv(key, value)
    }
  }
  const { APP_CONFIG } = await import('./index')
  return APP_CONFIG.CORS_ORIGINS
}

const LOCALHOST_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:3004',
  'http://localhost:4000',
]

describe('CORS origin allowlist', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    vi.stubEnv('NEXT_PUBLIC_FRONTEND_URL', '')
    vi.stubEnv('CORS_ALLOWED_ORIGINS', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('includes localhost origins outside production', async () => {
    const origins = await loadOrigins({ NODE_ENV: 'development' })
    for (const localhost of LOCALHOST_ORIGINS) {
      expect(origins).toContain(localhost)
    }
  })

  it('excludes every localhost origin in production', async () => {
    const origins = await loadOrigins({
      NODE_ENV: 'production',
      CORS_ALLOWED_ORIGINS: 'https://questurian.com,https://www.questurian.com',
    })

    expect(origins).toEqual(['https://questurian.com', 'https://www.questurian.com'])
    expect(origins.some((origin) => origin.includes('localhost'))).toBe(false)
  })

  it('does not fall back to localhost in production when app url is unset', async () => {
    const origins = await loadOrigins({
      NODE_ENV: 'production',
      CORS_ALLOWED_ORIGINS: 'https://questurian.com',
    })

    expect(origins).not.toContain('http://localhost:3000')
  })

  it('strips trailing slashes so entries can match an Origin header', async () => {
    const origins = await loadOrigins({
      NODE_ENV: 'production',
      NEXT_PUBLIC_APP_URL: 'https://questurian.com/',
    })

    expect(origins).toContain('https://questurian.com')
    expect(origins).not.toContain('https://questurian.com/')
  })

  it('trims whitespace around comma-separated origins', async () => {
    const origins = await loadOrigins({
      NODE_ENV: 'production',
      CORS_ALLOWED_ORIGINS: 'https://a.example.com , https://b.example.com',
    })

    expect(origins).toEqual(['https://a.example.com', 'https://b.example.com'])
  })

  it('deduplicates origins arriving from several env vars', async () => {
    const origins = await loadOrigins({
      NODE_ENV: 'production',
      NEXT_PUBLIC_APP_URL: 'https://questurian.com',
      NEXT_PUBLIC_FRONTEND_URL: 'https://questurian.com',
      CORS_ALLOWED_ORIGINS: 'https://questurian.com',
    })

    expect(origins).toEqual(['https://questurian.com'])
  })

  it('keeps configured origins alongside localhost in development', async () => {
    const origins = await loadOrigins({
      NODE_ENV: 'development',
      CORS_ALLOWED_ORIGINS: 'https://staging.questurian.com',
    })

    expect(origins).toContain('https://staging.questurian.com')
    expect(origins).toContain('http://localhost:3000')
  })
})
