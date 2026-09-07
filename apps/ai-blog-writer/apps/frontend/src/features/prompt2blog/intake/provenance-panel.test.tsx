import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProvenanceReport } from './intake.types'

const readProvenance = vi.fn()
const confirmProvenance = vi.fn()
vi.mock('./intake.api', () => ({
  readProvenance: (...args: unknown[]) => readProvenance(...args),
  confirmProvenance: (...args: unknown[]) => confirmProvenance(...args),
}))

const { ProvenancePanel } = await import('./components/ProvenancePanel')

/**
 * The panel that says where a passage came from.
 *
 * Its whole risk is that it looks like a check. A list of facts sitting beside
 * a sentence reads as a verified sentence unless the screen says otherwise,
 * and a badge colour cannot carry that.
 */

const MEANS =
  'A link means a passage and a chosen fact share a figure or a distinctive phrase. It is not a check that the sentence means what the fact means.'

const PASSAGE = 'Market ceviche runs about $8, well under the tasting menus at $95.'

function report(overrides: Partial<ProvenanceReport> = {}): ProvenanceReport {
  return {
    run_id: 'run-1',
    passages: [
      {
        passage_id: 's1.p0',
        section_id: 's1',
        heading: 'Where to eat',
        text: PASSAGE,
        text_hash: 'abc123',
        links: [
          {
            passage_id: 's1.p0',
            passage_hash: 'abc123',
            source_kind: 'claim',
            source_id: 'c1',
            basis: 'figure',
            shared: ['$8'],
            status: 'provisional',
            text: 'Stall ceviche in Surquillo market is priced around $8.',
            as_of: '2026-08-01',
            confidence: 'high',
            operator_note: '',
            caveats: ['Price surveyed in August 2026; stalls vary.'],
          },
        ],
        unmatched_figures: [],
      },
    ],
    summary: { means: MEANS },
    ...overrides,
  }
}

beforeEach(() => {
  readProvenance.mockReset()
  confirmProvenance.mockReset()
})

describe('answering where a passage came from', () => {
  it('shows the fact, its date, and the limit on stating it', async () => {
    readProvenance.mockResolvedValue(report())

    render(<ProvenancePanel runId="run-1" selected={PASSAGE} onClose={() => {}} />)

    await screen.findByText(/Stall ceviche in Surquillo market/)
    // The two things an editor asks next, without a trip to the dossier.
    expect(screen.getByText(/as of 2026-08-01/)).toBeInTheDocument()
    expect(screen.getByText(/Price surveyed in August 2026/)).toBeInTheDocument()
  })

  it('says what was matched, not merely that something was', async () => {
    readProvenance.mockResolvedValue(report())

    render(<ProvenancePanel runId="run-1" selected={PASSAGE} onClose={() => {}} />)

    await screen.findByText(/the figure/)
    expect(screen.getByText('$8')).toBeInTheDocument()
  })

  it('never lets the list of facts be the last word', async () => {
    readProvenance.mockResolvedValue(report())

    render(<ProvenancePanel runId="run-1" selected={PASSAGE} onClose={() => {}} />)

    expect(await screen.findByText(new RegExp('not a check'))).toBeInTheDocument()
  })

  it('matches the passage on its text, not on its position', async () => {
    // The article is rendered from the markdown and the map skips blocks that
    // carry no claim, so the two lists are not the same length.
    readProvenance.mockResolvedValue(report())

    render(
      <ProvenancePanel
        runId="run-1"
        selected={`  ${PASSAGE.replace(' well', '\n well')}  `}
        onClose={() => {}}
      />,
    )

    await screen.findByText(/Stall ceviche in Surquillo market/)
  })
})

describe('what it refuses to imply', () => {
  it('offers a confirmation rather than claiming one', async () => {
    readProvenance.mockResolvedValue(report())
    confirmProvenance.mockResolvedValue(undefined)

    render(<ProvenancePanel runId="run-1" selected={PASSAGE} onClose={() => {}} />)
    const button = await screen.findByRole('button', {
      name: 'These say the same thing',
    })
    await userEvent.click(button)

    await waitFor(() =>
      expect(confirmProvenance).toHaveBeenCalledWith('run-1', {
        passage_hash: 'abc123',
        source_kind: 'claim',
        source_id: 'c1',
      }),
    )
  })

  it('says a confirmed link was read by a person', async () => {
    const confirmed = report()
    confirmed.passages[0].links[0].status = 'confirmed'
    readProvenance.mockResolvedValue(confirmed)

    render(<ProvenancePanel runId="run-1" selected={PASSAGE} onClose={() => {}} />)

    expect(
      await screen.findByText('You read these together and agreed.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'These say the same thing' }),
    ).not.toBeInTheDocument()
  })

  it('interrupts for a figure that matches nothing on the desk', async () => {
    const orphan = report()
    orphan.passages[0].unmatched_figures = ['$30']
    readProvenance.mockResolvedValue(orphan)

    render(<ProvenancePanel runId="run-1" selected={PASSAGE} onClose={() => {}} />)

    expect(
      await screen.findByText(/These figures match nothing on the desk/),
    ).toBeInTheDocument()
  })

  it('excuses a passage with nothing behind it instead of flagging it', async () => {
    // Judgement, transition and general background are allowed to have no fact
    // behind them, and reporting them as unsourced would train the operator to
    // ignore the panel.
    readProvenance.mockResolvedValue(report())

    render(
      <ProvenancePanel runId="run-1" selected="The choice is easy." onClose={() => {}} />,
    )

    expect(
      await screen.findByText(/may be judgement, transition, or general background/),
    ).toBeInTheDocument()
  })
})

describe('a run that predates the map', () => {
  it('explains itself rather than showing an error', async () => {
    const refused = Object.assign(new Error('no packet'), { status: 409 })
    readProvenance.mockRejectedValue(refused)

    render(<ProvenancePanel runId="run-1" selected={PASSAGE} onClose={() => {}} />)

    expect(
      await screen.findByText(/finished before the writer’s material was kept/),
    ).toBeInTheDocument()
  })
})
