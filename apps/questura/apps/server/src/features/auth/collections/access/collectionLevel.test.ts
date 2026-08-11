import { describe, expect, it, vi } from 'vitest'

import { collectionAccess } from './collectionLevel'

function createReq(user: { role: string } | null, totalDocs = 0, bootstrapToken?: string) {
  return {
    user,
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
})
