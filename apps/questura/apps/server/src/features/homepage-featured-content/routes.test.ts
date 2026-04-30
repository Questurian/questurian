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
})
