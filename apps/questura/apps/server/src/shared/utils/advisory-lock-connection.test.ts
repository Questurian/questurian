import { afterEach, describe, expect, it, vi } from 'vitest'

const config = vi.hoisted(() => ({ uri: '', directUri: '' }))

vi.mock('@/shared/config', () => ({
  APP_CONFIG: {
    database: {
      get uri() {
        return config.uri
      },
      get directUri() {
        return config.directUri
      },
    },
  },
}))

vi.mock('./logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }))

const { advisoryLockConnectionString, advisoryLocksAreOnAPooledConnection } = await import(
  './advisory-lock'
)

afterEach(() => {
  config.uri = ''
  config.directUri = ''
})

describe('advisoryLockConnectionString', () => {
  it('uses the main URI when no direct endpoint is configured', () => {
    config.uri = 'postgres://u:p@127.0.0.1:5432/questura'

    expect(advisoryLockConnectionString()).toBe(config.uri)
    expect(advisoryLocksAreOnAPooledConnection()).toBe(false)
  })

  // A session-level lock taken through a transaction pooler can be released
  // against a different backend, or outlive its caller, with no error anywhere.
  it('prefers the direct endpoint whenever one is configured', () => {
    config.uri = 'postgres://u:p@ep-x-123-pooler.us-east-2.aws.neon.tech/db'
    config.directUri = 'postgres://u:p@ep-x-123.us-east-2.aws.neon.tech/db'

    expect(advisoryLockConnectionString()).toBe(config.directUri)
    expect(advisoryLocksAreOnAPooledConnection()).toBe(false)
  })

  it('reports when the locks would run on a pooled connection anyway', () => {
    config.uri = 'postgres://u:p@ep-x-123-pooler.us-east-2.aws.neon.tech/db'

    expect(advisoryLocksAreOnAPooledConnection()).toBe(true)
  })

  it('ignores a direct URI that is only whitespace', () => {
    config.uri = 'postgres://u:p@127.0.0.1:5432/questura'
    config.directUri = '   '

    expect(advisoryLockConnectionString()).toBe(config.uri)
  })
})
