import { describe, expect, it } from 'vitest'
import type { StagedArticle } from '../../staging/types'
import type { SavedArticle } from '../api'
import {
  findLocalDraftForGeneratedArticle,
  resolveGeneratedArticleStatus,
} from './articles-status.utils'

function makeArticle(overrides: Partial<SavedArticle> = {}): SavedArticle {
  return {
    run_id: 'run-a',
    title: 'Article A',
    article_type: 'guide',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    markdown: '# A',
    markdown_length: 3,
    ...overrides,
  }
}

function makeDraft(overrides: Partial<StagedArticle> = {}): StagedArticle {
  return {
    id: 'staged-a',
    runId: 'run-a',
    originalTitle: 'Original',
    originalContent: 'Body',
    originalType: 'guide',
    title: 'Draft',
    content: 'Draft Body',
    blocks: [],
    editorialBlocks: [],
    sharedNeighborhoods: [],
    lexicalConverted: false,
    publishedToPayload: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('articles-status.utils', () => {
  it('marks unsynced article as generated', () => {
    const status = resolveGeneratedArticleStatus({
      article: makeArticle({ synced_to_payload: false, payload_article_id: null }),
      payloadStatusByArticleId: {},
    })
    expect(status).toBe('generated')
  })

  it('maps synced article to payload draft status', () => {
    const status = resolveGeneratedArticleStatus({
      article: makeArticle({ synced_to_payload: true, payload_article_id: 42 }),
      payloadStatusByArticleId: { 42: 'draft' },
    })
    expect(status).toBe('draft')
  })

  it('maps synced article to payload published status', () => {
    const status = resolveGeneratedArticleStatus({
      article: makeArticle({ synced_to_payload: true, payload_article_id: 42 }),
      payloadStatusByArticleId: { 42: 'published' },
    })
    expect(status).toBe('published')
  })

  it('falls back to draft when synced article payload lookup is unavailable', () => {
    const status = resolveGeneratedArticleStatus({
      article: makeArticle({ synced_to_payload: true, payload_article_id: 42 }),
      payloadStatusByArticleId: {},
    })
    expect(status).toBe('draft')
  })

  it('matches local draft by payloadArticleId first', () => {
    const draftByPayload = makeDraft({ id: 'payload-match', payloadArticleId: 42, runId: 'other-run' })
    const draftByRun = makeDraft({ id: 'run-match', runId: 'run-a' })
    const matched = findLocalDraftForGeneratedArticle(
      [draftByPayload, draftByRun],
      makeArticle({ run_id: 'run-a', payload_article_id: 42 }),
    )
    expect(matched?.id).toBe('payload-match')
  })

  it('falls back to runId match when payload id not available', () => {
    const draftByRun = makeDraft({ id: 'run-match', runId: 'run-a' })
    const matched = findLocalDraftForGeneratedArticle(
      [draftByRun],
      makeArticle({ run_id: 'run-a', payload_article_id: null }),
    )
    expect(matched?.id).toBe('run-match')
  })
})
