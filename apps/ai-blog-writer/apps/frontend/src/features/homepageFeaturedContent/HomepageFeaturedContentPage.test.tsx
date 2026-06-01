import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import HomepageFeaturedContentPage from './HomepageFeaturedContentPage'
import { AuthContext, type AuthContextValue } from '../auth'

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

  afterEach(() => {
    vi.unstubAllGlobals()
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

  it('confirms before clearing all homepage content', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const body = url.endsWith('/api/homepage-featured-content/reset')
        ? { locationHomepagesCleared: 0 }
        : []
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()

    renderPage('editor')

    await user.click(screen.getByRole('button', { name: 'Clear all page data' }))
    expect(screen.getByRole('dialog', { name: 'Clear all homepage content?' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear all content' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:4000/api/homepage-featured-content/reset',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('groups neighborhoods inside their city clusters', async () => {
    const fetchMock = vi.fn()
    fetchMock.mockResolvedValue(new Response(JSON.stringify([
      {
        id: 11,
        isEnabled: true,
        updatedAt: '2026-04-10T12:00:00.000Z',
        location: {
          id: 101,
          locationKey: 'peru|lima',
          level: 'city',
          countryName: 'Peru',
          cityName: 'Lima',
          neighborhoodName: null,
        },
      },
      {
        id: 12,
        isEnabled: false,
        updatedAt: '2026-04-10T12:00:00.000Z',
        location: {
          id: 102,
          locationKey: 'peru|lima|barranco',
          level: 'neighborhood',
          countryName: 'Peru',
          cityName: 'Lima',
          neighborhoodName: 'Barranco',
        },
      },
      {
        id: 13,
        isEnabled: true,
        updatedAt: '2026-04-10T12:00:00.000Z',
        location: {
          id: 103,
          locationKey: 'peru|lima|miraflores',
          level: 'neighborhood',
          countryName: 'Peru',
          cityName: 'Lima',
          neighborhoodName: 'Miraflores',
        },
      },
      {
        id: 14,
        isEnabled: true,
        updatedAt: '2026-04-10T12:00:00.000Z',
        location: {
          id: 104,
          locationKey: 'colombia|medellin|el-poblado',
          level: 'neighborhood',
          countryName: 'Colombia',
          cityName: 'Medellin',
          neighborhoodName: 'El Poblado',
        },
      },
    ]), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    renderPage('editor')

    expect(await screen.findByRole('heading', { level: 3, name: 'Peru' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 4, name: 'Lima' })).toBeInTheDocument()
    expect(screen.getByText('Barranco')).toBeInTheDocument()
    expect(screen.getByText('Miraflores')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 4, name: 'Medellin' })).toBeInTheDocument()
    expect(screen.getByText('No city homepage')).toBeInTheDocument()
    expect(screen.getByText('El Poblado')).toBeInTheDocument()
  })

  it('keeps the city cluster visible when filtering to a neighborhood', async () => {
    const fetchMock = vi.fn()
    fetchMock.mockResolvedValue(new Response(JSON.stringify([
      {
        id: 21,
        isEnabled: true,
        updatedAt: '2026-04-10T12:00:00.000Z',
        location: {
          id: 201,
          locationKey: 'peru|lima',
          level: 'city',
          countryName: 'Peru',
          cityName: 'Lima',
          neighborhoodName: null,
        },
      },
      {
        id: 22,
        isEnabled: true,
        updatedAt: '2026-04-10T12:00:00.000Z',
        location: {
          id: 202,
          locationKey: 'peru|lima|barranco',
          level: 'neighborhood',
          countryName: 'Peru',
          cityName: 'Lima',
          neighborhoodName: 'Barranco',
        },
      },
      {
        id: 23,
        isEnabled: true,
        updatedAt: '2026-04-10T12:00:00.000Z',
        location: {
          id: 203,
          locationKey: 'peru|lima|miraflores',
          level: 'neighborhood',
          countryName: 'Peru',
          cityName: 'Lima',
          neighborhoodName: 'Miraflores',
        },
      },
      {
        id: 24,
        isEnabled: true,
        updatedAt: '2026-04-10T12:00:00.000Z',
        location: {
          id: 204,
          locationKey: 'colombia|medellin|el-poblado',
          level: 'neighborhood',
          countryName: 'Colombia',
          cityName: 'Medellin',
          neighborhoodName: 'El Poblado',
        },
      },
    ]), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    renderPage('editor')

    await screen.findByRole('heading', { level: 4, name: 'Lima' })

    await userEvent.type(
      screen.getByRole('searchbox', { name: /search location homepages/i }),
      'Barranco',
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 4, name: 'Lima' })).toBeInTheDocument()
      expect(screen.getByText('Barranco')).toBeInTheDocument()
      expect(screen.queryByText('Miraflores')).not.toBeInTheDocument()
      expect(screen.queryByRole('heading', { level: 4, name: 'Medellin' })).not.toBeInTheDocument()
    })
  })
})
