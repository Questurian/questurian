import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EvidenceHealth, SelectionReview } from './intake.types'

const readSelection = vi.fn()
const reviseSelection = vi.fn()
vi.mock('./intake.api', () => ({
  readSelection: (...args: unknown[]) => readSelection(...args),
  reviseSelection: (...args: unknown[]) => reviseSelection(...args),
}))

const { FactPicker } = await import('./components/FactPicker')

/**
 * What is weak about the facts about to reach the writer.
 *
 * The last screen before prose exists, which is the only place any of this is
 * cheap to act on. Once an article is written, an undated price has already
 * been stated in the present tense.
 */

const MEANS =
  'A date says how much an article is entitled to claim, never whether a fact is true. Nothing here has been re-checked.'

function health(overrides: Partial<EvidenceHealth> = {}): EvidenceHealth {
  return {
    promises_currency: true,
    checked_against: '2024-01-01',
    unmet_promise: false,
    findings: [],
    means: MEANS,
    ...overrides,
  }
}

function review(overrides: Partial<SelectionReview> = {}): SelectionReview {
  return {
    available: true,
    keep_count: 1,
    note: '',
    claims: [
      {
        claim_id: 'c1',
        text: 'Stall ceviche costs $8.',
        rank: 1,
        selected: true,
        rescued: false,
        dropped: false,
        why: 'The price the piece turns on.',
        questions: ['r1'],
        merged_in: [],
        confidence: 'high',
      },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  readSelection.mockReset()
  reviseSelection.mockReset()
})

describe('before this is written', () => {
  it('names an undated price while it is still cheap to act on', async () => {
    readSelection.mockResolvedValue(
      review({
        evidence_health: health({
          findings: [
            {
              kind: 'undated_time_sensitive',
              subject_ids: ['c1'],
              detail:
                '1 chosen fact states a price without saying when that was true.',
              blocks_currency_promise: false,
            },
          ],
        }),
      }),
    )

    render(<FactPicker runId="run-1" onChanged={() => {}} />)

    expect(
      await screen.findByText(/states a price without saying when that was true/),
    ).toBeInTheDocument()
  })

  it('never lets the findings be the last word', async () => {
    // A list of dated facts under a heading about evidence problems is read as
    // a list of wrong facts by the second person who sees it.
    readSelection.mockResolvedValue(
      review({
        evidence_health: health({
          findings: [
            {
              kind: 'undated_time_sensitive',
              subject_ids: ['c1'],
              detail: 'Something is undated.',
              blocks_currency_promise: false,
            },
          ],
        }),
      }),
    )

    render(<FactPicker runId="run-1" onChanged={() => {}} />)

    expect(
      await screen.findByText(/never whether a fact is true/),
    ).toBeInTheDocument()
  })

  it('reads louder only where the article promised what it cannot support', async () => {
    readSelection.mockResolvedValue(
      review({
        evidence_health: health({
          unmet_promise: true,
          findings: [
            {
              kind: 'currency_promise_unmet',
              subject_ids: ['c1'],
              detail: 'This article promises how things are now.',
              blocks_currency_promise: true,
            },
            {
              kind: 'no_source_to_return_to',
              subject_ids: ['c2'],
              detail: 'Nobody can go back and see whether it still holds.',
              blocks_currency_promise: false,
            },
          ],
        }),
      }),
    )

    render(<FactPicker runId="run-1" onChanged={() => {}} />)

    const promise = await screen.findByText(/promises how things are now/)
    const ordinary = screen.getByText(/Nobody can go back/)
    expect(promise).toHaveClass('p2b-health-promise')
    expect(ordinary).not.toHaveClass('p2b-health-promise')
  })

  it('says nothing at all about a clean dossier', async () => {
    readSelection.mockResolvedValue(review({ evidence_health: health() }))

    render(<FactPicker runId="run-1" onChanged={() => {}} />)

    await screen.findByText(/findings, most useful first/)
    expect(screen.queryByText('Before this is written')).not.toBeInTheDocument()
  })

  it('says nothing on a run recorded before any of this existed', async () => {
    readSelection.mockResolvedValue(review())

    render(<FactPicker runId="run-1" onChanged={() => {}} />)

    await screen.findByText(/findings, most useful first/)
    expect(screen.queryByText('Before this is written')).not.toBeInTheDocument()
  })
})
