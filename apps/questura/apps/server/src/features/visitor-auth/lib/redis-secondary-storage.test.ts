import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('ioredis', () => ({ default: vi.fn() }))

vi.mock('@/shared/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/config')>()
  return { ...actual, APP_CONFIG: { ...actual.APP_CONFIG, redis: { ...actual.APP_CONFIG.redis, url: 'redis://test' } } }
})

const { default: Redis } = await import('ioredis')
const fakeRedis = {
  get: vi.fn(),
  del: vi.fn(),
  getdel: vi.fn(),
  eval: vi.fn(),
}
vi.mocked(Redis).mockImplementation(() => fakeRedis as never)

const { redisClientOptions, redisSecondaryStorage } = await import('./redis-secondary-storage')

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('redisClientOptions', () => {
  // ioredis waits on a command for as long as the connection lives unless told
  // otherwise; every session check and rate limit rides on this client.
  it('bounds connecting and every command', () => {
    expect(redisClientOptions()).toMatchObject({ connectTimeout: 3000, commandTimeout: 1000, maxRetriesPerRequest: 2 })
  })

  it('takes deadlines from the environment, ignoring nonsense', () => {
    vi.stubEnv('REDIS_COMMAND_TIMEOUT_MS', '250')
    vi.stubEnv('REDIS_CONNECT_TIMEOUT_MS', 'soon')
    expect(redisClientOptions()).toMatchObject({ commandTimeout: 250, connectTimeout: 3000 })
  })

  it('backs off reconnects with a cap and jitter', () => {
    const { retryStrategy } = redisClientOptions()
    expect(retryStrategy(1)).toBeGreaterThanOrEqual(200)
    expect(retryStrategy(1)).toBeLessThan(300)
    expect(retryStrategy(50)).toBeLessThan(2100)
  })
})

describe('redisSecondaryStorage', () => {
  // Better Auth reads one-time values (verification state) through this. A GET
  // then DEL let two concurrent callers both read the value before either
  // deleted it.
  it('reads and deletes in one atomic GETDEL', async () => {
    fakeRedis.getdel.mockResolvedValueOnce('value')

    expect(await redisSecondaryStorage.getAndDelete('k')).toBe('value')
    expect(fakeRedis.getdel).toHaveBeenCalledWith('k')
    expect(fakeRedis.get).not.toHaveBeenCalled()
    expect(fakeRedis.del).not.toHaveBeenCalled()
  })

  it('increments several keys in one script, answered in key order', async () => {
    fakeRedis.eval.mockResolvedValueOnce([3, 50, 1, 60])

    expect(await redisSecondaryStorage.incrementManyWithExpiry(['a', 'b'], 60)).toEqual([
      { count: 3, ttlSeconds: 50 },
      { count: 1, ttlSeconds: 60 },
    ])
    expect(fakeRedis.eval).toHaveBeenCalledTimes(1)
    expect(fakeRedis.eval.mock.calls[0].slice(1)).toEqual([2, 'a', 'b', 60])
  })

  it('refuses a malformed script answer rather than guessing a count', async () => {
    fakeRedis.eval.mockResolvedValueOnce([1, 60])

    await expect(redisSecondaryStorage.incrementManyWithExpiry(['a', 'b'], 60)).rejects.toThrow(/invalid/)
  })
})
