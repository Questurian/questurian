import { describe, expect, it } from 'vitest'

import { Authors } from './Authors'

type AnyField = {
  name?: string
  type?: string
  required?: boolean
  unique?: boolean
  relationTo?: string
  access?: { update?: (args: unknown) => unknown }
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

  /**
   * Editors may now edit a writer's author record (ADR-0011), and the slug is
   * the one field on it they must still not reach: author URLs are public and
   * un-redirected, so a rename breaks inbound links. Collection access alone
   * does not express that -- only this field rule does.
   */
  it('keeps the slug admin-only even for an editor who may edit the record', () => {
    const updateSlug = field('slug').access?.update
    expect(updateSlug).toBeTypeOf('function')

    const asEditor = { req: { user: { id: 7, collection: 'users', role: 'editor', status: 'active' } } }
    const asAdmin = { req: { user: { id: 1, collection: 'users', role: 'admin', status: 'active' } } }

    expect(updateSlug!(asEditor)).toBe(false)
    expect(updateSlug!(asAdmin)).toBe(true)
  })

  it('keeps the account link admin-only, so an editor cannot re-point a byline', () => {
    const updateUser = field('user').access?.update
    const asEditor = { req: { user: { id: 7, collection: 'users', role: 'editor', status: 'active' } } }

    expect(updateUser!(asEditor)).toBe(false)
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

  it('scopes a writer to the author record linked to their own account', () => {
    const req = { user: { id: 5, collection: 'users', role: 'writer', status: 'active' } }

    expect(access.update({ req })).toEqual({ user: { equals: 5 } })
  })

  it('lets an editor reach their own record, any writer, and any orphan', () => {
    const req = { user: { id: 7, collection: 'users', role: 'editor', status: 'active' } }

    expect(access.update({ req })).toEqual({
      or: [
        { user: { equals: 7 } },
        { 'user.role': { equals: 'writer' } },
        { user: { exists: false } },
      ],
    })
  })

  it("does not let an editor reach another editor's or an admin's record", () => {
    const req = { user: { id: 7, collection: 'users', role: 'editor', status: 'active' } }
    const clause = access.update({ req }) as { or: Record<string, unknown>[] }

    // The only role named is `writer`. If a future edit widened this to
    // `not_equals: 'admin'`, or dropped the role branch for a bare truthy
    // return, an editor would silently gain every colleague's byline.
    const roleBranches = clause.or.filter((branch) => 'user.role' in branch)
    expect(roleBranches).toEqual([{ 'user.role': { equals: 'writer' } }])
  })

  it('keeps the orphan branch reachable, which depends on a LEFT join', () => {
    // `user.role` traversal joins `users`; drizzle defaults query joins to
    // leftJoin, so rows with a null `user` survive it and this branch can
    // still match. An adapter change to an inner join would quietly strip
    // every orphan byline out of an editor's scope (ADR-0011).
    const req = { user: { id: 7, collection: 'users', role: 'editor', status: 'active' } }
    const clause = access.update({ req }) as { or: Record<string, unknown>[] }

    expect(clause.or).toContainEqual({ user: { exists: false } })
  })

  it('leaves a disabled editor with no access at all', () => {
    const req = { user: { id: 7, collection: 'users', role: 'editor', status: 'disabled' } }

    expect(access.update({ req })).toBe(false)
  })

  it('never lets a non-admin create or delete an author', () => {
    const req = { req: { user: { id: 5, collection: 'users', role: 'editor', status: 'active' } } }

    expect(access.create(req)).toBe(false)
    // Deleting is what actually destroys a byline, so it stays admin-only.
    expect(access.delete(req)).toBe(false)
  })
})
