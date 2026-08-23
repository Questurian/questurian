import { describe, expect, it, vi } from 'vitest'

import { findAttractionDoc } from './lib/repository'
import { searchThingsToDoAttractionCandidates } from './operations/search'

const attraction = {
  id: 9,
  title: 'Larco Museum',
  status: 'published',
  gallery: [
    {
      image: {
        variants: {
          thumbnail: {
            filename: 'larco_thumbnail.webp',
          },
        },
      },
    },
  ],
}

describe('Things to Do attraction image population', () => {
  it('searches deeply enough to populate gallery Media Set assets', async () => {
    const find = vi.fn(async () => ({
      docs: [attraction],
      totalDocs: 1,
      totalPages: 1,
      page: 1,
      limit: 24,
    }))

    const response = await searchThingsToDoAttractionCandidates(
      { find } as never,
      { allowDrafts: true },
    )

    expect(find).toHaveBeenCalledWith(expect.objectContaining({ depth: 2 }))
    expect(response.docs[0]?.imageUrl).toContain('/api/media-assets/file/larco_thumbnail.webp')
  })

  it('reads deeply enough for saved-reference validation', async () => {
    const findByID = vi.fn(async () => attraction)

    const candidate = await findAttractionDoc(
      { findByID } as never,
      { id: attraction.id },
    )

    expect(findByID).toHaveBeenCalledWith(expect.objectContaining({ depth: 2 }))
    expect(candidate?.imageUrl).toContain('/api/media-assets/file/larco_thumbnail.webp')
  })
})
