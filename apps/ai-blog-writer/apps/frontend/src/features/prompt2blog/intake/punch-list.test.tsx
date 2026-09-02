import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PunchList as PunchListPayload } from './intake.types'

const readPunchList = vi.fn()
vi.mock('./intake.api', () => ({
  readPunchList: (...args: unknown[]) => readPunchList(...args),
}))

const { PunchList } = await import('./components/PunchList')

/**
 * The screen that tells a person what to fix, and where each fact comes from.
 *
 * Run 062c0b86 was headlined "older than the Inca Empire" and never gave a
 * date. The useful note is that no research established one. A note supplying
 * a date would be an invented fact entering a published article at the last
 * possible moment, so the two kinds of item must never read alike.
 */

function payload(overrides: Partial<PunchListPayload> = {}): PunchListPayload {
  return {
    run_id: 'run-1',
    items: [],
    researched_and_unused: [],
    dropped: [],
    ...overrides,
  }
}

beforeEach(() => {
  readPunchList.mockReset()
})

describe('where each fact comes from', () => {
  it('quotes the research behind an item the run already has', async () => {
    readPunchList.mockResolvedValue(
      payload({
        items: [
          {
            kind: 'move',
            heading: 'What the digs found',
            where: 'The site sits in Miraflores',
            note: 'The strongest fact in the piece is in section two.',
            needs: 'have_it',
            have: [
              {
                claim_id: 'c1',
                text: 'Excavations recovered 16,000 shark vertebrae from the site.',
              },
            ],
          },
        ],
      }),
    )
    render(<PunchList runId="run-1" />)

    expect(await screen.findByText(/You already have this/i)).toBeTruthy()
    expect(screen.getByText(/16,000 shark vertebrae/)).toBeTruthy()
    expect(screen.queryByText(/Nobody established this/i)).toBeNull()
  })

  it('says an unresearched item needs looking up, and gives no value', async () => {
    readPunchList.mockResolvedValue(
      payload({
        items: [
          {
            kind: 'add_sentence',
            heading: 'What the digs found',
            where: 'The site sits in Miraflores',
            note: 'The headline promises an age and no date appears anywhere.',
            needs: 'not_established',
            have: [],
          },
        ],
      }),
    )
    render(<PunchList runId="run-1" />)

    expect(await screen.findByText(/Nobody established this/i)).toBeTruthy()
    expect(screen.queryByText(/You already have this/i)).toBeNull()
  })

  it('places an item on a heading, and says so plainly when it cannot', async () => {
    readPunchList.mockResolvedValue(
      payload({
        items: [
          {
            kind: 'rephrase',
            heading: '',
            where: '',
            note: 'It opens on how long the visit takes.',
            needs: 'not_established',
            have: [],
          },
        ],
      }),
    )
    render(<PunchList runId="run-1" />)

    expect(await screen.findByText(/The article overall/i)).toBeTruthy()
  })
})

describe('the half that needed no model', () => {
  it('lists what was researched and never used, even with no items at all', async () => {
    readPunchList.mockResolvedValue(
      payload({
        researched_and_unused: [
          { claim_id: 'c1', text: 'Excavations recovered 16,000 shark vertebrae.' },
        ],
      }),
    )
    render(<PunchList runId="run-1" />)

    expect(await screen.findByText(/safe to add today/i)).toBeTruthy()
  })

  it('says when an item was thrown away rather than quietly showing fewer', async () => {
    readPunchList.mockResolvedValue(
      payload({
        dropped: ['an item that introduced a figure the run does not have (400)'],
        researched_and_unused: [{ claim_id: 'c1', text: 'Something unused.' }],
      }),
    )
    render(<PunchList runId="run-1" />)

    expect(await screen.findByText(/figure the run does not have \(400\)/)).toBeTruthy()
  })
})

describe('when it does not come back', () => {
  it('says the article is unaffected, because that is the point of running here', async () => {
    readPunchList.mockRejectedValue(new Error('nope'))
    render(<PunchList runId="run-1" />)

    expect(await screen.findByText(/The article is unaffected/i)).toBeTruthy()
  })

  it('shows nothing at all when there is nothing to say', async () => {
    readPunchList.mockResolvedValue(payload())
    const { container } = render(<PunchList runId="run-1" />)

    await waitFor(() => expect(container.querySelector('.p2b-punch')).toBeNull())
  })
})
