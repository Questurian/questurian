import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ListicleItinerariesPage from './ListicleItinerariesPage'
import { createEmptyDraft, saveDraft } from '../storage'

vi.mock('../api', () => ({
  fetchItineraries: vi.fn(),
}))

const { fetchItineraries } = await import('../api')
const fetchItinerariesMock = vi.mocked(fetchItineraries)

function renderPage() {
  return render(
    <MemoryRouter>
      <ListicleItinerariesPage />
    </MemoryRouter>,
  )
}

afterEach(() => {
  window.localStorage.clear()
  vi.clearAllMocks()
})

describe('ListicleItinerariesPage', () => {
  it('still lists local drafts when the Payload read is refused', async () => {
    saveDraft({
      ...createEmptyDraft(),
      title: 'Two Days in Cusco',
      location: 'peru|cusco',
    })

    fetchItinerariesMock.mockRejectedValue(
      new Error('You are not allowed to perform this action.'),
    )

    renderPage()

    // The Payload error belongs to the Payload panel only. The drafts in this
    // browser need nothing from the server, so they must survive its refusal.
    await waitFor(() => {
      expect(
        screen.getByText(/You are not allowed to perform this action/),
      ).toBeInTheDocument()
    })
    expect(screen.getByText('Two Days in Cusco')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Local Drafts \(1\)/ })).toBeInTheDocument()
  })

  it('lists Payload documents when the read succeeds', async () => {
    fetchItinerariesMock.mockResolvedValue({
      docs: [
        {
          id: 7,
          title: 'One Day in Lima',
          location: 'peru|lima',
          status: 'draft',
          updatedAt: '2026-09-18T10:00:00.000Z',
        },
      ],
    } as never)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('One Day in Lima')).toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: /Payload Documents \(1\)/ })).toBeInTheDocument()
  })
})
