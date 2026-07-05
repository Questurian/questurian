import { describe, expect, it, vi } from 'vitest'
import {
  buildPayloadImportStagedId,
  buildStagedArticleFromPayloadDoc,
  type PayloadArticleDetail,
} from './payload-article-import.service'

const convertLexicalToMarkdown = vi.fn(async (lexical: object) => ({
  success: true,
  markdown: (lexical as { __markdown?: string }).__markdown ?? '',
}))

function makeDoc(overrides: Partial<PayloadArticleDetail> = {}): PayloadArticleDetail {
  return {
    id: 44,
    title: 'Imported Article',
    slug: 'imported-article',
    status: 'draft',
    updatedAt: '2026-07-01T00:00:00.000Z',
    createdAt: '2026-06-01T00:00:00.000Z',
    location: 'peru',
    locationRef: { id: 7 },
    sharedNeighborhoods: [{ id: 3 }, 9],
    headerSection: { featuredImage: { id: 55 } },
    contentBlocks: [
      { blockType: 'text', content: { __markdown: '## Intro\n\nHello world.' } },
      { blockType: 'key-takeaway', label: 'Key Takeaways', items: [{ text: 'First' }, { text: 'Second' }] },
      { blockType: 'image', image: { id: 91 }, altText: 'A llama' },
      { blockType: 'faq', label: 'FAQ', items: [{ question: 'Q1?', answer: 'A1' }] },
      { blockType: 'text', content: { __markdown: 'Closing paragraph.' } },
    ],
    seoSection: {
      seoTitle: 'SEO Title',
      metaDescription: 'Meta description',
    },
    ...overrides,
  }
}

describe('buildStagedArticleFromPayloadDoc', () => {
  it('maps payload content blocks into staged blocks and editorial blocks', async () => {
    const staged = await buildStagedArticleFromPayloadDoc({
      doc: makeDoc(),
      convertLexicalToMarkdown,
    })

    expect(staged.id).toBe(buildPayloadImportStagedId(44))
    expect(staged.runId).toBe('')
    expect(staged.title).toBe('Imported Article')
    expect(staged.locationId).toBe(7)
    expect(staged.sharedNeighborhoods).toEqual([3, 9])
    expect(staged.featuredImageId).toBe(55)

    expect(staged.blocks).toHaveLength(3)
    expect(staged.blocks[0]).toMatchObject({ type: 'text', content: '## Intro\n\nHello world.' })
    expect(staged.blocks[1]).toMatchObject({ type: 'image', imageAfter: 91, imageAfterAltText: 'A llama' })
    expect(staged.blocks[2]).toMatchObject({ type: 'text', content: 'Closing paragraph.' })

    expect(staged.editorialBlocks).toHaveLength(2)
    expect(staged.editorialBlocks[0]).toMatchObject({
      component: 'key_takeaways_box',
      afterBlockId: staged.blocks[0].id,
    })
    expect(staged.editorialBlocks[0].markdown).toContain('First')
    expect(staged.editorialBlocks[1]).toMatchObject({
      component: 'faq_block',
      afterBlockId: staged.blocks[1].id,
    })
    expect(staged.editorialBlocks[1].markdown).toContain('**Q:** Q1?')

    expect(staged.payloadArticleId).toBe(44)
    expect(staged.payloadStatus).toBe('draft')
    expect(staged.payloadSlug).toBe('imported-article')
    expect(staged.publishedToPayload).toBe(true)
    expect(staged.step1_complete).toBe(true)
    expect(staged.step2_complete).toBe(true)
    expect(staged.step3_complete).toBe(true)
    expect(staged.seoSection?.seoTitle).toBe('SEO Title')
    expect(staged.content).toContain('Hello world.')
    expect(staged.content).toContain('Closing paragraph.')
  })

  it('throws when a text block fails to convert', async () => {
    const failingConverter = vi.fn(async () => ({ success: false, error: 'boom' }))

    await expect(
      buildStagedArticleFromPayloadDoc({
        doc: makeDoc(),
        convertLexicalToMarkdown: failingConverter,
      }),
    ).rejects.toThrow('boom')
  })
})
