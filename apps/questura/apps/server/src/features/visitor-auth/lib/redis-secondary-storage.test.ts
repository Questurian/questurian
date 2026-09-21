import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('ioredis', () => ({ default: vi.fn() }))

const { redisClientOptions } = await import('./redis-secondary-storage')

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
