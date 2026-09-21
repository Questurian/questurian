import { afterEach, describe, expect, it, vi } from 'vitest'

async function load(env: Record<string, string>) {
  vi.resetModules()
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
  return import('./boot-guard')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('refuseBootOnInvalidConfig', () => {
  // The bug: the refusal was thrown inside a catch that logged and carried on,
  // so a misconfigured production process served traffic anyway.
  it('exits a production process with an invalid configuration', async () => {
    const { refuseBootOnInvalidConfig } = await load({ NODE_ENV: 'production', TRUSTED_PROXY: '' })
    const exit = vi.fn() as unknown as (code: number) => never
    const log = vi.fn()

    refuseBootOnInvalidConfig(exit, log)

    expect(exit).toHaveBeenCalledWith(1)
    expect(log.mock.calls[0]![1]).toEqual({
      problems: expect.arrayContaining([expect.stringContaining('TRUSTED_PROXY')]),
    })
  })

  it('does nothing outside production', async () => {
    const { refuseBootOnInvalidConfig } = await load({ NODE_ENV: 'development' })
    const exit = vi.fn() as unknown as (code: number) => never

    refuseBootOnInvalidConfig(exit, vi.fn())

    expect(exit).not.toHaveBeenCalled()
  })
})
