import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * Better Auth's limiter, in production mode, fed a caller the proxy did not
 * identify. Runs `production-rate-limit.fixture.ts` in a child process because
 * Better Auth fixes `NODE_ENV` when it loads, and vitest's is `test` — where
 * Better Auth quietly substitutes `127.0.0.1` and its production fallback
 * never shows.
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

  // The library's own fallback, pinned. Up to 1.6.11 Better Auth skipped its
  // limiter for a caller whose address it could not read; by 1.6.33 it puts
  // every such caller in one shared per-path bucket instead. The route still
  // names the caller itself (`client-identity.ts`), so neither behaviour is
  // reachable through the handler. If this starts failing after an upgrade,
  // the fallback changed again: re-read `client-identity.ts` before deleting
  // anything.
  it('puts callers it cannot identify in one shared bucket when it reads the proxy header itself', () => {
    const { limit, proxyHeaderMissing, proxyHeaderJunk } = result

    expect(proxyHeaderMissing.slice(0, limit).every((status) => status === 401)).toBe(true)
    expect(proxyHeaderMissing.slice(limit).every((status) => status === 429)).toBe(true)
    // Same bucket, already spent: a junk header is not a fresh identity.
    expect(proxyHeaderJunk.every((status) => status === 429)).toBe(true)
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
