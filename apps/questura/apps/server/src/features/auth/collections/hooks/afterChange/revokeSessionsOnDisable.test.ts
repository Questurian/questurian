import { beforeEach, describe, expect, it, vi } from 'vitest'

import { revokeSessionsOnDisableHook } from './revokeSessionsOnDisable'

const findOne = vi.fn()
const updateOne = vi.fn()

function callHook(doc: Record<string, unknown>) {
  return (revokeSessionsOnDisableHook as (args: unknown) => Promise<unknown>)({
    collection: { slug: 'users' },
    context: {},
    doc,
    operation: 'update',
    previousDoc: {},
    req: { payload: { db: { findOne, updateOne } } },
  })
}

describe('revokeSessionsOnDisableHook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findOne.mockResolvedValue({
      id: 7,
      sessions: [{ id: 'sid-1' }, { id: 'sid-2' }],
      updatedAt: '2026-08-11T00:00:00.000Z',
    })
  })

  it('clears every session when the account is disabled', async () => {
    await callHook({ id: 7, status: 'disabled' })

    expect(updateOne).toHaveBeenCalledTimes(1)
    expect(updateOne.mock.calls[0][0]).toMatchObject({
      id: 7,
      collection: 'users',
      returning: false,
      data: { sessions: [] },
    })
  })

  it('leaves updatedAt untouched, since revoking is not a content edit', async () => {
    await callHook({ id: 7, status: 'disabled' })

    expect(updateOne.mock.calls[0][0].data.updatedAt).toBeNull()
  })

  it('does nothing for an active account', async () => {
    await callHook({ id: 7, status: 'active' })

    expect(findOne).not.toHaveBeenCalled()
    expect(updateOne).not.toHaveBeenCalled()
  })

  it('does not write when a disabled account already holds no sessions', async () => {
    findOne.mockResolvedValue({ id: 7, sessions: [] })

    await callHook({ id: 7, status: 'disabled' })

    expect(updateOne).not.toHaveBeenCalled()
  })

  it('returns the document so later afterChange hooks still run', async () => {
    const doc = { id: 7, status: 'disabled' }

    await expect(callHook(doc)).resolves.toBe(doc)
  })
})
