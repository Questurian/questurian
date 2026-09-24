import { describe, expect, it } from 'vitest'

import { sandboxSettings } from './sandbox'
import {
  containerStatus,
  managesSandboxPostgres,
  postgresDockerArgs,
  redisDockerArgs,
  removeContainer,
  SANDBOX_POSTGRES,
  SANDBOX_REDIS,
} from './sandbox-docker'

describe('sandbox containers', () => {
  it('runs the Redis fallback on loopback 6390, without persistence', () => {
    const args = redisDockerArgs(6390)
    expect(args).toContain('127.0.0.1:6390:6379')
    expect(args).toContain(SANDBOX_REDIS.container)
    expect(args.join(' ')).toContain("redis-server --save  --appendonly no")
  })

  it.each([6379, 6391, 0])('refuses to run the Redis fallback on %i', (port) => {
    expect(() => redisDockerArgs(port)).toThrow(/only ever runs on 6390/)
  })

  it('runs Postgres on loopback 5442, on a tmpfs, with the sandbox database', () => {
    const args = postgresDockerArgs(5442)
    expect(args).toContain('127.0.0.1:5442:5432')
    expect(args).toContain('/var/lib/postgresql/data')
    expect(args).toContain(`POSTGRES_DB=${SANDBOX_POSTGRES.database}`)
  })

  it.each([5432, 5433])('refuses to run Postgres on %i', (port) => {
    expect(() => postgresDockerArgs(port)).toThrow(/only ever runs on 5442/)
  })

  it.each(['questura-postgres', 'questura-redis', 'questura-local-redis'])('never inspects or removes %s', (name) => {
    expect(() => containerStatus(name)).toThrow(/not a sandbox container/)
    expect(() => removeContainer(name)).toThrow(/not a sandbox container/)
  })

  it('manages the container only for the sandbox address', () => {
    expect(managesSandboxPostgres('postgres://postgres@127.0.0.1:5442/questura_readiness')).toBe(true)
    expect(managesSandboxPostgres('postgres://postgres:postgres@127.0.0.1:5432/questura_readiness')).toBe(false)
    expect(managesSandboxPostgres('postgres://postgres@127.0.0.1:5433/questura_readiness')).toBe(false)
    expect(managesSandboxPostgres('not a url')).toBe(false)
  })

  it('defaults to the container, whoever is logged in', () => {
    for (const USER of ['webdev', 'alan', undefined]) {
      const settings = sandboxSettings({ USER } as unknown as NodeJS.ProcessEnv)
      expect(settings.databaseUri).toBe('postgres://postgres@127.0.0.1:5442/questura_readiness')
      expect(managesSandboxPostgres(settings.databaseUri)).toBe(true)
    }
  })
})
