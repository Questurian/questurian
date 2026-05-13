import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import MainHomepagePage from './MainHomepagePage'
import { AuthContext, type AuthContextValue } from '../auth'
import type { MainHomepageResponse } from './api'

function createAuthValue(): AuthContextValue {
  return {
    token: 'test-token',
    expiresAt: Date.now() + 60_000,
    user: {
      id: 'user-1',
      email: 'editor@example.com',
      role: 'editor',
    },
    isAuthenticated: true,
    isRestoringSession: false,
    isConnected: true,
    connectionError: null,
    login: vi.fn(),
    logout: vi.fn(),
  }
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={createAuthValue()}>
        <MemoryRouter>
          <MainHomepagePage />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
}

const homepage: MainHomepageResponse = {
  pageBlocks: [
    {
      id: 'featured-a',
      blockType: 'featured-article',
      sectionHeading: null,
      sectionSubheading: null,
      selection: {
        items: [],
        invalidItems: [],
        isComplete: false,
        allowDrafts: true,
        totalSlots: 1,
      },
    },
  ],
}

const emptyCandidates = {
  docs: [],
  totalDocs: 0,
  totalPages: 1,
  page: 1,
  limit: 24,
  allowDrafts: true,
}

describe('MainHomepagePage performance behavior', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not fetch picker candidates until a slot picker opens', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      const payload = url.includes('/candidates') ? emptyCandidates : homepage

      return Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    await screen.findByRole('button', { name: /choose featured article/i })

    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/candidates')))
      .toBe(false)

    await user.click(screen.getByRole('button', { name: /choose featured article/i }))

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/candidates')))
        .toBe(true)
    })
  })
})
