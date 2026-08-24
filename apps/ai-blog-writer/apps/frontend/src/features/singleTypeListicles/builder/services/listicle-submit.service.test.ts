import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyDraft } from '../../storage'
import type { PayloadListicleDoc, RelatedItemOption } from '../../types'
import { submitListicle } from './listicle-submit.service'

const mocks = vi.hoisted(() => ({
  updateListicle: vi.fn()
}))

vi.mock('../../api', () => ({
  createListicle: vi.fn(),
  getBlockTypeForListicleType: () => 'data-dining',
  markdownToLexical: async () => ({
    root: { children: [], type: 'root', version: 1 }
  }),
  updateListicle: mocks.updateListicle
}))

describe('submitListicle', () => {
  beforeEach(() => {
    mocks.updateListicle.mockReset()
    mocks.updateListicle.mockImplementation(
      async (id: number, body: Record<string, unknown>) =>
        ({
          ...body,
          id,
          author: { displayName: 'Test Author' },
          publishedAt: '2026-08-23T12:00:00.000Z',
          updatedAt: '2026-08-23T12:00:00.000Z',
          createdAt: '2026-08-20T12:00:00.000Z'
        }) as PayloadListicleDoc
    )
  })

  it('canonicalizes stale structured data before validating a published update', async () => {
    const draft = createEmptyDraft()
    Object.assign(draft, {
      payloadId: 11,
      payloadStatus: 'published',
      payloadSlug: 'best-restaurant',
      payloadPublishedAt: '2026-08-20T12:00:00.000Z',
      payloadAuthorName: 'Test Author',
      title: 'Best Restaurant',
      location: 'peru|lima|san-isidro',
      locationRef: 254,
      listicleType: 'dining',
      targetItemCount: 1,
      step1_complete: true,
      step3_complete: true,
      status: 'published'
    })
    draft.header.introMarkdown = 'Existing intro'
    draft.header.featuredImage = 4473
    draft.items = [
      {
        id: 'item-1',
        blockType: 'data-dining',
        item: 264,
        tours: [],
        mediaMode: 'photos',
        selectedPhotos: [530],
        selectedInstagramPost: null,
        angle: null,
        blurbMarkdown: 'Existing blurb'
      }
    ]
    draft.seoSection.seoTitle = 'Best Restaurant'
    draft.seoSection.metaDescription =
      'A sufficiently long description for this published listicle metadata test.'
    draft.seoSection.openGraph.url = 'https://example.com/best-restaurant'
    draft.seoSection.openGraph.imageUrl = 'https://example.com/best-restaurant.jpg'
    draft.seoSection.structuredData = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'BlogPosting' },
        { '@type': 'ItemList', itemListElement: [] }
      ]
    })

    const relatedItems = [
      {
        id: 264,
        title: 'Restaurant',
        gallery: [{ image: { id: 530 } }]
      }
    ] as RelatedItemOption[]

    await expect(
      submitListicle({
        draft,
        selectedLocationRefId: 254,
        targetStatus: 'published',
        relatedItems
      })
    ).resolves.toMatchObject({ resultMessage: 'Published listicle #11' })

    const firstBody = mocks.updateListicle.mock.calls[0][1] as Record<
      string,
      unknown
    >
    const seoSection = firstBody.seoSection as {
      structuredData: { '@graph': Array<Record<string, unknown>> }
    }
    const blogPosting = seoSection.structuredData['@graph'].find(
      (node) => node['@type'] === 'BlogPosting'
    )
    expect(blogPosting?.['@id']).toBe(
      'https://example.com/best-restaurant#single-type-listicle-blog-posting'
    )
  })
})
