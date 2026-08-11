import { describe, expect, it } from 'vitest'

import { rejectDisabledLoginHook } from './rejectDisabled'

function callHook(user: Record<string, unknown>) {
  return (rejectDisabledLoginHook as (args: unknown) => Promise<unknown>)({
    collection: { slug: 'users' },
    context: {},
    req: {},
    user,
  })
}

describe('rejectDisabledLoginHook', () => {
  it('refuses a token to a disabled account', async () => {
    await expect(callHook({ id: 1, email: 'ada@questurian.com', status: 'disabled' })).rejects.toThrow(
      'This account has been disabled',
    )
  })

  it('lets an active account through unchanged', async () => {
    const user = { id: 1, email: 'ada@questurian.com', status: 'active' }

    await expect(callHook(user)).resolves.toBe(user)
  })

  it('lets an account with no status through, so the column default is not load-bearing at login', async () => {
    const user = { id: 1, email: 'ada@questurian.com' }

    await expect(callHook(user)).resolves.toBe(user)
  })
})
