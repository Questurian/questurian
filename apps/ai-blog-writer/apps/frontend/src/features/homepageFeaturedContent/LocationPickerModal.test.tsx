import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LocationPickerModal } from './LocationPickerModal'

function renderModal() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <LocationPickerModal
        existingLocationIds={[]}
        onSelect={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />
    </QueryClientProvider>,
  )
}

describe('LocationPickerModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('groups neighborhood options inside their parent city cluster', async () => {
    const cityResponse = {
      docs: [
        {
          id: 1,
          level: 'city',
          country: 'peru',
          city: 'lima',
          neighborhood: '',
          countryName: 'Peru',
          cityName: 'Lima',
          neighborhoodName: '',
          locationKey: 'peru|lima',
          parentKey: 'peru',
          updatedAt: '2026-04-10T12:00:00.000Z',
        },
      ],
      totalPages: 1,
    }
    const neighborhoodResponse = {
      docs: [
        {
          id: 2,
          level: 'neighborhood',
          country: 'peru',
          city: 'lima',
          neighborhood: 'barranco',
          countryName: 'Peru',
          cityName: 'Lima',
          neighborhoodName: 'Barranco',
          locationKey: 'peru|lima|barranco',
          parentKey: 'peru|lima',
          updatedAt: '2026-04-10T12:00:00.000Z',
        },
        {
          id: 3,
          level: 'neighborhood',
          country: 'peru',
          city: 'lima',
          neighborhood: 'miraflores',
          countryName: 'Peru',
          cityName: 'Lima',
          neighborhoodName: 'Miraflores',
          locationKey: 'peru|lima|miraflores',
          parentKey: 'peru|lima',
          updatedAt: '2026-04-10T12:00:00.000Z',
        },
      ],
      totalPages: 1,
    }
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      const payload = url.includes('where%5Blevel%5D%5Bequals%5D=city')
        ? cityResponse
        : neighborhoodResponse
      return Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    renderModal()

    expect(await screen.findByRole('heading', { level: 3, name: 'Lima' })).toBeInTheDocument()
    expect(screen.getByText('Neighborhoods')).toBeInTheDocument()
    expect(screen.getByText('Barranco, Lima')).toBeInTheDocument()
    expect(screen.getByText('Miraflores, Lima')).toBeInTheDocument()
  })

  it('preserves the city shell when a neighborhood search matches', async () => {
    const cityResponse = {
      docs: [
        {
          id: 1,
          level: 'city',
          country: 'peru',
          city: 'lima',
          neighborhood: '',
          countryName: 'Peru',
          cityName: 'Lima',
          neighborhoodName: '',
          locationKey: 'peru|lima',
          parentKey: 'peru',
          updatedAt: '2026-04-10T12:00:00.000Z',
        },
        {
          id: 4,
          level: 'city',
          country: 'colombia',
          city: 'medellin',
          neighborhood: '',
          countryName: 'Colombia',
          cityName: 'Medellin',
          neighborhoodName: '',
          locationKey: 'colombia|medellin',
          parentKey: 'colombia',
          updatedAt: '2026-04-10T12:00:00.000Z',
        },
      ],
      totalPages: 1,
    }
    const neighborhoodResponse = {
      docs: [
        {
          id: 2,
          level: 'neighborhood',
          country: 'peru',
          city: 'lima',
          neighborhood: 'barranco',
          countryName: 'Peru',
          cityName: 'Lima',
          neighborhoodName: 'Barranco',
          locationKey: 'peru|lima|barranco',
          parentKey: 'peru|lima',
          updatedAt: '2026-04-10T12:00:00.000Z',
        },
        {
          id: 3,
          level: 'neighborhood',
          country: 'peru',
          city: 'lima',
          neighborhood: 'miraflores',
          countryName: 'Peru',
          cityName: 'Lima',
          neighborhoodName: 'Miraflores',
          locationKey: 'peru|lima|miraflores',
          parentKey: 'peru|lima',
          updatedAt: '2026-04-10T12:00:00.000Z',
        },
        {
          id: 5,
          level: 'neighborhood',
          country: 'colombia',
          city: 'medellin',
          neighborhood: 'el-poblado',
          countryName: 'Colombia',
          cityName: 'Medellin',
          neighborhoodName: 'El Poblado',
          locationKey: 'colombia|medellin|el-poblado',
          parentKey: 'colombia|medellin',
          updatedAt: '2026-04-10T12:00:00.000Z',
        },
      ],
      totalPages: 1,
    }
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      const payload = url.includes('where%5Blevel%5D%5Bequals%5D=city')
        ? cityResponse
        : neighborhoodResponse
      return Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    renderModal()

    await screen.findByRole('heading', { level: 3, name: 'Lima' })

    await userEvent.type(
      screen.getByPlaceholderText('Search cities or neighborhoods…'),
      'Barranco',
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 3, name: 'Lima' })).toBeInTheDocument()
      expect(screen.getByText('Barranco, Lima')).toBeInTheDocument()
      expect(screen.queryByText('Miraflores, Lima')).not.toBeInTheDocument()
      expect(screen.queryByRole('heading', { level: 3, name: 'Medellin' })).not.toBeInTheDocument()
    })
  })
})
