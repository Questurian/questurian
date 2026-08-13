import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getArticleById } from './articles.api'

const mockFetch = vi.fn()

vi.stubGlobal('fetch', mockFetch)

describe('articles api', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('returns direct Payload REST documents from getArticleById', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 39,
        title: 'Payload Article',
        contentBlocks: [],
      }),
    })

    await expect(getArticleById(39)).resolves.toMatchObject({
      id: 39,
      title: 'Payload Article',
    })
  })

  it('still accepts wrapped Payload documents from getArticleById', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        doc: {
          id: 40,
          title: 'Wrapped Article',
        },
      }),
    })

    await expect(getArticleById(40)).resolves.toMatchObject({
      id: 40,
      title: 'Wrapped Article',
    })
  })
})
