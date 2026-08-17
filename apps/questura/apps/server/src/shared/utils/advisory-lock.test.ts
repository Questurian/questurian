// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { getPayload } from 'payload'

vi.mock('@/shared/config', () => ({
  APP_CONFIG: { database: { uri: 'postgres://test/questura' } },
}))

vi.mock('./logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// Factories are hoisted, so the fake lives in a module the factory can import.
vi.mock('pg', async () => ({ Pool: (await import('./__fixtures__/fake-pg')).FakePool }))

import { FakePool } from './__fixtures__/fake-pg'
import { closeAdvisoryLockPool, withAdvisoryLock } from './advisory-lock'

type Payload = Awaited<ReturnType<typeof getPayload>>

const postgresPayload = { db: { pool: {} } } as unknown as Payload
const adapterWithoutPool = { db: {} } as unknown as Payload

function currentPool(): FakePool {
  const pool = FakePool.instances.at(-1)

  if (!pool) {
    throw new Error('no pool was created')
  }

  return pool
}

/** Yield enough for every started operation to reach its next await. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
  }
}

afterEach(async () => {
  await closeAdvisoryLockPool()
  FakePool.instances = []
  vi.clearAllMocks()
})

describe('withAdvisoryLock', () => {
  it('serialises callers contending for the same key', async () => {
    const order: string[] = []

    const first = withAdvisoryLock(postgresPayload, 'stripe:event:evt_1', async () => {
      order.push('first:start')
      await settle()
      order.push('first:end')
    })

    await settle()

    const second = withAdvisoryLock(postgresPayload, 'stripe:event:evt_1', async () => {
      order.push('second:start')
    })

    await Promise.all([first, second])

    expect(order).toEqual(['first:start', 'first:end', 'second:start'])
  })

  it('does not make different keys wait on each other', async () => {
    const running: string[] = []

    const held = withAdvisoryLock(postgresPayload, 'stripe:event:evt_1', async () => {
      running.push('a')
      await settle()
      await settle()
    })

    await settle()

    await withAdvisoryLock(postgresPayload, 'stripe:event:evt_2', async () => {
      running.push('b')
    })

    expect(running).toEqual(['a', 'b'])
    await held
  })

  it('takes a nested lock on the caller connection instead of a second one', async () => {
    let checkedOutInsideNested: number | undefined

    await withAdvisoryLock(postgresPayload, 'stripe:event:evt_1', async () => {
      await withAdvisoryLock(postgresPayload, 'stripe:subscription:sub_1', async () => {
        checkedOutInsideNested = currentPool().peakCheckedOut
      })
    })

    // One connection served both locks, and it went back to the pool clean.
    expect(currentPool().connectCalls).toBe(1)
    expect(checkedOutInsideNested).toBe(1)
    expect(currentPool().server.heldKeys).toBe(0)
  })

  it('completes concurrent nested operations that outnumber the pool', async () => {
    // The regression this fix exists for. Each caller mimics the webhook path:
    // hold a per-event lock across an await, then take a per-subscription lock
    // inside it. With a connection per lock level, the callers holding outer
    // locks wait for inner-lock connections that only they could free — a mutual
    // wait, so nothing here would ever resolve.
    const callers = 12
    const results = await Promise.all(
      Array.from({ length: callers }, (_, i) =>
        withAdvisoryLock(postgresPayload, `stripe:event:evt_${i}`, async () => {
          await settle()

          return withAdvisoryLock(postgresPayload, `stripe:subscription:sub_${i}`, async () => {
            await settle()
            return i
          })
        })
      )
    )

    const pool = currentPool()

    expect(results).toEqual(Array.from({ length: callers }, (_, i) => i))
    // More callers than connections, so some had to queue — and queueing drained.
    expect(callers).toBeGreaterThan(pool.max)
    expect(pool.peakCheckedOut).toBeLessThanOrEqual(pool.max)
    expect(pool.server.heldKeys).toBe(0)
  })

  it('releases the lock when work throws', async () => {
    await expect(
      withAdvisoryLock(postgresPayload, 'stripe:event:evt_1', async () => {
        throw new Error('handler blew up')
      })
    ).rejects.toThrow('handler blew up')

    expect(currentPool().server.heldKeys).toBe(0)
    expect(currentPool().destroyed).toBe(0)

    // The next caller is not blocked by the failed one.
    await expect(
      withAdvisoryLock(postgresPayload, 'stripe:event:evt_1', async () => 'ok')
    ).resolves.toBe('ok')
  })

  it('discards the connection when the unlock fails, rather than returning a locked session to the pool', async () => {
    const result = await withAdvisoryLock(postgresPayload, 'stripe:event:evt_1', async () => {
      currentPool().failUnlock = true
      return 'work result'
    })

    // The result survives a release failure, and the session is gone with its lock.
    expect(result).toBe('work result')
    expect(currentPool().destroyed).toBe(1)
    expect(currentPool().server.heldKeys).toBe(0)
  })

  it('runs unserialised when the adapter has no Postgres pool', async () => {
    await expect(
      withAdvisoryLock(adapterWithoutPool, 'stripe:event:evt_1', async () => 'ran')
    ).resolves.toBe('ran')

    expect(FakePool.instances).toHaveLength(0)
  })
})
