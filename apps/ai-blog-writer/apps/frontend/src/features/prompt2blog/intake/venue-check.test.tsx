import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const readVenues = vi.fn()
const markVenue = vi.fn()

vi.mock('./intake.api', async importOriginal => ({
  ...(await importOriginal<typeof import('./intake.api')>()),
  readVenues: (runId: string) => readVenues(runId),
  markVenue: (runId: string, body: unknown) => markVenue(runId, body),
}))

import { VenueCheck } from './components/VenueCheck'
import type { VenueToCheck } from './intake.types'

/**
 * The screen that asked run a2066506's operator to confirm KFC was still open.
 *
 * Two faults, and they need different answers. A place nobody doubts should
 * never have been on the list — and until the research prompt stops tagging
 * them, clearing one has to be free. A place that genuinely holds up a question
 * is the opposite: dropping it costs something, and the cost has to be visible
 * before the click rather than discovered after it.
 */

function venue(overrides: Partial<VenueToCheck> = {}): VenueToCheck {
  return {
    claim_id: 'c1',
    venue: 'Hotel Maury',
    text: 'Hotel Maury sits two blocks from the Plaza Mayor.',
    urls: [],
    note: '',
    sole_support_for: [],
    ...overrides,
  }
}

beforeEach(() => {
  readVenues.mockReset()
  markVenue.mockReset()
  markVenue.mockResolvedValue({})
})

describe('clearing a place that never needed checking', () => {
  it('offers a move that is not the destructive one', async () => {
    readVenues.mockResolvedValue({ venues: [venue({ venue: 'KFC' })] })
    render(<VenueCheck runId="r1" onChanged={() => {}} />)
    await screen.findByText('KFC')

    await userEvent.click(screen.getByRole('button', { name: 'Not worth checking' }))

    await waitFor(() =>
      expect(markVenue).toHaveBeenCalledWith('r1', { claim_id: 'c1', dismiss: true }),
    )
    // Not a drop. The claim stays in the dossier holding up whatever it held up.
    expect(markVenue).not.toHaveBeenCalledWith('r1', expect.objectContaining({ drop: true }))
  })

  it('says the dossier was left alone, so the two moves are not confused', async () => {
    readVenues.mockResolvedValue({ venues: [venue({ venue: 'Starbucks' })] })
    render(<VenueCheck runId="r1" onChanged={() => {}} />)
    await screen.findByText('Starbucks')

    await userEvent.click(screen.getByRole('button', { name: 'Not worth checking' }))

    expect(await screen.findByText(/stays in the dossier/)).toBeTruthy()
  })
})

describe('what a drop would cost, before the click', () => {
  it('stays quiet when the question survives without this place', async () => {
    readVenues.mockResolvedValue({ venues: [venue()] })
    render(<VenueCheck runId="r1" onChanged={() => {}} />)
    await screen.findByText('Hotel Maury')

    expect(screen.queryByText(/back behind the gate/)).toBeNull()
  })

  it('names the question a drop would put back behind the gate', async () => {
    readVenues.mockResolvedValue({
      venues: [venue({ sole_support_for: ['q3'] })],
    })
    render(<VenueCheck runId="r1" onChanged={() => {}} />)

    const warning = await screen.findByText(/back behind the gate/)
    expect(warning.textContent).toContain('q3')
    expect(warning.textContent).toContain('A note costs nothing.')
  })

  it('re-reads the cost after a move, because one drop changes the others', async () => {
    // Two claims hold up q3, so neither costs anything to drop. Once the first
    // goes, the second is the only support left — and a list read once at mount
    // would still be promising it was free.
    readVenues
      .mockResolvedValueOnce({
        venues: [
          venue({ claim_id: 'c1', venue: 'Bar Cordano' }),
          venue({ claim_id: 'c2', venue: 'Bar Maury' }),
        ],
      })
      .mockResolvedValueOnce({
        venues: [venue({ claim_id: 'c2', venue: 'Bar Maury', sole_support_for: ['q3'] })],
      })

    render(<VenueCheck runId="r1" onChanged={() => {}} />)
    await screen.findByText('Bar Cordano')
    expect(screen.queryByText(/back behind the gate/)).toBeNull()

    const dropButtons = screen.getAllByRole('button', { name: 'Drop it' })
    await userEvent.click(dropButtons[0])

    const warning = await screen.findByText(/back behind the gate/)
    expect(warning.textContent).toContain('q3')
    // The row that was acted on keeps its confirmation rather than vanishing.
    expect(screen.getByText(/will not reach the writer/)).toBeTruthy()
  })
})
