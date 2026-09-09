import { describe, it, expect, vi, afterEach } from 'vitest'

/**
 * The bypass exists so nobody hand-edits `RequireAuth` to look at a screen.
 * These tests are about the fence around it, not the convenience.
 */

async function loadWith(env: Record<string, unknown>) {
  vi.resetModules()
  vi.stubGlobal('import.meta', undefined)
  // Vite replaces `import.meta.env.*` at build time; under vitest it is a real
  // object, so the flags are set on it directly.
  Object.assign(import.meta.env, env)
  return await import('./dev-session')
}

const REAL_DEV = import.meta.env.DEV
const REAL_MODE = import.meta.env.MODE
const REAL_FLAG = import.meta.env.VITE_DEV_OFFLINE_LOGIN

afterEach(() => {
  Object.assign(import.meta.env, {
    DEV: REAL_DEV,
    MODE: REAL_MODE,
    VITE_DEV_OFFLINE_LOGIN: REAL_FLAG,
  })
  vi.unstubAllGlobals()
})

describe('the offline development session', () => {
  it('is nothing in a production build, even with the flag turned on', async () => {
    // The fence that matters. `import.meta.env.DEV` is a build-time literal,
    // so a production bundle cannot be talked into this by any env var.
    const { offlineDevSession } = await loadWith({
      DEV: false,
      VITE_DEV_OFFLINE_LOGIN: 'true',
    })
    expect(offlineDevSession()).toBeNull()
  })

  it('is nothing in development unless it is explicitly asked for', async () => {
    const { offlineDevSession } = await loadWith({
      DEV: true,
      MODE: 'development',
      VITE_DEV_OFFLINE_LOGIN: undefined,
    })
    expect(offlineDevSession()).toBeNull()
  })

  it('is not switched on by a value that merely looks true', async () => {
    for (const value of ['1', 'yes', 'TRUE', 'on', '']) {
      const { offlineDevSession } = await loadWith({
        DEV: true,
      MODE: 'development',
        VITE_DEV_OFFLINE_LOGIN: value,
      })
      expect(offlineDevSession(), `value ${JSON.stringify(value)}`).toBeNull()
    }
  })

  it('is nothing under vitest, so no suite depends on a local .env', async () => {
    // This is not hypothetical. Turning the flag on locally broke
    // AuthProvider.test.tsx, which asserts a signed-out visitor reaches the
    // login page.
    const { offlineDevSession } = await loadWith({
      DEV: true,
      MODE: 'test',
      VITE_DEV_OFFLINE_LOGIN: 'true',
    })
    expect(offlineDevSession()).toBeNull()
  })

  it('signs in a visibly fake user when every fence is down', async () => {
    const { offlineDevSession } = await loadWith({
      DEV: true,
      MODE: 'development',
      VITE_DEV_OFFLINE_LOGIN: 'true',
    })
    const session = offlineDevSession()
    expect(session).not.toBeNull()
    // Named so nobody reading a screenshot takes it for a real account.
    expect(session?.user.email).toContain('localhost.invalid')
    expect(session?.user.lastName).toContain('not a real login')
    expect(session?.expiresAt).toBeGreaterThan(Date.now())
  })
})
