import { describe, expect, it } from 'vitest'

import { generateApiKeyHook } from './generateApiKey'

function run(data: Record<string, unknown> | undefined, operation = 'create') {
  return (generateApiKeyHook as (args: unknown) => Promise<{ data?: Record<string, unknown> }>)({
    args: { data },
    collection: { slug: 'service-accounts' },
    context: {},
    operation,
    req: {},
  })
}

describe('generateApiKeyHook', () => {
  it('issues a key when one is enabled without a value', async () => {
    const result = await run({ name: 'Location Manager', enableAPIKey: true })

    expect(typeof result.data?.apiKey).toBe('string')
    expect((result.data?.apiKey as string).length).toBe(64)
  })

  it('issues a different key each time', async () => {
    const first = await run({ enableAPIKey: true })
    const second = await run({ enableAPIKey: true })

    expect(first.data?.apiKey).not.toBe(second.data?.apiKey)
  })

  it('never overwrites a key that was supplied', async () => {
    const result = await run({ enableAPIKey: true, apiKey: 'operator-chosen-key' })

    expect(result.data?.apiKey).toBe('operator-chosen-key')
  })

  it('does not issue a key when the account has none enabled', async () => {
    const disabled = await run({ name: 'Dormant', enableAPIKey: false })
    const absent = await run({ name: 'Dormant' })

    expect(disabled.data?.apiKey).toBeUndefined()
    expect(absent.data?.apiKey).toBeUndefined()
  })

  it('issues a key on update, so re-enabling a revoked account works', async () => {
    const result = await run({ enableAPIKey: true }, 'update')

    expect(typeof result.data?.apiKey).toBe('string')
  })

  it('leaves reads and deletes alone', async () => {
    for (const operation of ['read', 'delete']) {
      const result = await run({ enableAPIKey: true }, operation)
      expect(result.data?.apiKey).toBeUndefined()
    }
  })

  it('tolerates an operation with no data', async () => {
    await expect(run(undefined)).resolves.toBeDefined()
  })
})
