import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { findAttractionDoc } from './lib/repository'
import { searchThingsToDoAttractionCandidates } from './operations/search'

const CDN_HOST = 'questurian-cdn.b-cdn.net'

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
  /*
   * The fixture gives a filename and no `url`, so these assertions run through
   * the resolver's degraded path. Since issue #566 that path builds a CDN URL
   * rather than an `/api/media-assets/file/` one, which nothing serves.
   */
  let previousHostname: string | undefined

  beforeEach(() => {
    previousHostname = process.env.BUNNY_STORAGE_HOSTNAME
    process.env.BUNNY_STORAGE_HOSTNAME = CDN_HOST
  })

  afterEach(() => {
    if (previousHostname === undefined) delete process.env.BUNNY_STORAGE_HOSTNAME
    else process.env.BUNNY_STORAGE_HOSTNAME = previousHostname
  })

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
    expect(response.docs[0]?.imageUrl).toBe(`https://${CDN_HOST}/media/larco_thumbnail.webp`)
  })

  it('reads deeply enough for saved-reference validation', async () => {
    const findByID = vi.fn(async () => attraction)

    const candidate = await findAttractionDoc(
      { findByID } as never,
      { id: attraction.id },
    )

    expect(findByID).toHaveBeenCalledWith(expect.objectContaining({ depth: 2 }))
    expect(candidate?.imageUrl).toBe(`https://${CDN_HOST}/media/larco_thumbnail.webp`)
  })
})
