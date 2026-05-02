import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('payload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('payload')>()

  return {
    ...actual,
    getPayload: vi.fn(),
  }
})

vi.mock('@/features/auth/lib/auth-middleware', () => ({
  authenticateRequest: vi.fn(),
  getCorsHeaders: vi.fn(() => ({})),
  handleCorsOptions: vi.fn(),
}))

import { GET as getCandidates } from '@/app/api/homepage-featured-content/candidates/route'
import { PUT as putHomepageFeaturedContent } from '@/app/api/homepage-featured-content/route'
import {
  DELETE as deleteMainHomepageBlock,
  PATCH as reorderMainHomepageBlocks,
} from '@/app/api/homepage-featured-content/blocks/route'
import { POST as convertMainHomepageBlock } from '@/app/api/homepage-featured-content/blocks/convert/route'
import { PATCH as reorderLocationHomepageBlocks } from '@/app/api/location-homepages/[id]/blocks/route'
import { GET as getPublicLocationHomepage } from '@/app/api/public/location-homepages/[country]/[city]/route'
import { authenticateRequest } from '@/features/auth/lib/auth-middleware'
import { getPayload } from 'payload'

describe('homepage featured content routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('blocks writers from the candidate endpoint', async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({
      user: null,
      error: 'Access denied. Required roles: admin, editor',
      status: 403,
    })

    const response = await getCandidates(new Request('http://localhost:4000/api/homepage-featured-content/candidates') as never)
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.message).toContain('Access denied')
  })

  it('blocks writers from saving homepage featured content', async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({
      user: null,
      error: 'Access denied. Required roles: admin, editor',
      status: 403,
    })

    const response = await putHomepageFeaturedContent(new Request('http://localhost:4000/api/homepage-featured-content', {
      method: 'PUT',
      body: JSON.stringify({ items: [] }),
    }) as never)
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.message).toContain('Access denied')
    expect(getPayload).not.toHaveBeenCalled()
  })

  it('returns only pageBlocks from the public location homepage endpoint', async () => {
    const payload = {
      find: vi.fn()
        .mockResolvedValueOnce({
          totalDocs: 1,
          docs: [{ id: 10, locationKey: 'peru|lima', level: 'city' }],
        })
        .mockResolvedValueOnce({
          totalDocs: 1,
          docs: [
            {
              id: 20,
              isEnabled: true,
              location: { id: 10, locationKey: 'peru|lima', level: 'city' },
              pageBlocks: [],
            },
          ],
        }),
    }
    vi.mocked(getPayload).mockResolvedValue(payload as never)

    const response = await getPublicLocationHomepage(
      new Request('http://localhost:4000/api/public/location-homepages/peru/lima') as never,
      { params: Promise.resolve({ country: 'peru', city: 'lima' }) },
    )
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual({ pageBlocks: [] })
  })

  it('returns lean data for main homepage block reorder without hydrating pageBlocks', async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({
      user: { role: 'editor' },
      error: null,
      status: 200,
    } as never)
    const payload = {
      findGlobal: vi.fn().mockResolvedValue({
        pageBlocks: [
          { id: 'a', blockType: 'newsletter-signup', items: [] },
          { id: 'b', blockType: 'newsletter-signup', items: [] },
        ],
      }),
      updateGlobal: vi.fn().mockResolvedValue({
        pageBlocks: [
          { id: 'b', blockType: 'newsletter-signup', items: [] },
          { id: 'a', blockType: 'newsletter-signup', items: [] },
        ],
      }),
    }
    vi.mocked(getPayload).mockResolvedValue(payload as never)

    const response = await reorderMainHomepageBlocks(new Request(
      'http://localhost:4000/api/homepage-featured-content/blocks?response=lean',
      {
        method: 'PATCH',
        body: JSON.stringify({ orderedBlockIds: ['b', 'a'] }),
      },
    ) as never)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual({ orderedBlockIds: ['b', 'a'] })
    expect(payload.updateGlobal).toHaveBeenCalledWith(expect.objectContaining({ depth: 0 }))
  })

  it('preserves the default full pageBlocks response for main homepage block reorder', async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({
      user: { role: 'editor' },
      error: null,
      status: 200,
    } as never)
    const payload = {
      findGlobal: vi.fn().mockResolvedValue({
        pageBlocks: [
          { id: 'a', blockType: 'newsletter-signup', items: [] },
          { id: 'b', blockType: 'newsletter-signup', items: [] },
        ],
      }),
      updateGlobal: vi.fn().mockResolvedValue({
        pageBlocks: [
          { id: 'b', blockType: 'newsletter-signup', items: [] },
          { id: 'a', blockType: 'newsletter-signup', items: [] },
        ],
      }),
    }
    vi.mocked(getPayload).mockResolvedValue(payload as never)

    const response = await reorderMainHomepageBlocks(new Request(
      'http://localhost:4000/api/homepage-featured-content/blocks',
      {
        method: 'PATCH',
        body: JSON.stringify({ orderedBlockIds: ['b', 'a'] }),
      },
    ) as never)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.pageBlocks).toHaveLength(2)
    expect(payload.updateGlobal).toHaveBeenCalledWith(expect.objectContaining({ depth: 1 }))
  })

  it('returns lean data for main homepage block delete', async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({
      user: { role: 'editor' },
      error: null,
      status: 200,
    } as never)
    const payload = {
      findGlobal: vi.fn().mockResolvedValue({
        pageBlocks: [
          { id: 'a', blockType: 'newsletter-signup', items: [] },
          { id: 'b', blockType: 'newsletter-signup', items: [] },
        ],
      }),
      updateGlobal: vi.fn().mockResolvedValue({
        pageBlocks: [{ id: 'b', blockType: 'newsletter-signup', items: [] }],
      }),
    }
    vi.mocked(getPayload).mockResolvedValue(payload as never)

    const response = await deleteMainHomepageBlock(new Request(
      'http://localhost:4000/api/homepage-featured-content/blocks?response=lean',
      {
        method: 'DELETE',
        body: JSON.stringify({ blockId: 'a' }),
      },
    ) as never)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual({ deletedBlockId: 'a' })
    expect(payload.updateGlobal).toHaveBeenCalledWith(expect.objectContaining({ depth: 0 }))
  })

  it('returns only the converted block for lean main homepage conversion', async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({
      user: { role: 'editor' },
      error: null,
      status: 200,
    } as never)
    const payload = {
      findGlobal: vi.fn().mockResolvedValue({
        pageBlocks: [{ id: 'a', blockType: 'featured-article', items: [] }],
      }),
      updateGlobal: vi.fn().mockResolvedValue({
        pageBlocks: [{ id: 'a', blockType: 'newsletter-signup', slotCount: 0, items: [] }],
      }),
    }
    vi.mocked(getPayload).mockResolvedValue(payload as never)

    const response = await convertMainHomepageBlock(new Request(
      'http://localhost:4000/api/homepage-featured-content/blocks/convert?response=lean',
      {
        method: 'POST',
        body: JSON.stringify({ blockId: 'a', blockType: 'newsletter-signup' }),
      },
    ) as never)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toMatchObject({
      block: {
        id: 'a',
        blockType: 'newsletter-signup',
        selection: { totalSlots: 0, items: [] },
      },
    })
    expect(data.pageBlocks).toBeUndefined()
    expect(payload.updateGlobal).toHaveBeenCalledWith(expect.objectContaining({ depth: 0 }))
  })

  it('preserves the default full pageBlocks response for main homepage conversion', async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({
      user: { role: 'editor' },
      error: null,
      status: 200,
    } as never)
    const payload = {
      findGlobal: vi.fn().mockResolvedValue({
        pageBlocks: [{ id: 'a', blockType: 'featured-article', items: [] }],
      }),
      updateGlobal: vi.fn().mockResolvedValue({
        pageBlocks: [{ id: 'a', blockType: 'newsletter-signup', slotCount: 0, items: [] }],
      }),
    }
    vi.mocked(getPayload).mockResolvedValue(payload as never)

    const response = await convertMainHomepageBlock(new Request(
      'http://localhost:4000/api/homepage-featured-content/blocks/convert',
      {
        method: 'POST',
        body: JSON.stringify({ blockId: 'a', blockType: 'newsletter-signup' }),
      },
    ) as never)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.pageBlocks).toHaveLength(1)
    expect(payload.updateGlobal).toHaveBeenCalledWith(expect.objectContaining({ depth: 1 }))
  })

  it('returns lean data for location homepage block reorder', async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({
      user: { role: 'editor' },
      error: null,
      status: 200,
    } as never)
    const payload = {
      findByID: vi.fn().mockResolvedValue({
        id: 10,
        pageBlocks: [
          { id: 'a', blockType: 'newsletter-signup', items: [] },
          { id: 'b', blockType: 'newsletter-signup', items: [] },
        ],
      }),
      update: vi.fn().mockResolvedValue({
        id: 10,
        pageBlocks: [
          { id: 'b', blockType: 'newsletter-signup', items: [] },
          { id: 'a', blockType: 'newsletter-signup', items: [] },
        ],
      }),
    }
    vi.mocked(getPayload).mockResolvedValue(payload as never)

    const response = await reorderLocationHomepageBlocks(new Request(
      'http://localhost:4000/api/location-homepages/10/blocks?response=lean',
      {
        method: 'PATCH',
        body: JSON.stringify({ orderedBlockIds: ['b', 'a'] }),
      },
    ) as never, { params: Promise.resolve({ id: '10' }) })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual({ orderedBlockIds: ['b', 'a'] })
    expect(payload.findByID).toHaveBeenCalledWith(expect.objectContaining({ depth: 0 }))
    expect(payload.update).toHaveBeenCalledWith(expect.objectContaining({ depth: 0 }))
  })
})
