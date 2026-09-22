import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const drain = vi.hoisted(() => vi.fn())

vi.mock('./worker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./worker')>()
  return { ...actual, drainRefreshJobs: drain }
})
vi.mock('@/shared/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const { runDrain, workerHealth, resetWorkerLifecycle, shutdownRefreshWorker } = await import('./lifecycle')
const { resumeClaimingRefreshJobs, claimingStopped } = await import('./worker')

const RESULT = { claimed: 2, done: 2, retried: 0, failed: 0, superseded: 0, stoppedEarly: false }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  drain.mockReset()
  resetWorkerLifecycle()
  resumeClaimingRefreshJobs()
})

afterEach(() => {
  resumeClaimingRefreshJobs()
})

/**
 * One drain at a time in this process.
 *
 * Four things start drains: the timer after an enqueue commits, the periodic
 * timer, the HTTP endpoint and the CLI. Only the first two knew about each
 * other. A scheduler calling the endpoint every minute while the periodic
 * timer also ran gave one process two concurrent drains, each claiming its
 * own batch and each opening its own connections — the declared concurrency
 * doubled with nothing declaring it.
 */
describe('runDrain', () => {
  it('runs the drain and records the result', async () => {
    drain.mockResolvedValue(RESULT)

    await expect(runDrain({} as never)).resolves.toEqual(RESULT)

    const health = workerHealth()
    expect(health.runs).toBe(1)
    expect(health.draining).toBe(false)
    expect(health.lastResult).toEqual(RESULT)
    expect(health.lastSuccessAt).not.toBeNull()
  })

  it('does not start a second drain while one is running', async () => {
    const gate = deferred<typeof RESULT>()
    drain.mockReturnValue(gate.promise)

    const first = runDrain({} as never)
    const second = runDrain({} as never)

    expect(drain).toHaveBeenCalledTimes(1)
    expect(workerHealth().skippedConcurrent).toBe(1)

    gate.resolve(RESULT)
    // The joiner gets the real result, not a fabricated empty one: a
    // scheduler that is told "0 done" while work is running cannot tell that
    // apart from an idle queue.
    await expect(Promise.all([first, second])).resolves.toEqual([RESULT, RESULT])
  })

  it('lets the next drain start once the first has finished', async () => {
    drain.mockResolvedValue(RESULT)

    await runDrain({} as never)
    await runDrain({} as never)

    expect(drain).toHaveBeenCalledTimes(2)
    expect(workerHealth().skippedConcurrent).toBe(0)
  })

  // Counters alone cannot tell "nothing to do" from "nothing has run".
  it('records a failure with its reason, and keeps the process drainable', async () => {
    drain.mockRejectedValueOnce(new Error('pool exhausted'))

    await expect(runDrain({} as never)).rejects.toThrow('pool exhausted')

    const health = workerHealth()
    expect(health.lastFailureAt).not.toBeNull()
    expect(health.lastError).toBe('pool exhausted')
    expect(health.draining).toBe(false)

    drain.mockResolvedValue(RESULT)
    await expect(runDrain({} as never)).resolves.toEqual(RESULT)
  })
})

describe('shutdown', () => {
  it('stops new claims and waits for work in flight', async () => {
    const gate = deferred<typeof RESULT>()
    drain.mockReturnValue(gate.promise)

    const running = runDrain({} as never)
    const stopping = shutdownRefreshWorker(5_000)

    expect(claimingStopped()).toBe(true)
    expect(workerHealth().claiming).toBe(false)

    gate.resolve(RESULT)
    await stopping
    await running
  })

  it('gives up waiting after the grace period rather than hanging the shutdown', async () => {
    vi.useFakeTimers()
    try {
      const gate = deferred<typeof RESULT>()
      drain.mockReturnValue(gate.promise)
      void runDrain({} as never)

      const stopping = shutdownRefreshWorker(1_000)
      await vi.advanceTimersByTimeAsync(1_001)
      await expect(stopping).resolves.toBeUndefined()

      gate.resolve(RESULT)
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns immediately when nothing is running', async () => {
    await expect(shutdownRefreshWorker()).resolves.toBeUndefined()
    expect(claimingStopped()).toBe(true)
  })
})
