import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const startGrill = vi.fn()
const answerGrill = vi.fn()
const loadGrill = vi.fn()
const loadOrder = vi.fn()
const reviseOrder = vi.fn()
const runSearch = vi.fn()
const loadSearch = vi.fn()

vi.mock('./api', async importOriginal => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    startGrill: (...args: unknown[]) => startGrill(...args),
    answerGrill: (...args: unknown[]) => answerGrill(...args),
    loadGrill: (...args: unknown[]) => loadGrill(...args),
    loadOrder: (...args: unknown[]) => loadOrder(...args),
    reviseOrder: (...args: unknown[]) => reviseOrder(...args),
    runSearch: (...args: unknown[]) => runSearch(...args),
    loadSearch: (...args: unknown[]) => loadSearch(...args),
  }
})

import { NotFoundError } from './api'
import { ListiclePipelinePage } from './pages/ListiclePipelinePage'
import type {
  ListicleGrillState,
  ListicleOrder,
  ListicleSearchResults,
} from './types'

/**
 * Getting back to a run.
 *
 * The interview and the searches were always stored on the server. What was
 * not stored anywhere the operator could reach was the run id: it lived in one
 * hook's memory, so a refresh landed on an empty seed box with a paid, agreed,
 * searched run in the database and no route to it. These are the behaviours
 * that fix costs money to get wrong.
 */

function grill(overrides: Partial<ListicleGrillState> = {}): ListicleGrillState {
  return {
    run_id: 'abc123',
    seed: '20 cevicherias in Lima',
    status: 'asking',
    consensus: '',
    markers_covered: ['kind'],
    markers_missing: ['place', 'count', 'bar', 'cut', 'angles'],
    lookups: [],
    turns: [],
    pending: {
      question_id: 'q1',
      ask: 'How many items?',
      recommendation: '20',
      pushback: '',
      options: [],
    },
    ...overrides,
  }
}

const AGREED = grill({
  status: 'agreed',
  consensus: 'Twenty cevicherias in Lima.',
  markers_covered: ['kind', 'place', 'count', 'bar', 'cut', 'angles'],
  markers_missing: [],
  pending: null,
})

function order(overrides: Partial<ListicleOrder> = {}): ListicleOrder {
  return {
    run_id: 'abc123',
    revision: 1,
    kind: 'cevicherias',
    place: 'Lima, Peru',
    target_count: 20,
    standard: 'written up by someone other than the place',
    exclusions: 'no chains',
    count_source: 'answered',
    count_ambiguous: false,
    count_note: '',
    capacity: 30,
    capacity_warning: '',
    summary: '20 cevicherias in Lima, Peru.',
    angles: [
      {
        angle_id: 'a1',
        text: 'cevicherias open for decades',
        shape_key: 'institution',
        group: 'heritage',
        role: 'broad',
        wanted: 15,
        edited: false,
        custom: false,
      },
    ],
    ...overrides,
  }
}

function results(overrides: Partial<ListicleSearchResults> = {}): ListicleSearchResults {
  return {
    run_id: 'abc123',
    revision: 1,
    target: 20,
    found: 1,
    shortfall: 19,
    rows_returned: 1,
    running: false,
    complete: true,
    uncertain_identity: 0,
    capacity: 30,
    capacity_warning: '',
    order: {
      kind: 'cevicherias',
      place: 'Lima, Peru',
      target_count: 20,
      standard: '',
      exclusions: '',
      count_source: 'answered',
      count_ambiguous: false,
      count_note: '',
    },
    angles: [
      {
        angle_id: 'a1',
        angle: 'cevicherias open for decades',
        shape: 'institution',
        group: 'heritage',
        role: 'broad',
        wanted: 15,
        edited: false,
        custom: false,
        state: 'completed',
        rows: 1,
        sources: 2,
        failed: false,
        reason: '',
        found: 1,
        shared: 0,
        exclusive: 1,
        gathered_at: '2026-09-08T10:00:00+00:00',
        sources_named: ['elcomercio.pe', 'ohlalima.com'],
        reused: false,
      },
    ],
    candidates: [
      {
        name: 'Canta Rana',
        district: 'Barranco',
        evidence: 'open since the 1980s',
        found_by: ['cevicherias open for decades'],
        overlap: 1,
        possible_duplicates: [],
        sightings: [],
      },
    ],
    ...overrides,
  }
}

