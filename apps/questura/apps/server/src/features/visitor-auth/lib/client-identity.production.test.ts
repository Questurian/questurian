import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * Better Auth's limiter, in production mode, fed a caller the proxy did not
 * identify. Runs `production-rate-limit.fixture.ts` in a child process because
 * Better Auth fixes `NODE_ENV` when it loads, and vitest's is `test` — where
 * Better Auth quietly substitutes `127.0.0.1` and the gap never shows.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const SERVER_ROOT = resolve(HERE, '../../../..')

type FixtureResult = {
  nodeEnv: string
  limit: number
  proxyHeaderMissing: number[]
  proxyHeaderJunk: number[]
  routedMissing: number[]
  routedJunk: number[]
  routedForged: number[]
}

function runFixture(): FixtureResult {
  const stdout = execFileSync(
    resolve(SERVER_ROOT, 'node_modules/.bin/tsx'),
    [resolve(HERE, 'production-rate-limit.fixture.ts')],
    {
      cwd: SERVER_ROOT,
      encoding: 'utf8',
      timeout: 60_000,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        TRUSTED_PROXY: 'cloudflare',
        REDIS_URL: '',
        VITEST: '',
        TEST: '',
      },
    },
  )
  return JSON.parse(stdout.trim().split('\n').at(-1)!) as FixtureResult
}

describe('Better Auth rate limit in production', () => {
  const result = runFixture()

  it('really ran in production mode', () => {
    expect(result.nodeEnv).toBe('production')
  })

  // The gap, pinned. If this starts failing after a Better Auth upgrade, the
  // library stopped skipping unidentified callers: re-read
  // `client-identity.ts` before deleting anything.
  it('skips its limiter when it reads the proxy header and the header is missing or junk', () => {
    expect(result.proxyHeaderMissing).not.toContain(429)
    expect(result.proxyHeaderJunk).not.toContain(429)
  })

  it('limits a caller with no proxy header once the route names the caller', () => {
    const { limit, routedMissing } = result

    expect(routedMissing.slice(0, limit).every((status) => status === 401)).toBe(true)
    expect(routedMissing.slice(limit).every((status) => status === 429)).toBe(true)
  })

  // Same instance, same shared bucket, already spent above: a junk proxy
  // header or a forged identity header does not buy a fresh one.
  it('puts junk and forged identities in that same shared bucket', () => {
    expect(result.routedJunk.every((status) => status === 429)).toBe(true)
    expect(result.routedForged.every((status) => status === 429)).toBe(true)
  })
})
