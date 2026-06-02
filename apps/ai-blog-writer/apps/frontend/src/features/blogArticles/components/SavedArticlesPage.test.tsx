/* @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StagedArticle } from '../../staging/types'
import type { SavedArticlesPageConfig, SavedBlogArticle } from '../types'
import SavedArticlesPage from './SavedArticlesPage'

const mockUseAuth = vi.hoisted(() => vi.fn())
const mockGetArticleById = vi.hoisted(() => vi.fn())
const mockGetAllStagedArticles = vi.hoisted(() => vi.fn())
const mockRemoveStagedArticle = vi.hoisted(() => vi.fn())

vi.mock('../../auth', () => ({
  useAuth: mockUseAuth,
}))

vi.mock('../../staging/api', () => ({
  getArticleById: mockGetArticleById,
}))

vi.mock('../../staging/features/editorial-stage-article/services/editorial-stage-storage.service', () => ({
  getAllStagedArticles: mockGetAllStagedArticles,
  removeStagedArticle: mockRemoveStagedArticle,
}))

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
}

function makeArticle(overrides: Partial<SavedBlogArticle> = {}): SavedBlogArticle {
  return {
    run_id: 'run-1',
    title: 'Generated Article',
    article_type: 'guide',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    markdown: '# Generated',
    markdown_length: 11,
    synced_to_payload: false,
    payload_article_id: null,
    synced_at: null,
    ...overrides,
  }
}

function makeDraft(overrides: Partial<StagedArticle> = {}): StagedArticle {
  return {
    id: 'draft-1',
    runId: 'run-local',
    originalTitle: 'Original',
    originalContent: 'Body',
    originalType: 'guide',
    title: 'Local Draft',
    content: 'Body',
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

function renderPage(config: SavedArticlesPageConfig<SavedBlogArticle>) {
  const queryClient = makeQueryClient()
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <SavedArticlesPage config={config} />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('SavedArticlesPage', () => {
  beforeEach(() => {
    mockUseAuth.mockReset()
    mockGetArticleById.mockReset()
    mockGetAllStagedArticles.mockReset()
    mockRemoveStagedArticle.mockReset()
  })

  it('uses config adapters for routes, storage key, actions, and article loading', async () => {
    const fetchArticles = vi.fn().mockResolvedValue([
      makeArticle({ run_id: 'run-generated' }),
      makeArticle({
        run_id: 'run-synced',
        title: 'Synced Article',
        synced_to_payload: true,
        payload_article_id: 44,
      }),
    ])
    const deleteArticle = vi.fn()
    const config: SavedArticlesPageConfig<SavedBlogArticle> = {
      featureKey: 'testblog',
      storageKey: 'test_staged_articles_v2',
      classNames: {
        savedLayout: 'test-saved-layout',
        statusNote: 'test-status-note',
      },
      heroActions: [
        { label: 'Back to Pipeline', to: '/testblog', variant: 'secondary' },
        { label: 'Article Types', to: '/testblog/article-types', variant: 'secondary' },
      ],
      fetchArticles,
      deleteArticle,
      buildStageUrl: (article) => `/testblog/stage-article?runId=${article.run_id}`,
      buildDraftUrl: (stagedId) => `/testblog/stage-article?stagedId=${stagedId}`,
    }

    mockUseAuth.mockReturnValue({ token: 'token-1' })
    mockGetAllStagedArticles.mockReturnValue([
      makeDraft({ id: 'draft-local' }),
    ])
    mockGetArticleById.mockResolvedValue({ id: 44, status: 'draft' })

    renderPage(config)

    await waitFor(() => expect(screen.getByText('Generated (1)')).toBeTruthy())

    expect(fetchArticles).toHaveBeenCalledTimes(1)
    expect(mockGetAllStagedArticles).toHaveBeenCalledWith('test_staged_articles_v2')
    expect(screen.getByRole('link', { name: 'Back to Pipeline' }).getAttribute('href')).toBe('/testblog')
    expect(screen.getByRole('link', { name: 'Article Types' }).getAttribute('href')).toBe('/testblog/article-types')
    expect(screen.getByRole('link', { name: 'Create Local Draft' }).getAttribute('href')).toBe('/testblog/stage-article?runId=run-generated')
    expect(screen.getByRole('link', { name: 'Resume' }).getAttribute('href')).toBe('/testblog/stage-article?stagedId=draft-local')
  })
})