function ShowLocation() {
  return <span data-testid="where">{useLocation().pathname}</span>
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ShowLocation />
      <Routes>
        <Route path="/listicle-pipeline" element={<ListiclePipelinePage />} />
        <Route path="/listicle-pipeline/:runId" element={<ListiclePipelinePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  startGrill.mockReset()
  answerGrill.mockReset()
  loadGrill.mockReset()
  loadOrder.mockReset().mockResolvedValue(null)
  reviseOrder.mockReset()
  runSearch.mockReset()
  loadSearch.mockReset().mockResolvedValue(null)
})

describe('getting back to a run', () => {
  it('puts a new run in the address bar', async () => {
    startGrill.mockResolvedValue(grill())
    renderAt('/listicle-pipeline')

    await userEvent.type(
      screen.getByRole('textbox'),
      '20 cevicherias in Lima',
    )
    await userEvent.click(screen.getByRole('button', { name: /start|begin|go/i }))

    await waitFor(() =>
      expect(screen.getByTestId('where')).toHaveTextContent(
        '/listicle-pipeline/abc123',
      ),
    )
  })

  it('opens the run named in the address rather than a blank seed box', async () => {
    loadGrill.mockResolvedValue(grill())
    renderAt('/listicle-pipeline/abc123')

    await waitFor(() => expect(loadGrill).toHaveBeenCalledWith('abc123'))
    expect(await screen.findByText(/How many items/)).toBeInTheDocument()
  })

  it('reads stored results instead of searching again', async () => {
    loadGrill.mockResolvedValue(AGREED)
    loadOrder.mockResolvedValue(order())
    loadSearch.mockResolvedValue(results())
    renderAt('/listicle-pipeline/abc123')

    expect(await screen.findByText('Canta Rana')).toBeInTheDocument()
    // The whole point: opening a screen is not a decision to spend.
    expect(runSearch).not.toHaveBeenCalled()
  })

  it('says a run does not exist rather than starting a new one', async () => {
    loadGrill.mockRejectedValue(new NotFoundError('No such interview'))
    renderAt('/listicle-pipeline/gone')

    expect(await screen.findByText(/no run with the id/i)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('a failed read is not reported as a run that was never searched', async () => {
    loadGrill.mockResolvedValue(AGREED)
    loadOrder.mockResolvedValue(order())
    loadSearch.mockRejectedValue(new Error('The database is unreachable.'))
    renderAt('/listicle-pipeline/abc123')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The database is unreachable.',
    )
  })
})

describe('the agreed order on screen', () => {
  it('shows the number that will actually be searched for', async () => {
    loadGrill.mockResolvedValue(AGREED)
    loadOrder.mockResolvedValue(order({ target_count: 20 }))
    renderAt('/listicle-pipeline/abc123')

    const panel = await screen.findByRole('region', {
      name: /the agreed search order/i,
    })
    expect(panel).toHaveTextContent('20')
    expect(panel).toHaveTextContent('cevicherias')
  })

  it('says when it is unsure how the number was read', async () => {
    loadGrill.mockResolvedValue(AGREED)
    loadOrder.mockResolvedValue(
      order({
        count_ambiguous: true,
        count_note: 'The answer mentioned 20, 40. Read as 20 -- correct it if that is wrong.',
      }),
    )
    renderAt('/listicle-pipeline/abc123')

    expect(await screen.findByText(/Read as 20/)).toBeInTheDocument()
  })

  it('lets the number be corrected, and the correction makes a new revision', async () => {
    loadGrill.mockResolvedValue(AGREED)
    loadOrder.mockResolvedValue(order())
    reviseOrder.mockResolvedValue(order({ target_count: 12, revision: 2 }))
    renderAt('/listicle-pipeline/abc123')

    await userEvent.click(
      await screen.findByRole('button', { name: /correct the number/i }),
    )
    const box = screen.getByLabelText(/how many items/i)
    await userEvent.clear(box)
    await userEvent.type(box, '12')
    await userEvent.click(screen.getByRole('button', { name: /use this number/i }))

    await waitFor(() =>
      expect(reviseOrder).toHaveBeenCalledWith('abc123', { target_count: 12 }),
    )
    expect(await screen.findByText(/revision 2/)).toBeInTheDocument()
  })

  it('says when the order cannot fill the list, without adding a search', async () => {
    loadGrill.mockResolvedValue(AGREED)
    loadOrder.mockResolvedValue(
      order({
        capacity: 5,
        capacity_warning:
          'These 1 searches ask for 5 places in total, which may not fill a list of 20.',
      }),
    )
    renderAt('/listicle-pipeline/abc123')

    expect(await screen.findByText(/may not fill a list of 20/)).toBeInTheDocument()
    const panel = screen.getByRole('region', { name: /the agreed search order/i })
    expect(panel.querySelectorAll('.lp-order-angle')).toHaveLength(1)
  })
})

describe('recovering from a partial failure', () => {
  it('keeps the searches that worked and offers to retry the one that did not', async () => {
    const partial = results({
      angles: [
        results().angles[0],
        {
          ...results().angles[0],
          angle_id: 'a2',
          angle: 'very cheap cevicherias',
          state: 'failed',
          failed: true,
          rows: 0,
          reason: 'TimeoutError',
          found: 0,
          shared: 0,
          exclusive: 0,
        },
      ],
    })
    loadGrill.mockResolvedValue(AGREED)
    loadOrder.mockResolvedValue(order())
    loadSearch.mockResolvedValue(partial)
    runSearch.mockResolvedValue(results())
    renderAt('/listicle-pipeline/abc123')

    // The successful angle's results are still on screen.
    expect(await screen.findByText('Canta Rana')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /retry 1 failed search/i }))
    await waitFor(() =>
      expect(runSearch).toHaveBeenCalledWith('abc123', {
        angleIds: ['a2'],
        reuse: false,
      }),
    )
  })

  it('names the publications the searches actually reached', async () => {
    // The citation URLs Google returns are opaque redirects. Without these
    // names nothing on the screen can say whether a search written to run in
    // the local language read local press or stopped at the visitor guides.
    loadGrill.mockResolvedValue(AGREED)
    loadOrder.mockResolvedValue(order())
    loadSearch.mockResolvedValue(results())
    renderAt('/listicle-pipeline/abc123')

    expect(await screen.findByText(/2 publications behind these results/)).toBeInTheDocument()
    expect(screen.getByText(/elcomercio\.pe · ohlalima\.com/)).toBeInTheDocument()
  })

  it('says when a result was reused rather than gathered now', async () => {
    loadGrill.mockResolvedValue(AGREED)
    loadOrder.mockResolvedValue(order())
    loadSearch.mockResolvedValue(
      results({ angles: [{ ...results().angles[0], reused: true }] }),
    )
    renderAt('/listicle-pipeline/abc123')

    expect(await screen.findByText(/reused from earlier research/i)).toBeInTheDocument()
  })

  it('does not call an interrupted search a failed one', async () => {
    loadGrill.mockResolvedValue(AGREED)
    loadOrder.mockResolvedValue(order())
    loadSearch.mockResolvedValue(
      results({
        angles: [
          {
            ...results().angles[0],
            state: 'interrupted',
            failed: true,
            reason: 'it never came back; re-running it may be charged again',
          },
        ],
      }),
    )
    renderAt('/listicle-pipeline/abc123')

    // Labelled as interrupted, not as failed: nobody knows whether the
    // provider answered, and retrying may be charged a second time.
    expect(
      await screen.findByText(/^interrupted —/),
    ).toBeInTheDocument()
    expect(screen.getByText(/may be charged again/)).toBeInTheDocument()
  })

  it('reports contribution without calling the most repeated place the best', async () => {
    loadGrill.mockResolvedValue(AGREED)
    loadOrder.mockResolvedValue(order())
    loadSearch.mockResolvedValue(
      results({
        candidates: [
          {
            ...results().candidates[0],
            found_by: ['a', 'b', 'c'],
            overlap: 3,
          },
        ],
      }),
    )
    renderAt('/listicle-pipeline/abc123')

    expect(await screen.findByText(/found by 3 searches/)).toBeInTheDocument()
    expect(screen.queryByText(/strongest|best/i)).not.toBeInTheDocument()
  })

  it('shows a possible duplicate rather than folding two venues into one', async () => {
    loadGrill.mockResolvedValue(AGREED)
    loadOrder.mockResolvedValue(order())
    loadSearch.mockResolvedValue(
      results({
        uncertain_identity: 1,
        candidates: [
          { ...results().candidates[0], possible_duplicates: ['Canta Rana Centro'] },
        ],
      }),
    )
    renderAt('/listicle-pipeline/abc123')

    expect(
      await screen.findByText(/Might be the same place as Canta Rana Centro/),
    ).toBeInTheDocument()
    expect(screen.getByText(/this count is provisional/)).toBeInTheDocument()
  })
})
