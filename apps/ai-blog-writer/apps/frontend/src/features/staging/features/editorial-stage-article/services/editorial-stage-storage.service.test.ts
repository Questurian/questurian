/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../api/staged-drafts/staged-drafts.api', () => ({
  fetchStagedDrafts: vi.fn(),
  fetchStagedDraft: vi.fn(),
  putStagedDraft: vi.fn(),
  deleteStagedDraft: vi.fn(),
  clearStagedDrafts: vi.fn(),
}))

import {
  clearStagedDrafts,
  deleteStagedDraft,
  fetchStagedDrafts,
  putStagedDraft,
} from '../../../api/staged-drafts/staged-drafts.api'
import {
  clearAllStagedArticles,
  getAllStagedArticles,
  normalizeStagedArticle,
  removeStagedArticle,
  upsertStagedArticle,
} from './editorial-stage-storage.service'
import type { StagedArticle } from '../../../types'

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

  it('preserves createdBy/lastEditedBy stamps and drops malformed ones', () => {
    const article = normalizeStagedArticle({
      id: 'staged-3',
      title: 'Lima cafes',
      content: 'Some content',
      blocks: [],
      editorialBlocks: [],
      lexicalConverted: false,
      publishedToPayload: false,
      createdBy: { id: '1', email: 'writer@example.com', name: 'Writer One' },
      lastEditedBy: { id: '', email: 'missing-id@example.com' },
      createdAt: '2026-03-16T00:00:00.000Z',
      updatedAt: '2026-03-16T00:00:00.000Z',
    })

    expect(article?.createdBy).toEqual({ id: '1', email: 'writer@example.com', name: 'Writer One' })
    expect(article?.lastEditedBy).toBeUndefined()
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

describe('server-backed staged draft storage', () => {
  const storageKey = 'test_staged_articles'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('fetches drafts for a storage key and normalizes each one', async () => {
    vi.mocked(fetchStagedDrafts).mockResolvedValue([
      // Missing/loose fields on purpose: normalization must still yield a full draft.
      { id: 'staged-1', title: 'Server draft' } as unknown as StagedArticle,
    ])

    const result = await getAllStagedArticles(storageKey)

    expect(fetchStagedDrafts).toHaveBeenCalledWith(storageKey)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('staged-1')
    expect(result[0].sharedNeighborhoods).toEqual([])
    expect(result[0].syncBehavior).toBe('finalize')
  })

  it('upserts a single draft via the API (no full-array rewrite)', async () => {
    const draft = { id: 'staged-9', title: 'One' } as unknown as StagedArticle
    await upsertStagedArticle(storageKey, draft)
    expect(putStagedDraft).toHaveBeenCalledTimes(1)
    expect(putStagedDraft).toHaveBeenCalledWith(storageKey, draft, undefined)
  })

  it('removes a single draft by id via the API', async () => {
    await removeStagedArticle(storageKey, 'staged-9')
    expect(deleteStagedDraft).toHaveBeenCalledWith(storageKey, 'staged-9')
  })

  it('clears all drafts for a storage key via the API', async () => {
    await clearAllStagedArticles(storageKey)
    expect(clearStagedDrafts).toHaveBeenCalledWith(storageKey)
  })
})
