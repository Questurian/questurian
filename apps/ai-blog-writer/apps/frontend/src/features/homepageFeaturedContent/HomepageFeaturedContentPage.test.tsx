import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import HomepageFeaturedContentPage from './HomepageFeaturedContentPage'
import { AuthContext, type AuthContextValue } from '../auth'

function createAuthValue(role: string): AuthContextValue {
  return {
    expiresAt: Date.now() + 60_000,
    user: {
      id: 'user-1',
      email: 'editor@example.com',
      role
    },
    isAuthenticated: true,
    isRestoringSession: false,
    isConnected: true,
    connectionError: null,
    login: vi.fn(),
    logout: vi.fn()
  }
}

function renderPage(role = 'editor') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={createAuthValue(role)}>
        <MemoryRouter>
          <HomepageFeaturedContentPage />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
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

    expect(
      screen.getByRole('heading', { level: 2, name: 'Homepages' })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/only admin and editor accounts can manage/i)
    ).toBeInTheDocument()
  })

  it('shows the main homepage hub card for editor', () => {
    const fetchMock = vi.fn()
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)

    renderPage('editor')

    expect(
      screen.getByRole('heading', { level: 1, name: 'Homepage Manager' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Edit content' })
    ).toBeInTheDocument()
  })

  it('groups neighborhoods inside their city clusters', async () => {
    const fetchMock = vi.fn()
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify([
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
              neighborhoodName: null
            }
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
              neighborhoodName: 'Barranco'
            }
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
              neighborhoodName: 'Miraflores'
            }
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
              neighborhoodName: 'El Poblado'
            }
          }
        ]),
        { status: 200 }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    renderPage('editor')

    expect(
      await screen.findByRole('heading', { level: 3, name: 'Peru' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 4, name: 'Lima' })
    ).toBeInTheDocument()
    expect(screen.getByText('Barranco')).toBeInTheDocument()
    expect(screen.getByText('Miraflores')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 4, name: 'Medellin' })
    ).toBeInTheDocument()
    expect(screen.getByText('No city homepage')).toBeInTheDocument()
    expect(screen.getByText('El Poblado')).toBeInTheDocument()
  })
})
