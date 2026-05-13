/* @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StagedArticle } from '../../staging/types'
import type { SavedArticle } from '../api'
import ArticlesPage from './ArticlesPage'

const mockUseAuth = vi.hoisted(() => vi.fn())
const mockFetchArticles = vi.hoisted(() => vi.fn())
const mockDeleteArticle = vi.hoisted(() => vi.fn())
const mockGetArticleById = vi.hoisted(() => vi.fn())
const mockGetAllStagedArticles = vi.hoisted(() => vi.fn())
const mockRemoveStagedArticle = vi.hoisted(() => vi.fn())

vi.mock('../../auth', () => ({
  useAuth: mockUseAuth,
}))

vi.mock('../api', () => ({
  fetchArticles: mockFetchArticles,
  deleteArticle: mockDeleteArticle,
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

function renderPage() {
  const queryClient = makeQueryClient()
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ArticlesPage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

function makeSavedArticle(overrides: Partial<SavedArticle> = {}): SavedArticle {
  return {
    run_id: 'run-1',
    title: 'Sample Article',
    article_type: 'guide',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    markdown: '# Sample',
    markdown_length: 8,
    synced_to_payload: false,
    payload_article_id: null,
    synced_at: null,
    ...overrides,
  }
}

function makeDraft(overrides: Partial<StagedArticle> = {}): StagedArticle {
  return {
    id: 'staged-1',
    runId: 'run-1',
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

describe('YouTube2Blog ArticlesPage', () => {
  beforeEach(() => {
    mockUseAuth.mockReset()
    mockFetchArticles.mockReset()
    mockDeleteArticle.mockReset()
    mockGetArticleById.mockReset()
    mockGetAllStagedArticles.mockReset()
    mockRemoveStagedArticle.mockReset()
  })

  it('shows local drafts and payload statuses with local overlay', async () => {
    mockUseAuth.mockReturnValue({ token: 'token-1' })
    mockGetAllStagedArticles.mockReturnValue([
      makeDraft({ id: 'local-only', runId: 'run-local', title: 'Only Local' }),
      makeDraft({ id: 'local-linked', runId: 'run-1', payloadArticleId: 101, title: 'Linked Local Draft' }),
    ])
    mockFetchArticles.mockResolvedValue([
      makeSavedArticle({
        run_id: 'run-1',
        title: 'Synced Article',
        synced_to_payload: true,
        payload_article_id: 101,
      }),
      makeSavedArticle({
        run_id: 'run-2',
        title: 'Unsynced Article',
        synced_to_payload: false,
        payload_article_id: null,
      }),
    ])
    mockGetArticleById.mockResolvedValue({ id: 101, status: 'published' })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Local Drafts (1)')).toBeTruthy()
      expect(screen.getByText('Generated (1)')).toBeTruthy()
      expect(screen.getByText('Payload Documents (1)')).toBeTruthy()
    })

    expect(screen.getByText('Only Local')).toBeTruthy()
    expect(screen.getByText('Published')).toBeTruthy()
    expect(screen.getByText('Local Edits')).toBeTruthy()
    expect(screen.getByText('Unsynced Article')).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'Resume' })).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Create Local Draft' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Staged/i })).toBeNull()
  })

  it('shows empty states when no data exists', async () => {
    mockUseAuth.mockReturnValue({ token: 'token-1' })
    mockGetAllStagedArticles.mockReturnValue([])
    mockFetchArticles.mockResolvedValue([])

    renderPage()

    await waitFor(() => expect(screen.getByText('Local Drafts (0)')).toBeTruthy())
    await waitFor(() => expect(screen.getByText('Generated (0)')).toBeTruthy())
    await waitFor(() => expect(screen.getByText('Payload Documents (0)')).toBeTruthy())
    await waitFor(() => expect(screen.getByText('No generated-only runs.')).toBeTruthy())

    expect(screen.getByText('No local drafts saved.')).toBeTruthy()
    expect(screen.getByText('No synced payload documents yet.')).toBeTruthy()
  })
})
