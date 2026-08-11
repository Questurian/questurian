import { describe, expect, it } from 'vitest'

import { Users } from './Users'

type AnyField = { name?: string; access?: Record<string, (args: unknown) => unknown> }

function fieldAccess(name: string, operation: 'create' | 'update') {
  const field = (Users.fields as AnyField[]).find((candidate) => candidate.name === name)
  const access = field?.access?.[operation]
  if (!access) throw new Error(`Users.${name} has no ${operation} access function`)
  return access as (args: unknown) => Promise<boolean> | boolean
}

const roleUpdate = fieldAccess('role', 'update')
const statusUpdate = fieldAccess('status', 'update')

describe('Users.role update access', () => {
  it('lets an admin promote a writer to editor', async () => {
    await expect(
      roleUpdate({ req: { user: { id: 1, collection: 'users', role: 'admin' } }, id: 2, data: { role: 'editor' } }),
    ).resolves.toBe(true)
  })

  it('lets an admin demote an editor back to writer', async () => {
    await expect(
      roleUpdate({ req: { user: { id: 1, collection: 'users', role: 'admin' } }, id: 2, data: { role: 'writer' } }),
    ).resolves.toBe(true)
  })

  it('lets an admin step another admin down', async () => {
    await expect(
      roleUpdate({ req: { user: { id: 1, collection: 'users', role: 'admin' } }, id: 2, data: { role: 'editor' } }),
    ).resolves.toBe(true)
  })

  it('never grants admin by update, so a hijacked session cannot mint one', async () => {
    await expect(
      roleUpdate({ req: { user: { id: 1, collection: 'users', role: 'admin' } }, id: 2, data: { role: 'admin' } }),
    ).resolves.toBe(false)
  })

  it('refuses a role change to your own account, which keeps the last admin in place', async () => {
    await expect(
      roleUpdate({ req: { user: { id: 1, collection: 'users', role: 'admin' } }, id: 1, data: { role: 'writer' } }),
    ).resolves.toBe(false)
  })

  it('refuses non-admins outright', async () => {
    for (const role of ['editor', 'writer']) {
      await expect(
        roleUpdate({ req: { user: { id: 1, collection: 'users', role } }, id: 2, data: { role: 'editor' } }),
      ).resolves.toBe(false)
    }
    await expect(
      roleUpdate({ req: { user: null }, id: 2, data: { role: 'editor' } }),
    ).resolves.toBe(false)
  })

  it('refuses when no document id is supplied', async () => {
    await expect(
      roleUpdate({ req: { user: { id: 1, collection: 'users', role: 'admin' } }, id: undefined, data: { role: 'editor' } }),
    ).resolves.toBe(false)
  })
})

describe('Users.status update access', () => {
  it('lets an admin disable someone else', async () => {
    expect(statusUpdate({ req: { user: { id: 1, collection: 'users', role: 'admin' } }, id: 2 })).toBe(true)
  })

  it('refuses an admin disabling their own account', async () => {
    expect(statusUpdate({ req: { user: { id: 1, collection: 'users', role: 'admin' } }, id: 1 })).toBe(false)
  })

  it('refuses non-admins', async () => {
    expect(statusUpdate({ req: { user: { id: 1, collection: 'users', role: 'editor' } }, id: 2 })).toBe(false)
    expect(statusUpdate({ req: { user: null }, id: 2 })).toBe(false)
  })

  it('refuses when no document id is supplied', () => {
    expect(statusUpdate({ req: { user: { id: 1, collection: 'users', role: 'admin' } }, id: undefined })).toBe(false)
  })
})

describe('Users.status field', () => {
  it('defaults to active and offers exactly the two lifecycle states', () => {
    const field = (Users.fields as Array<Record<string, unknown>>).find(
      (candidate) => candidate.name === 'status',
    )

    expect(field?.defaultValue).toBe('active')
    expect(field?.required).toBe(true)
    expect((field?.options as Array<{ value: string }>).map((option) => option.value)).toEqual([
      'active',
      'disabled',
    ])
  })
})
