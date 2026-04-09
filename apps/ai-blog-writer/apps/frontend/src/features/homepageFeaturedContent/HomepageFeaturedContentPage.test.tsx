import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import HomepageFeaturedContentPage from './HomepageFeaturedContentPage'
import { AuthContext, type AuthContextValue } from '../../providers/auth-context'
import type {
  HomepageFeaturedCandidate,
  HomepageFeaturedSelection,
} from './types'

function buildCandidate(id: number, overrides: Partial<HomepageFeaturedCandidate> = {}): HomepageFeaturedCandidate {
  return {
    id,
    relationTo: 'articles',
    title: `Article ${id}`,
    slug: `article-${id}`,
    status: 'draft',
    updatedAt: `2026-04-${String((id % 28) + 1).padStart(2, '0')}T10:00:00.000Z`,
    publishedAt: null,
    collectionLabel: 'Standard Article',
    ...overrides,
  }
}

function buildSelection(count: number): HomepageFeaturedSelection {
  return {
    items: Array.from({ length: count }, (_, index) => ({
      ...buildCandidate(index + 1),
      slot: index + 1,
    })),
    invalidItems: [],
    isComplete: count === 10,
    allowDrafts: true,
    totalSlots: 10,
  }
}

function createAuthValue(role: string): AuthContextValue {
  return {
    token: 'test-token',
    expiresAt: Date.now() + 60_000,
    user: {
      id: 'user-1',
      email: 'editor@example.com',
      role,
    },
    isAuthenticated: true,
    isRestoringSession: false,
    isConnected: true,
    connectionError: null,
    login: vi.fn(),
    logout: vi.fn(),
  }
}

function renderPage(role = 'editor') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={createAuthValue(role)}>
        <MemoryRouter>
          <HomepageFeaturedContentPage />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
}

describe('HomepageFeaturedContentPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('blocks writer access', () => {
    renderPage('writer')

    expect(screen.getByRole('heading', { level: 1, name: 'Homepage Featured Content' })).toBeInTheDocument()
    expect(screen.getByText(/only admin and editor accounts can manage/i)).toBeInTheDocument()
  })

  it('supports remove, add, replace, move, and reset interactions', async () => {
    const fetchMock = vi.fn()
    const selection = buildSelection(10)
    const candidates = {
      docs: [
        buildCandidate(11),
        buildCandidate(12),
      ],
      totalDocs: 2,
      totalPages: 1,
      page: 1,
      limit: 24,
      allowDrafts: true,
    }

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(selection), { status: 200 }))
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(candidates), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const { container } = renderPage()

    expect(await screen.findByText('Article 1')).toBeInTheDocument()

    const saveButton = screen.getByRole('button', { name: /save homepage top 10/i })
    expect(saveButton).toBeDisabled()

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[9])
    expect(saveButton).toBeDisabled()

    const candidateElevenCard = (await screen.findByText('Article 11')).closest(
      '.homepage-featured-candidate',
    ) as HTMLElement | null
    if (!candidateElevenCard) {
      throw new Error('Article 11 candidate card was not rendered')
    }
    fireEvent.click(within(candidateElevenCard).getByRole('button', { name: 'Add to slot 10' }))
    expect(saveButton).not.toBeDisabled()
    await waitFor(() => {
      const slots = container.querySelectorAll('.homepage-featured-slot')
      expect(within(slots[9] as HTMLElement).getByText('Article 11')).toBeInTheDocument()
    })

    fireEvent.click(screen.getAllByRole('button', { name: 'Replace' })[0])
    const candidateTwelveCard = screen.getByText('Article 12').closest(
      '.homepage-featured-candidate',
    ) as HTMLElement | null
    if (!candidateTwelveCard) {
      throw new Error('Article 12 candidate card was not rendered')
    }
    fireEvent.click(within(candidateTwelveCard).getByRole('button', { name: 'Replace slot 1' }))
    await waitFor(() => {
      const slots = container.querySelectorAll('.homepage-featured-slot')
      expect(within(slots[0] as HTMLElement).getByText('Article 12')).toBeInTheDocument()
    })

    fireEvent.click(screen.getAllByRole('button', { name: 'Move down' })[0])

    await waitFor(() => {
      const slots = container.querySelectorAll('.homepage-featured-slot')
      expect(within(slots[0] as HTMLElement).getByText('Article 2')).toBeInTheDocument()
      expect(within(slots[1] as HTMLElement).getByText('Article 12')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /reset \/ discard/i }))

    await waitFor(() => {
      const slots = container.querySelectorAll('.homepage-featured-slot')
      expect(within(slots[0] as HTMLElement).getByText('Article 1')).toBeInTheDocument()
      expect(within(slots[9] as HTMLElement).getByText('Article 10')).toBeInTheDocument()
    })
  })

  it('prevents duplicates, enables save only with 10 slots, and saves ordered refs', async () => {
    const fetchMock = vi.fn()
    const selection = buildSelection(9)
    const candidates = {
      docs: [
        buildCandidate(9),
        buildCandidate(10),
      ],
      totalDocs: 2,
      totalPages: 1,
      page: 1,
      limit: 24,
      allowDrafts: true,
    }
    const savedSelection = buildSelection(10)

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(selection), { status: 200 }))
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(candidates), { status: 200 }))
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(savedSelection), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    expect(await screen.findByText('Article 9')).toBeInTheDocument()

    const duplicateButton = screen.getByRole('button', { name: 'Already selected' })
    expect(duplicateButton).toBeDisabled()

    const saveButton = screen.getByRole('button', { name: /save homepage top 10/i })
    expect(saveButton).toBeDisabled()

    const candidateTenCard = screen.getByText('Article 10').closest(
      '.homepage-featured-candidate',
    ) as HTMLElement | null
    if (!candidateTenCard) {
      throw new Error('Article 10 candidate card was not rendered')
    }
    fireEvent.click(within(candidateTenCard).getByRole('button', { name: 'Add to slot 10' }))
    expect(saveButton).not.toBeDisabled()

    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    expect(fetchMock.mock.calls[2]?.[0]).toContain('/api/homepage-featured-content')
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({
      items: Array.from({ length: 10 }, (_, index) => ({
        relationTo: 'articles',
        id: index + 1,
      })),
    })

    expect(await screen.findByText('Homepage featured content saved.')).toBeInTheDocument()
  })
})
