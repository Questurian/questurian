import { describe, expect, it, vi } from 'vitest'

vi.mock('./redis-secondary-storage', () => ({ visitorAuthRedis: vi.fn() }))

import {
  REVOCATION_WINDOW_MS,
  createRevocationRegistry,
  memoryRevocationStore,
  redisRevocationStore,
  type RevocationStore,
} from './session-revocations'

function clock(start = 1_000_000) {
  let t = start
  return { now: () => t, advance: (ms: number) => (t += ms) }
}

describe('session revocations', () => {
  it('a revocation made on one instance is seen by another within one poll', async () => {
    const store = memoryRevocationStore()
    const time = clock()
    const a = createRevocationRegistry({ store, pollMs: 1_000, now: time.now })
    const b = createRevocationRegistry({ store, pollMs: 1_000, now: time.now })

    expect(await b.isRecentlyRevoked('reader')).toBe(false)
    await a.record('reader')
    // b read the list a moment ago and trusts it until the poll interval passes.
    expect(await a.isRecentlyRevoked('reader')).toBe(true)
    time.advance(1_000)
    expect(await b.isRecentlyRevoked('reader')).toBe(true)
    expect(await b.isRecentlyRevoked('someone-else')).toBe(false)
  })

  it('reads the shared list at most once per poll interval, however many requests ask', async () => {
    const since = vi.fn(async () => [] as Array<[string, number]>)
    const time = clock()
    const registry = createRevocationRegistry({ store: { record: vi.fn(), since }, pollMs: 1_000, now: time.now })

    await Promise.all(Array.from({ length: 50 }, (_, i) => registry.isRecentlyRevoked(`r${i}`)))
    expect(since).toHaveBeenCalledTimes(1)
    time.advance(999)
    await registry.isRecentlyRevoked('r1')
    expect(since).toHaveBeenCalledTimes(1)
    time.advance(1)
    await registry.isRecentlyRevoked('r1')
    expect(since).toHaveBeenCalledTimes(2)
  })

  it('forgets a revocation once no cookie copy made before it can still be alive', async () => {
    const store = memoryRevocationStore()
    const time = clock()
    const registry = createRevocationRegistry({ store, pollMs: 1_000, now: time.now })
    await registry.record('reader')
    time.advance(REVOCATION_WINDOW_MS - 1)
    expect(await registry.isRecentlyRevoked('reader')).toBe(true)
    time.advance(2)
    expect(await registry.isRecentlyRevoked('reader')).toBe(false)
    // The window outlasts the five-minute cookie cache.
    expect(REVOCATION_WINDOW_MS).toBeGreaterThan(5 * 60 * 1000)
  })

  it('keeps the last list and backs off when the shared list cannot be read', async () => {
    const log = vi.fn()
    const time = clock()
    let fail = false
    const rows: Array<[string, number]> = [['reader', time.now()]]
    const since = vi.fn(async () => {
      if (fail) throw new Error('Command timed out')
      return rows
    })
    const registry = createRevocationRegistry({ store: { record: vi.fn(), since }, pollMs: 1_000, now: time.now, log })

    expect(await registry.isRecentlyRevoked('reader')).toBe(true)
    fail = true
    time.advance(1_000)
    expect(await registry.isRecentlyRevoked('reader')).toBe(true)
    // No retry on every request while Redis is down.
    await registry.isRecentlyRevoked('reader')
    await registry.isRecentlyRevoked('reader')
    expect(since).toHaveBeenCalledTimes(2)
    expect(log).toHaveBeenCalledTimes(1)

    // While failing, a request never waits on the retry.
    time.advance(1_000)
    let release: () => void = () => {}
    since.mockImplementationOnce(() => new Promise((_, reject) => (release = () => reject(new Error('still down')))))
    expect(await registry.isRecentlyRevoked('reader')).toBe(true)
    expect(since).toHaveBeenCalledTimes(3)
    release()
  })

  it('a revocation that could not be shared still holds on the instance that made it', async () => {
    const log = vi.fn()
    const store: RevocationStore = {
      record: vi.fn(async () => {
        throw new Error('Connection is closed')
      }),
      since: vi.fn(async () => []),
    }
    const time = clock()
    const registry = createRevocationRegistry({ store, pollMs: 1_000, now: time.now, log })

    await expect(registry.record('reader')).resolves.toBeUndefined()
    time.advance(1_000)
    expect(await registry.isRecentlyRevoked('reader')).toBe(true)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('could not share a revocation'))
  })

  it('writes to Redis as one transaction that never moves a revocation back and trims old entries', async () => {
    const calls: unknown[][] = []
    const chain = {
      zadd: (...args: unknown[]) => (calls.push(['zadd', ...args]), chain),
      zremrangebyscore: (...args: unknown[]) => (calls.push(['zremrangebyscore', ...args]), chain),
      pexpire: (...args: unknown[]) => (calls.push(['pexpire', ...args]), chain),
      exec: async () => [],
    }
    const zrangebyscore = vi.fn(async () => ['a', '100', 'b', '200'])
    const store = redisRevocationStore(() => ({ multi: () => chain, zrangebyscore }) as never)

    await store.record('reader', 5_000_000)
    expect(calls[0]).toEqual(['zadd', expect.any(String), 'GT', 5_000_000, 'reader'])
    expect(calls[1]).toEqual(['zremrangebyscore', expect.any(String), '-inf', 5_000_000 - REVOCATION_WINDOW_MS])
    expect(calls[2]).toEqual(['pexpire', expect.any(String), REVOCATION_WINDOW_MS])
    expect(await store.since(50)).toEqual([
      ['a', 100],
      ['b', 200],
    ])
    expect(zrangebyscore).toHaveBeenCalledWith(expect.any(String), 50, '+inf', 'WITHSCORES')
  })
})
