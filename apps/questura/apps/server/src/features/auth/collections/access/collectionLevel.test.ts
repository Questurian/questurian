import { describe, expect, it, vi } from 'vitest'

import { collectionAccess } from './collectionLevel'

function createReq(
  user: { role: string; id?: number; status?: string } | null,
  totalDocs = 0,
  bootstrapToken?: string,
) {
  return {
    // Payload always stamps the collection on an authenticated principal, and
    // `staffUser` reads it to tell a person from a machine (ADR-0006).
    user: user ? { collection: 'users', ...user } : user,
    headers: {
      get: (name: string) =>
        name === 'x-bootstrap-token' ? (bootstrapToken ?? null) : null,
    },
    payload: {
      count: vi.fn().mockResolvedValue({ totalDocs }),
    },
  } as any
}

describe('Users collection access', () => {
  describe('create', () => {
    // The bootstrap token is unset throughout, so these exercise the
    // development default (bootstrap permitted). `bootstrap-token.test.ts`
    // covers the production and token-set behaviour.
    it('allows unauthenticated first-user bootstrap', async () => {
      const req = createReq(null, 0)

      await expect(collectionAccess.create({ req } as any)).resolves.toBe(true)
      expect(req.payload.count).toHaveBeenCalledWith({ collection: 'users' })
    })

    it('blocks unauthenticated create after bootstrap', async () => {
      const req = createReq(null, 1)

      await expect(collectionAccess.create({ req } as any)).resolves.toBe(false)
      expect(req.payload.count).toHaveBeenCalledWith({ collection: 'users' })
    })

    it('blocks unauthenticated bootstrap without the token in production', async () => {
      vi.resetModules()
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('BOOTSTRAP_ADMIN_TOKEN', 'secret-value')
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const { collectionAccess: productionAccess } = await import('./collectionLevel')

      const req = createReq(null, 0)
      await expect(productionAccess.create({ req } as any)).resolves.toBe(false)
      // Rejected before the count, so it cannot be used to probe bootstrap state.
      expect(req.payload.count).not.toHaveBeenCalled()

      const authorized = createReq(null, 0, 'secret-value')
      await expect(productionAccess.create({ req: authorized } as any)).resolves.toBe(true)
      expect(authorized.payload.count).toHaveBeenCalledWith({ collection: 'users' })

      vi.unstubAllEnvs()
      vi.resetModules()
      vi.restoreAllMocks()
    })

    it('allows authenticated admins to create staff users', async () => {
      const req = createReq({ role: 'admin' }, 1)

      await expect(collectionAccess.create({ req } as any)).resolves.toBe(true)
      expect(req.payload.count).not.toHaveBeenCalled()
    })

    it('blocks authenticated editors and writers from creating staff users', async () => {
      const editorReq = createReq({ role: 'editor' }, 1)
      const writerReq = createReq({ role: 'writer' }, 1)

      await expect(collectionAccess.create({ req: editorReq } as any)).resolves.toBe(false)
      await expect(collectionAccess.create({ req: writerReq } as any)).resolves.toBe(false)
      expect(editorReq.payload.count).not.toHaveBeenCalled()
      expect(writerReq.payload.count).not.toHaveBeenCalled()
    })
  })

  // ADR-0007: a disabled account keeps its row and its role but holds no
  // access. Payload re-reads the user row on every request, so these checks see
  // the committed status rather than whatever the token was minted with.
  describe('disabled accounts', () => {
    const disabledAdmin = { id: 1, role: 'admin', status: 'disabled' }

    it('refuses admin-panel entry', () => {
      expect(collectionAccess.admin({ req: createReq(disabledAdmin) } as any)).toBe(false)
      for (const role of ['editor', 'writer']) {
        expect(
          collectionAccess.admin({ req: createReq({ id: 2, role, status: 'disabled' }) } as any),
        ).toBe(false)
      }
    })

    it('refuses create, read, update and delete', async () => {
      await expect(
        collectionAccess.create({ req: createReq(disabledAdmin, 1) } as any),
      ).resolves.toBe(false)
      expect(collectionAccess.read({ req: createReq(disabledAdmin) } as any)).toBe(false)
      expect(collectionAccess.update({ req: createReq(disabledAdmin), id: 1 } as any)).toBe(false)
      expect(collectionAccess.delete({ req: createReq(disabledAdmin) } as any)).toBe(false)
    })

    it('refuses a disabled editor the self-read they would otherwise get', () => {
      const req = createReq({ id: 2, role: 'editor', status: 'disabled' })

      expect(collectionAccess.read({ req } as any)).toBe(false)
      expect(collectionAccess.update({ req, id: 2 } as any)).toBe(false)
    })

    it('still admits active accounts', () => {
      const activeEditor = createReq({ id: 2, role: 'editor', status: 'active' })

      expect(collectionAccess.admin({ req: activeEditor } as any)).toBe(true)
      expect(collectionAccess.read({ req: activeEditor } as any)).toEqual({ id: { equals: 2 } })
      expect(collectionAccess.update({ req: activeEditor, id: 2 } as any)).toBe(true)
    })
  })
})

/**
 * ADR-0011 widened `authors.update` for editors. It deliberately did NOT widen
 * anything here: the whole reason that change is safe is that a Staff identity
 * stays a credential an editor cannot reach. These pin the half that must not
 * move, so a future "editors need to see their writers" change has to argue
 * with a red test rather than slip through.
 */
describe('editors stay scoped to their own staff identity (ADR-0011)', () => {
  const editor = { id: 7, collection: 'users', role: 'editor', status: 'active' }

  it('reads only their own row', () => {
    expect(collectionAccess.read({ req: { user: editor } } as any)).toEqual({
      id: { equals: 7 },
    })
  })

  it('updates only their own row', () => {
    expect(collectionAccess.update({ req: { user: editor }, id: 7 } as any)).toBe(true)
    expect(collectionAccess.update({ req: { user: editor }, id: 8 } as any)).toBe(false)
  })

  it('cannot create or delete a staff identity', async () => {
    await expect(collectionAccess.create({ req: { user: editor } } as any)).resolves.toBe(false)
    expect(collectionAccess.delete({ req: { user: editor } } as any)).toBe(false)
  })
})
