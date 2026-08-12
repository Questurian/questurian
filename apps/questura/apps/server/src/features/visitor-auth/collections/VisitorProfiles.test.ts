import { describe, expect, it } from 'vitest'

import { VisitorProfiles } from './VisitorProfiles'
import { preventVisitorProfileDelete } from './hooks/preventDelete'

const access = VisitorProfiles.access as Record<
  string,
  (args: { req: { user: unknown } }) => boolean
>

describe('VisitorProfiles deletion', () => {
  it.each([
    ['admin', { id: 1, collection: 'users', role: 'admin' }],
    ['editor', { id: 2, collection: 'users', role: 'editor' }],
    ['writer', { id: 3, collection: 'users', role: 'writer' }],
    ['service account', { id: 4, collection: 'service-accounts', name: 'Location Manager' }],
    ['anonymous caller', null],
  ])('refuses deletion by %s', (_label, user) => {
    expect(access.delete({ req: { user } })).toBe(false)
  })

  it('wires the deletion invariant into the collection lifecycle', () => {
    expect(VisitorProfiles.hooks?.beforeDelete).toContain(preventVisitorProfileDelete)
  })

  it('refuses trusted Local API deletion that bypasses collection access', () => {
    expect(() =>
      (preventVisitorProfileDelete as (args: unknown) => unknown)({
        id: 42,
        req: {},
      }),
    ).toThrow('Visitor profiles cannot be deleted independently.')
  })
})
