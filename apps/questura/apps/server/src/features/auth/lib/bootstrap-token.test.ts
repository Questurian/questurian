import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function load(env: Record<string, string>) {
  vi.resetModules()
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value)
  }
  return import('./bootstrap-token')
}

function reqWithHeader(value: string | null) {
  return {
    headers: {
      get: (name: string) => (name === 'x-bootstrap-token' ? value : null),
    },
  }
}

describe('bootstrap token', () => {
  beforeEach(() => {
    vi.stubEnv('BOOTSTRAP_ADMIN_TOKEN', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
    vi.restoreAllMocks()
  })

  describe('token unset', () => {
    it('allows bootstrap in development, leaving local setup unchanged', async () => {
      const { isBootstrapRequestAuthorized } = await load({ NODE_ENV: 'development' })

      expect(isBootstrapRequestAuthorized({ req: reqWithHeader(null) })).toBe(true)
    })

    it('refuses bootstrap in production and explains how to enable it', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { isBootstrapRequestAuthorized } = await load({ NODE_ENV: 'production' })

      expect(isBootstrapRequestAuthorized({ req: reqWithHeader(null) })).toBe(false)
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining('BOOTSTRAP_ADMIN_TOKEN is not set')
      )
    })
  })

  describe('token set', () => {
    const ENV = { NODE_ENV: 'production', BOOTSTRAP_ADMIN_TOKEN: 'correct-horse-battery' }

    it('accepts a matching header', async () => {
      const { isBootstrapRequestAuthorized } = await load(ENV)

      expect(
        isBootstrapRequestAuthorized({ req: reqWithHeader('correct-horse-battery') })
      ).toBe(true)
    })

    it('accepts a matching token on the create payload', async () => {
      const { isBootstrapRequestAuthorized } = await load(ENV)

      expect(
        isBootstrapRequestAuthorized({
          req: reqWithHeader(null),
          data: { bootstrapToken: 'correct-horse-battery' },
        })
      ).toBe(true)
    })

    it('rejects a wrong token', async () => {
      const { isBootstrapRequestAuthorized } = await load(ENV)

      expect(isBootstrapRequestAuthorized({ req: reqWithHeader('wrong') })).toBe(false)
    })

    it('rejects a token of the right length but wrong value', async () => {
      const { isBootstrapRequestAuthorized } = await load(ENV)

      expect(
        isBootstrapRequestAuthorized({ req: reqWithHeader('correct-horse-batterX') })
      ).toBe(false)
    })

    it('rejects a missing token', async () => {
      const { isBootstrapRequestAuthorized } = await load(ENV)

      expect(isBootstrapRequestAuthorized({ req: reqWithHeader(null) })).toBe(false)
      expect(isBootstrapRequestAuthorized({})).toBe(false)
    })

    it('is enforced in development too, so the flow can be rehearsed locally', async () => {
      const { isBootstrapRequestAuthorized } = await load({
        NODE_ENV: 'development',
        BOOTSTRAP_ADMIN_TOKEN: 'correct-horse-battery',
      })

      expect(isBootstrapRequestAuthorized({ req: reqWithHeader(null) })).toBe(false)
      expect(
        isBootstrapRequestAuthorized({ req: reqWithHeader('correct-horse-battery') })
      ).toBe(true)
    })

    it('ignores surrounding whitespace on both sides', async () => {
      const { isBootstrapRequestAuthorized } = await load({
        NODE_ENV: 'production',
        BOOTSTRAP_ADMIN_TOKEN: '  correct-horse-battery  ',
      })

      expect(
        isBootstrapRequestAuthorized({ req: reqWithHeader(' correct-horse-battery ') })
      ).toBe(true)
    })
  })
})
