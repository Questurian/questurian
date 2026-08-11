import { describe, expect, it } from 'vitest'

import { Authors } from './Authors'

type AnyField = {
  name?: string
  type?: string
  required?: boolean
  unique?: boolean
  relationTo?: string
}

function field(name: string): AnyField {
  const found = (Authors.fields as AnyField[]).find((candidate) => candidate.name === name)
  if (!found) throw new Error(`Authors has no ${name} field`)
  return found
}

describe('Authors collection', () => {
  /**
   * ADR-0007 calls the nullable link "the load-bearing part": an author record
   * with no account must stay a valid, fully renderable state, because that is
   * what makes deleting a staff row survivable. This test exists to fail loudly
   * if someone tightens it.
   */
  it('keeps the user relationship optional', () => {
    const user = field('user')

    expect(user.type).toBe('relationship')
    expect(user.relationTo).toBe('users')
    expect(user.required).toBe(false)
  })

  it('allows at most one author per account', () => {
    expect(field('user').unique).toBe(true)
  })

  it('keeps the slug unique so author URLs cannot collide', () => {
    expect(field('slug').unique).toBe(true)
  })

  it('requires a display name, since it is the byline', () => {
    expect(field('displayName').required).toBe(true)
  })
})

describe('Authors access', () => {
  const access = Authors.access as Record<string, (args: unknown) => unknown>

  it('refuses everything to anonymous callers', () => {
    for (const operation of ['read', 'create', 'update', 'delete']) {
      expect(access[operation]({ req: { user: null } })).toBe(false)
    }
  })

  it('refuses everything to a disabled account', () => {
    const req = { user: { id: 1, collection: 'users', role: 'admin', status: 'disabled' } }

    for (const operation of ['read', 'create', 'update', 'delete']) {
      expect(access[operation]({ req })).toBe(false)
    }
  })

  it('lets an admin manage every author', () => {
    const req = { user: { id: 1, collection: 'users', role: 'admin', status: 'active' } }

    expect(access.read({ req })).toBe(true)
    expect(access.create({ req })).toBe(true)
    expect(access.update({ req })).toBe(true)
    expect(access.delete({ req })).toBe(true)
  })

  it('scopes a non-admin to the author record linked to their own account', () => {
    const req = { user: { id: 5, collection: 'users', role: 'writer', status: 'active' } }

    expect(access.update({ req })).toEqual({ user: { equals: 5 } })
  })

  it('never lets a non-admin create or delete an author', () => {
    const req = { req: { user: { id: 5, collection: 'users', role: 'editor', status: 'active' } } }

    expect(access.create(req)).toBe(false)
    // Deleting is what actually destroys a byline, so it stays admin-only.
    expect(access.delete(req)).toBe(false)
  })
})
