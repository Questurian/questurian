import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import HomepageFeaturedContentPage from './HomepageFeaturedContentPage'
import { AuthContext, type AuthContextValue } from '../../providers/auth-context'

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
      queries: { retry: false },
      mutations: { retry: false },
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

    expect(screen.getByRole('heading', { level: 2, name: 'Homepages' })).toBeInTheDocument()
    expect(screen.getByText(/only admin and editor accounts can manage/i)).toBeInTheDocument()
  })

  it('shows the main homepage hub card for editor', () => {
    const fetchMock = vi.fn()
    fetchMock.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    renderPage('editor')

    expect(screen.getByRole('heading', { level: 1, name: 'Homepage Manager' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit content' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Add location' })).toBeInTheDocument()
  })
})
