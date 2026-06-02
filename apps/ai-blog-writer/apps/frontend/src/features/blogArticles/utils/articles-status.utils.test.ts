import { describe, expect, it } from 'vitest'
import type { StagedArticle } from '../../staging/types'
import type { SavedBlogArticle } from '../types'
import {
  findLocalDraftForGeneratedArticle,
  resolveGeneratedArticleStatus,
  statusMeta
} from './articles-status.utils'

function makeArticle(
  overrides: Partial<SavedBlogArticle> = {}
): SavedBlogArticle {
  return {
    run_id: 'run-1',
    title: 'Article',
    article_type: 'guide',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    markdown: '# Draft',
    markdown_length: 7,
    synced_to_payload: false,
    payload_article_id: null,
    synced_at: null,
    ...overrides
  }
}

function makeDraft(overrides: Partial<StagedArticle> = {}): StagedArticle {
  return {
    id: 'draft-1',
    runId: 'run-1',
    originalTitle: 'Original',
    originalContent: 'Content',
    originalType: 'guide',
    title: 'Draft',
    content: 'Draft content',
    blocks: [],
    editorialBlocks: [],
    sharedNeighborhoods: [],
    lexicalConverted: false,
    publishedToPayload: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

describe('articles-status.utils', () => {
  it('maps synced payload statuses to draft/published and unsynced to generated', () => {
    expect(
      resolveGeneratedArticleStatus({
        article: makeArticle({
          synced_to_payload: false,
          payload_article_id: null
        }),
        payloadStatusByArticleId: {}
      })
    ).toBe('generated')

    expect(
      resolveGeneratedArticleStatus({
        article: makeArticle({
          synced_to_payload: true,
          payload_article_id: 42
        }),
        payloadStatusByArticleId: {}
      })
    ).toBe('draft')

    expect(
      resolveGeneratedArticleStatus({
        article: makeArticle({
          synced_to_payload: true,
          payload_article_id: 42
        }),
        payloadStatusByArticleId: { 42: 'published' }
      })
    ).toBe('published')
  })

  it('finds local draft by payload id first, then by run id', () => {
    expect(
      findLocalDraftForGeneratedArticle(
        [makeDraft({ id: 'p', payloadArticleId: 42, runId: 'run-x' })],
        makeArticle({ payload_article_id: 42, run_id: 'run-1' })
      )?.id
    ).toBe('p')

    expect(
      findLocalDraftForGeneratedArticle(
        [makeDraft({ id: 'r', runId: 'run-1' })],
        makeArticle({ payload_article_id: null, run_id: 'run-1' })
      )?.id
    ).toBe('r')
  })

  it('returns consistent status labels', () => {
    expect(statusMeta('generated')).toEqual({
      className: 'generated',
      label: 'Generated'
    })
    expect(statusMeta('draft')).toEqual({ className: 'draft', label: 'Draft' })
    expect(statusMeta('published')).toEqual({
      className: 'published',
      label: 'Published'
    })
  })
})
