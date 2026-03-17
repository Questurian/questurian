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
})
