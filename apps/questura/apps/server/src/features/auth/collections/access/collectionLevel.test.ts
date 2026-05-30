import { describe, expect, it, vi } from 'vitest'

import { collectionAccess } from './collectionLevel'

function createReq(user: { role: string } | null, totalDocs = 0) {
  return {
    user,
    payload: {
      count: vi.fn().mockResolvedValue({ totalDocs }),
    },
  } as any
}

describe('Users collection access', () => {
  describe('create', () => {
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
