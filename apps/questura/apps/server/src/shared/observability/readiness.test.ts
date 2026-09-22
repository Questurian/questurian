import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearDegraded,
  markDegraded,
  markNotReady,
  markReady,
  readinessState,
  resetReadiness,
  retryUntilReady,
} from './readiness'

/**
 * A process that failed its database initialisation used to log the failure
 * and serve anyway: it passed a TCP health check, took its share of readers,
 * and answered every one with an error — while the fleet average looked fine
 * because the other instances were healthy.
 *
 * Readiness is the distinction that makes that impossible. Up and retrying is
 * alive and not ready; a platform that conflates the two restarts the
 * instance that was about to recover.
 */

beforeEach(() => {
  resetReadiness()
  vi.unstubAllEnvs()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('readiness state', () => {
  it('starts not ready, because nothing has proved otherwise yet', () => {
    expect(readinessState()).toMatchObject({ ready: false, reason: 'initialising', attempts: 0 })
  })

  it('records when it became ready, and forgets it when it stops being', () => {
    markReady()
    const ready = readinessState()
    expect(ready.ready).toBe(true)
    expect(ready.readySince).not.toBeNull()

    markNotReady('database gone')
    expect(readinessState()).toMatchObject({ ready: false, reason: 'database gone', readySince: null })
  })

  // Capability, not fitness. Taking an instance out of rotation over a
  // transient Redis failure trades a degraded site for no site.
  it('keeps a degraded capability separate from being unfit to serve', () => {
    markReady()
    markDegraded('redis')
    markDegraded('redis')

    expect(readinessState()).toMatchObject({ ready: true, degraded: ['redis'] })

    clearDegraded('redis')
    expect(readinessState().degraded).toEqual([])
  })
})

describe('retryUntilReady', () => {
  it('becomes ready on the first success', async () => {
    await retryUntilReady(async () => {}, { sleep: async () => {} })
    expect(readinessState()).toMatchObject({ ready: true, attempts: 1 })
  })

  it('keeps retrying, staying not ready, until it succeeds', async () => {
    let calls = 0
    const failures: number[] = []

    await retryUntilReady(
      async () => {
        calls += 1
        if (calls < 3) throw new Error(`attempt ${calls} failed`)
      },
      { sleep: async () => {}, onFailure: (_error, attempts) => failures.push(attempts) },
    )

    expect(calls).toBe(3)
    expect(failures).toEqual([1, 2])
    expect(readinessState()).toMatchObject({ ready: true, attempts: 3 })
  })

  it('backs off between attempts rather than spinning against a dead database', async () => {
    const slept: number[] = []
    let calls = 0

    await retryUntilReady(
      async () => {
        calls += 1
        if (calls < 4) throw new Error('nope')
      },
      { sleep: async (ms) => { slept.push(ms) }, delays: [10, 20, 40] },
    )

    expect(slept).toEqual([10, 20, 40])
  })

  it('throws instead of retrying when the supervisor would rather restart', async () => {
    vi.stubEnv('BOOT_FAIL_FAST', '1')
    await expect(retryUntilReady(async () => { throw new Error('boom') }, { sleep: async () => {} })).rejects.toThrow(
      'boom',
    )
    expect(readinessState().ready).toBe(false)
  })

  it('stops retrying when the process is going away', async () => {
    const attempt = vi.fn(async () => { throw new Error('nope') })
    let rounds = 0

    await retryUntilReady(attempt, {
      sleep: async () => {},
      shouldStop: () => ++rounds > 2,
    })

    expect(attempt).toHaveBeenCalledTimes(2)
    expect(readinessState().ready).toBe(false)
  })
})
