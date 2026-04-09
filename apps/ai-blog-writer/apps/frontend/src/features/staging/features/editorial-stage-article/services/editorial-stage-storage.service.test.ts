import { describe, expect, it } from 'vitest'
import { normalizeStagedArticle } from './editorial-stage-storage.service'

describe('normalizeStagedArticle', () => {
  it('defaults sharedNeighborhoods to an empty array', () => {
    const article = normalizeStagedArticle({
      id: 'staged-1',
      title: 'Lima cafes',
      content: 'Some content',
      blocks: [],
      editorialBlocks: [],
      lexicalConverted: false,
      publishedToPayload: false,
      createdAt: '2026-03-16T00:00:00.000Z',
      updatedAt: '2026-03-16T00:00:00.000Z',
    })

    expect(article?.sharedNeighborhoods).toEqual([])
  })

  it('normalizes and deduplicates sharedNeighborhoods', () => {
    const article = normalizeStagedArticle({
      id: 'staged-2',
      title: 'Lima cafes',
      content: 'Some content',
      blocks: [],
      editorialBlocks: [],
      sharedNeighborhoods: [12, 15, 12, 0, '18'],
      lexicalConverted: false,
      publishedToPayload: false,
      createdAt: '2026-03-16T00:00:00.000Z',
      updatedAt: '2026-03-16T00:00:00.000Z',
    })

    expect(article?.sharedNeighborhoods).toEqual([12, 15])
  })

  it('preserves stored content and editorial blocks for staged articles loaded into the builder', () => {
    const storedBlocks = [
      {
        id: 'block-1',
        type: 'text',
        content: '## Intro\n\nBody copy',
      },
    ]
    const storedEditorialBlocks = [
      {
        id: 'editorial-1',
        component: 'key_takeaways_box',
        label: 'Key Takeaways',
        markdown: '> [!EDITORIAL-BLOCK-START|key_takeaways_box]\n> [!EDITORIAL-BLOCK-LABEL|Key Takeaways]\n> - First takeaway\n> [!EDITORIAL-BLOCK-END|key_takeaways_box]',
        afterBlockId: 'block-1',
      },
    ]

    const article = normalizeStagedArticle({
      id: 'staged-3',
      title: 'Lima cafes',
      content: '## Intro\n\nBody copy',
      blocks: storedBlocks,
      editorialBlocks: storedEditorialBlocks,
      locationId: 9,
      featuredImageId: 21,
      lexicalConverted: false,
      publishedToPayload: false,
      createdAt: '2026-03-16T00:00:00.000Z',
      updatedAt: '2026-03-16T00:00:00.000Z',
    })

    expect(article?.blocks).toEqual(storedBlocks)
    expect(article?.editorialBlocks).toEqual(storedEditorialBlocks)
    expect(article?.step1_complete).toBe(true)
    expect(article?.step2_complete).toBe(true)
    expect(article?.step3_complete).toBe(true)
  })
})
