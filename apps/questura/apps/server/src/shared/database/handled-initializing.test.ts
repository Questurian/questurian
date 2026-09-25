// @vitest-environment node
import { postgresAdapter } from '@payloadcms/db-postgres'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { withHandledInitializing } from './handled-initializing'

// Collect unhandled rejections ourselves. Vitest would otherwise report them
// as run errors, which is the symptom, not a readable assertion.
let unhandled: unknown[] = []
const onUnhandled = (reason: unknown) => {
  unhandled.push(reason)
}
const vitestListeners: NodeJS.UnhandledRejectionListener[] = []

beforeEach(() => {
  unhandled = []
  vitestListeners.push(...(process.listeners('unhandledRejection') as NodeJS.UnhandledRejectionListener[]))
  process.removeAllListeners('unhandledRejection')
  process.on('unhandledRejection', onUnhandled)
})

afterEach(() => {
  process.off('unhandledRejection', onUnhandled)
  for (const listener of vitestListeners.splice(0)) process.on('unhandledRejection', listener)
})

/** Long enough for Node to have decided which rejections were unhandled. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

/**
 * Shaped like @payloadcms/db-postgres: `connect` rejects `initializing` with no
 * reason, then throws; `destroy` puts a fresh `initializing` back.
 */
function fakeAdapterResult(options: { up: boolean }) {
  return {
    name: 'fake',
    defaultIDType: 'number' as const,
    init: (_args?: unknown) => {
      let resolveInitializing!: () => void
      let rejectInitializing!: () => void
      const fresh = () =>
        new Promise<void>((resolve, reject) => {
          resolveInitializing = resolve
          rejectInitializing = () => reject()
        })
      const adapter = {
        initializing: fresh(),
        connectedAs: undefined as unknown,
        async connect(this: unknown) {
          adapter.connectedAs = this
          if (!options.up) {
            rejectInitializing()
            throw new Error('Error: cannot connect to Postgres: ECONNREFUSED')
          }
          resolveInitializing()
        },
        async destroy() {
          adapter.initializing = fresh()
        },
      }
      return adapter
    },
  }
}

describe('withHandledInitializing', () => {
  it('shows the bug it fixes: the unwrapped adapter leaks a reasonless rejection per failed connect', async () => {
    const adapter = fakeAdapterResult({ up: false }).init()

    await expect(adapter.connect()).rejects.toThrow('cannot connect to Postgres')
    await settle()

    expect(unhandled).toEqual([undefined])
  })

  it('turns every failed connect into a handled failure, one per retry', async () => {
    const result = withHandledInitializing(fakeAdapterResult({ up: false }))

    for (let retry = 0; retry < 3; retry += 1) {
      // Each getPayload retry builds a fresh adapter with a fresh promise.
      const adapter = result.init({} as never)
      await expect(adapter.connect()).rejects.toThrow('cannot connect to Postgres')
    }
    await settle()

    expect(unhandled).toEqual([])
  })

  it('still hands the rejection to anyone who awaits initializing', async () => {
    const adapter = withHandledInitializing(fakeAdapterResult({ up: false })).init({} as never)
    const waiting = adapter.initializing

    await expect(adapter.connect()).rejects.toThrow()
    await expect(waiting).rejects.toBeUndefined()
  })

  it('covers the promise destroy() puts back for the next connect', async () => {
    const adapter = withHandledInitializing(fakeAdapterResult({ up: false })).init({} as never)
    await expect(adapter.connect()).rejects.toThrow()

    // What an HMR reload does: destroy, then connect again.
    await adapter.destroy()
    await expect(adapter.connect()).rejects.toThrow()
    await settle()

    expect(unhandled).toEqual([])
  })

  it('changes nothing when the database is up', async () => {
    const adapter = withHandledInitializing(fakeAdapterResult({ up: true })).init({} as never)

    await expect(adapter.connect()).resolves.toBeUndefined()
    await expect(adapter.initializing).resolves.toBeUndefined()
    // The real connect still runs as a method of the adapter (it reads this.pool).
    expect(adapter.connectedAs).toBe(adapter)
    await settle()
    expect(unhandled).toEqual([])
  })

  it('the real @payloadcms/db-postgres adapter leaks one when unwrapped (the root cause)', async () => {
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() }
    const adapter = postgresAdapter({
      push: false,
      pool: { connectionString: 'postgres://nobody@127.0.0.1:1/nothing', connectionTimeoutMillis: 2_000 },
    }).init({ payload: { logger, config: { collections: [], globals: [] } } as never }) as unknown as {
      connect: () => Promise<void>
      pool?: { end: () => Promise<void> }
    }

    await expect(adapter.connect()).rejects.toThrow('cannot connect to Postgres')
    await adapter.pool?.end().catch(() => {})
    await settle()

    expect(unhandled).toEqual([undefined])
  })

  it('makes the real @payloadcms/db-postgres adapter fail without an unhandled rejection', async () => {
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() }
    // Port 1 on loopback: refused immediately, nothing listens there.
    const result = withHandledInitializing(
      postgresAdapter({
        push: false,
        pool: { connectionString: 'postgres://nobody@127.0.0.1:1/nothing', connectionTimeoutMillis: 2_000 },
      }),
    )
    const adapter = result.init({ payload: { logger, config: { collections: [], globals: [] } } as never }) as unknown as {
      connect: () => Promise<void>
      pool?: { end: () => Promise<void> }
    }

    await expect(adapter.connect()).rejects.toThrow('cannot connect to Postgres')
    await adapter.pool?.end().catch(() => {})
    await settle()

    expect(logger.error).toHaveBeenCalledTimes(1)
    expect(unhandled).toEqual([])
  })
})
