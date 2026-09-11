import { render, screen, waitFor, within } from '@testing-library/react'
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
const listRuns = vi.fn()
const setRunHidden = vi.fn()
const loadBoard = vi.fn()
const resolveDuplicates = vi.fn()
const restoreCandidate = vi.fn()

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
    listRuns: (...args: unknown[]) => listRuns(...args),
    setRunHidden: (...args: unknown[]) => setRunHidden(...args),
    loadBoard: (...args: unknown[]) => loadBoard(...args),
    resolveDuplicates: (...args: unknown[]) => resolveDuplicates(...args),
    restoreCandidate: (...args: unknown[]) => restoreCandidate(...args),
  }
})

import { NotFoundError } from './api'
import { CANDIDATE_CHECKLIST } from './components/CandidateCard'
import { ListiclePipelinePage } from './pages/ListiclePipelinePage'
import type {
  ListicleGrillState,
  ListicleCandidate,
  ListicleOrder,
  ListicleRunSummary,
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
    answer_notes: [],
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
        candidate_id: 'cand-canta-rana',
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

/** The app's router runs every navigation as a transition. Tests render the
 *  same way, because a screen reset commits BEFORE a transitioned navigation
 *  does, and the gap between the two is where "Opening run…" got stuck. */
function renderAt(path: string) {
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
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
  listRuns.mockReset().mockResolvedValue([])
  setRunHidden.mockReset().mockResolvedValue(undefined)
  loadBoard.mockReset().mockResolvedValue({ removed: [], distinct_pairs: [] })
  resolveDuplicates.mockReset()
  restoreCandidate.mockReset()
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
      // The revision the screen was showing travels with the correction, so
      // the server can refuse one typed against a version that has moved.
      expect(reviseOrder).toHaveBeenCalledWith('abc123', {
        target_count: 12,
        expected_revision: 1,
      }),
    )
    expect(await screen.findByText(/revision 2/)).toBeInTheDocument()
  })

  it('says when a marker was answered twice and both answers are being used', async () => {
    // The fault of 2026-09-08: the cut was settled, then asked again
    // additively, and the later answer silently replaced the earlier one. Both
    // are kept now, and keeping both is a reading rather than a certainty, so
    // it is on screen next to the value it produced.
    loadGrill.mockResolvedValue(AGREED)
    loadOrder.mockResolvedValue(
      order({
        exclusions: 'no chains, no delivery-only kitchens. No hotel restaurants.',
        answer_notes: [
          'What is left out: This was answered twice and every answer is being used. Correct it here if one of them was meant to replace the others.',
        ],
      }),
    )
    renderAt('/listicle-pipeline/abc123')

    expect(
      await screen.findByText(/every answer is being used/),
    ).toBeInTheDocument()
  })

  it('lets the cut be typed out, because a combined one may keep a rule they dropped', async () => {
    loadGrill.mockResolvedValue(AGREED)
    loadOrder.mockResolvedValue(order({ answer_notes: ['What is left out: ...'] }))
    reviseOrder.mockResolvedValue(
      order({ exclusions: 'no chains', revision: 2, answer_notes: [] }),
    )
    renderAt('/listicle-pipeline/abc123')

    await userEvent.click(
      await screen.findByRole('button', { name: /what is left out/i }),
    )
    const box = screen.getByLabelText(/what is left out/i)
    await userEvent.clear(box)
    await userEvent.type(box, 'no chains only')
    await userEvent.click(screen.getByRole('button', { name: /use these/i }))

    await waitFor(() =>
      expect(reviseOrder).toHaveBeenCalledWith('abc123', {
        standard: 'written up by someone other than the place',
        exclusions: 'no chains only',
        expected_revision: 1,
      }),
    )
    expect(await screen.findByText(/revision 2/)).toBeInTheDocument()
  })

  it('says what a search bought last time, before this time is paid for', async () => {
    // Run 33fca394 spent two of seven searches on angles that returned no
    // place the others missed. The numbers existed only on a table drawn after
    // the money was gone.
    loadGrill.mockResolvedValue(AGREED)
    loadOrder.mockResolvedValue(
      order({
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
            last_time:
              'The last time this search ran here it returned 6 rows and no place the other searches missed.',
          },
        ],
      }),
    )
    renderAt('/listicle-pipeline/abc123')

    expect(
      await screen.findByText(/no place the other searches missed/),
    ).toBeInTheDocument()
  })

  it('says the candidates were never checked against the cut', async () => {
    // Run 33fca394 returned eight Nikkei and Japanese restaurants against an
    // explicit "no places where ceviche is not the primary offering". A list
    // presented without saying so reads as though something checked it.
    loadGrill.mockResolvedValue(AGREED)
    loadOrder.mockResolvedValue(order())
    loadSearch.mockResolvedValue(
      results({
        order: {
          kind: 'cevicherias',
          place: 'Lima, Peru',
          target_count: 20,
          standard: '',
          exclusions: 'no places where ceviche is not the primary offering',
          count_source: 'answered',
          count_ambiguous: false,
          count_note: '',
        },
      }),
    )
    renderAt('/listicle-pipeline/abc123')

    expect(
      await screen.findByText(/has been checked against what you left out/),
    ).toBeInTheDocument()
  })

  it('warns that an approved search fights the cut, before it is paid for', async () => {
    // Run 33fca394 approved "Nikkei cevicherias" alongside "no places where
    // ceviche is not the primary offering". 8 of that search's 10 results were
    // barred by the order that bought it.
    loadGrill.mockResolvedValue(AGREED)
    loadOrder.mockResolvedValue(
      order({
        conflicts_checked: true,
        angle_conflicts: [
          {
            angle_id: 'a1',
            angle_text: 'cevicherias open for decades',
            why: 'Most Nikkei restaurants serve ceviche among many dishes.',
          },
        ],
      }),
    )
    renderAt('/listicle-pipeline/abc123')

    expect(await screen.findByText(/Fights what you left out/)).toBeInTheDocument()
  })

  it('does not let an unchecked order read as a cleared one', async () => {
    loadGrill.mockResolvedValue(AGREED)
    loadOrder.mockResolvedValue(
      order({ conflicts_checked: false, exclusions: 'no chains' }),
    )
    renderAt('/listicle-pipeline/abc123')

    expect(
      await screen.findByText(/have not been checked against what you left out/),
    ).toBeInTheDocument()
  })

  it('marks a returned place that breaks the cut, without removing it', async () => {
    loadGrill.mockResolvedValue(AGREED)
    loadOrder.mockResolvedValue(order())
    loadSearch.mockResolvedValue(
      results({
        cut_checked: true,
        barred_count: 1,
        order: {
          kind: 'cevicherias',
          place: 'Lima, Peru',
          target_count: 20,
          standard: '',
          exclusions: 'no places where ceviche is not the primary offering',
          count_source: 'answered',
          count_ambiguous: false,
          count_note: '',
        },
        candidates: [
          {
            candidate_id: 'cand-maido',
            name: 'Maido',
            district: 'Miraflores',
            evidence: 'top Nikkei restaurant, offers ceviche',
            found_by: ['nikkei'],
            overlap: 1,
            possible_duplicates: [],
            sightings: [],
            barred: 'Ceviche is one dish of many here.',
            barred_confidence: 'clear',
          },
        ],
      }),
    )
    renderAt('/listicle-pipeline/abc123')

    // Flagged, never removed. The flag is research, so it lives in the
    // place's details rather than on the card.
    await userEvent.click(await screen.findByRole('button', { name: 'Details for Maido' }))
    const details = screen.getByRole('dialog', { name: 'Details for Maido' })
    expect(within(details).getByText(/Looks like something you left out/)).toBeInTheDocument()
    expect(within(details).getByText(/Ceviche is one dish of many here/)).toBeInTheDocument()
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

    expect(await screen.findByText(/found by 3 searches/i)).toBeInTheDocument()
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

describe('reading the places', () => {
  const WINGMAN: ListicleCandidate = {
    candidate_id: 'cand-wingman',
    name: 'Wingman',
    district: 'Miraflores',
    evidence: 'especializado en alitas, shows fútbol',
    found_by: [
      'Lima sports bars where people watch the fútbol over a plate of alitas',
      'Pollerías in Lima serving alitas a la brasa',
    ],
    overlap: 2,
    possible_duplicates: ['Wingman Barranco'],
    sightings: [
      {
        sighting_id: 's1',
        angle: 'Lima sports bars where people watch the fútbol over a plate of alitas',
        name: 'Wingman',
        district: 'Miraflores',
        evidence: 'especializado en alitas, shows fútbol',
      },
      {
        sighting_id: 's2',
        angle: 'Pollerías in Lima serving alitas a la brasa',
        name: 'Wingman Miraflores',
        district: 'Miraflores',
        evidence: 'alitas a la brasa con ají verde',
      },
    ],
  }

  async function openWings() {
    loadGrill.mockResolvedValue(AGREED)
    loadOrder.mockResolvedValue(order())
    loadSearch.mockResolvedValue(results({ candidates: [WINGMAN] }))
    renderAt('/listicle-pipeline/abc123')
    await screen.findByText('Wingman')
  }

  it('keeps the card to name, district, repeat finds and a possible duplicate', async () => {
    await openWings()

    expect(screen.getByText('Miraflores')).toBeInTheDocument()
    expect(screen.getByText(/found by 2 searches/i)).toBeInTheDocument()
    expect(screen.getByText(/Might be the same place as Wingman Barranco/)).toBeInTheDocument()
    // What the searches said is research, and stays off the card.
    expect(screen.queryByText(/especializado en alitas/)).not.toBeInTheDocument()
    expect(screen.queryByText(/alitas a la brasa con ají verde/)).not.toBeInTheDocument()
  })

  it('opens what every search said about one place, and closes again', async () => {
    await openWings()

    await userEvent.click(screen.getByRole('button', { name: 'Details for Wingman' }))
    const details = screen.getByRole('dialog', { name: 'Details for Wingman' })
    expect(within(details).getByText(/Found by 2 searches/)).toBeInTheDocument()
    expect(within(details).getByText(/especializado en alitas, shows fútbol/)).toBeInTheDocument()
    expect(within(details).getByText(/alitas a la brasa con ají verde/)).toBeInTheDocument()
    expect(within(details).getByText(/Listed as Wingman Miraflores/)).toBeInTheDocument()
    expect(
      within(details).getByText('Pollerías in Lima serving alitas a la brasa'),
    ).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('gives every place its own checklist, and ticking one touches no other', async () => {
    loadGrill.mockResolvedValue(AGREED)
    loadOrder.mockResolvedValue(order())
    loadSearch.mockResolvedValue(
      results({
        candidates: [WINGMAN, { ...WINGMAN, candidate_id: 'cand-juno', name: 'JUNO WINGS' }],
      }),
    )
    renderAt('/listicle-pipeline/abc123')

    const wingman = await screen.findByRole('list', { name: 'Checklist for Wingman' })
    const juno = screen.getByRole('list', { name: 'Checklist for JUNO WINGS' })
    const boxes = within(wingman).getAllByRole('checkbox')
    expect(boxes).toHaveLength(CANDIDATE_CHECKLIST.length)

    await userEvent.click(within(wingman).getByLabelText(CANDIDATE_CHECKLIST[0]))

    expect(within(wingman).getByLabelText(CANDIDATE_CHECKLIST[0])).toBeChecked()
    expect(within(juno).getByLabelText(CANDIDATE_CHECKLIST[0])).not.toBeChecked()
  })

  it('looks a place up on Google and Maps in one click, in the right city', async () => {
    loadGrill.mockResolvedValue(AGREED)
    loadOrder.mockResolvedValue(order())
    loadSearch.mockResolvedValue(
      results({ candidates: [{ ...WINGMAN, name: 'Wingman [Miraflores]' }] }),
    )
    renderAt('/listicle-pipeline/abc123')

    const google = await screen.findByRole('link', {
      name: 'Search Google for Wingman [Miraflores]',
    })
    const maps = screen.getByRole('link', { name: 'Find Wingman [Miraflores] on Google Maps' })
    // The bracketed branch is dropped; the district and the list's city are
    // what tell Google which Wingman.
    const query = encodeURIComponent('Wingman Miraflores Lima, Peru')
    expect(google).toHaveAttribute('href', `https://www.google.com/search?q=${query}`)
    expect(maps).toHaveAttribute(
      'href',
      `https://www.google.com/maps/search/?api=1&query=${query}`,
    )
    expect(google).toHaveAttribute('target', '_blank')
  })

  it('folds how the places were found under one line above them', async () => {
    await openWings()

    const fold = screen.getByText(/How these were found/).closest('details')
    expect(fold).not.toBeNull()
    expect(fold).not.toHaveAttribute('open')
    // The per-search table is inside the fold, not above the places.
    expect(fold?.querySelector('.lp-angle-table')).not.toBeNull()
  })
})

describe('settling a possible duplicate', () => {
  const place = (id: string, name: string, district: string, dupes: string[]): ListicleCandidate => ({
    candidate_id: id,
    name,
    district,
    evidence: `${name} evidence`,
    found_by: ['wings in Lima'],
    overlap: 1,
    possible_duplicates: dupes,
    possible_duplicate_ids: dupes,
    sightings: [],
  })
  const WINGMAN = place('wm', 'Wingman', 'Miraflores', ['wa', 'wb'])
  const ALITAS = place('wa', 'Wingman Alitas Inc.', 'Miraflores', ['wm'])
  const BARRANCO = place('wb', 'Wingman', 'Barranco', ['wm'])

  async function openBoard(board = { removed: [], distinct_pairs: [] }) {
    loadGrill.mockResolvedValue(AGREED)
    loadOrder.mockResolvedValue(order())
    loadSearch.mockResolvedValue(results({ found: 3, candidates: [WINGMAN, ALITAS, BARRANCO] }))
    loadBoard.mockResolvedValue(board)
    renderAt('/listicle-pipeline/abc123')
    await screen.findByText('Wingman Alitas Inc.')
    await waitFor(() => expect(loadBoard).toHaveBeenCalledWith('abc123'))
  }

  function cardOf(name: string) {
    return screen.getByRole('list', { name: `Checklist for ${name}` }).closest('li.lp-candidate') as HTMLElement
  }

  it('opens the check from the warning itself', async () => {
    await openBoard()

    await userEvent.click(within(cardOf('Wingman Alitas Inc.')).getByRole('button', { name: /Sort it out/ }))

    const check = screen.getByRole('dialog', { name: 'Is Wingman Alitas Inc. a duplicate?' })
    expect(within(check).getByText('Wingman Alitas Inc.')).toBeInTheDocument()
    expect(within(check).getByRole('group', { name: 'Is Wingman the same place?' })).toBeInTheDocument()
  })

  it('chooses nothing for you, and will not remove until a keeper is picked', async () => {
    await openBoard()
    await userEvent.click(within(cardOf('Wingman Alitas Inc.')).getByRole('button', { name: /Sort it out/ }))
    const check = screen.getByRole('dialog')

    expect(within(check).getByRole('button', { name: 'Save' })).toBeDisabled()
    await userEvent.click(within(check).getByRole('button', { name: 'Same place' }))
    expect(within(check).getByRole('button', { name: 'Choose which one stays' })).toBeDisabled()
    expect(within(check).getAllByRole('radio').every(radio => !(radio as HTMLInputElement).checked)).toBe(true)
  })

  it('keeps the chosen place and moves the other to the bottom, where it can be put back', async () => {
    await openBoard()
    resolveDuplicates.mockResolvedValue({
      removed: [{ candidate_id: 'wa', kept_id: 'wm', removed_at: '2026-09-11T20:00:00+00:00' }],
      distinct_pairs: [],
    })
    await userEvent.click(within(cardOf('Wingman Alitas Inc.')).getByRole('button', { name: /Sort it out/ }))
    const check = screen.getByRole('dialog')

    await userEvent.click(within(check).getByRole('button', { name: 'Same place' }))
    await userEvent.click(within(check).getByRole('radio', { name: /Wingman \(Miraflores\)/ }))
    await userEvent.click(within(check).getByRole('button', { name: 'Keep Wingman, remove 1' }))

    expect(resolveDuplicates).toHaveBeenCalledWith('abc123', {
      candidate_id: 'wa',
      same: ['wm'],
      different: [],
      keep: 'wm',
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByRole('list', { name: 'Checklist for Wingman Alitas Inc.' })).not.toBeInTheDocument()
    expect(screen.getByText(/1 removed as a duplicate/)).toBeInTheDocument()
    expect(screen.getByText('Removed places (1)')).toBeInTheDocument()

    restoreCandidate.mockResolvedValue({ removed: [], distinct_pairs: [] })
    await userEvent.click(screen.getByRole('button', { name: 'Put back Wingman Alitas Inc.' }))
    expect(restoreCandidate).toHaveBeenCalledWith('abc123', 'wa')
    expect(await screen.findByRole('list', { name: 'Checklist for Wingman Alitas Inc.' })).toBeInTheDocument()
  })

  it('stops warning about a pair once they are called different places', async () => {
    await openBoard()
    resolveDuplicates.mockResolvedValue({ removed: [], distinct_pairs: [['wb', 'wm']] })
    // Two cards are called Wingman; the district is what tells them apart.
    const barranco = screen
      .getAllByRole('list', { name: 'Checklist for Wingman' })
      .map(list => list.closest('li.lp-candidate') as HTMLElement)
      .find(card => within(card).queryByText('Barranco'))!
    await userEvent.click(within(barranco).getByRole('button', { name: /Sort it out/ }))
    const check = screen.getByRole('dialog')

    await userEvent.click(within(check).getByRole('button', { name: 'Different place' }))
    await userEvent.click(within(check).getByRole('button', { name: 'Save: a different place' }))

    expect(resolveDuplicates).toHaveBeenCalledWith('abc123', {
      candidate_id: 'wb',
      same: [],
      different: ['wm'],
      keep: '',
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(within(barranco).queryByText(/Might be the same place/)).not.toBeInTheDocument()
    // The Miraflores Wingman is still flagged against the other one.
    const miraflores = cardOf('Wingman Alitas Inc.')
    expect(within(miraflores).getByText(/Might be the same place as Wingman \(Miraflores\)/)).toBeInTheDocument()
    // Nothing was removed.
    expect(screen.queryByText(/Removed places/)).not.toBeInTheDocument()
  })
})

describe('the shelf of saved lists', () => {
  const WINGS: ListicleRunSummary = {
    run_id: 'efd5a7cd',
    seed: 'The Best Chicken Wings in Lima Peru',
    status: 'agreed',
    stage: 'searched',
    found: 44,
    target: 20,
    created_at: '2026-09-11 13:28:38',
    touched_at: '2026-09-11 13:51:00',
    hidden: false,
  }
  const OLD: ListicleRunSummary = {
    ...WINGS,
    run_id: 'c422e80f',
    seed: 'The 30 Best Cevicherias in Lima',
    stage: 'interview',
    found: null,
    target: null,
    hidden: true,
  }

  it('shows every saved list and how far it got', async () => {
    listRuns.mockResolvedValue([WINGS, OLD])
    renderAt('/listicle-pipeline')

    expect(await screen.findByText('The Best Chicken Wings in Lima Peru')).toBeInTheDocument()
    expect(screen.getByText(/44 places found for a list of 20/)).toBeInTheDocument()
    // Hidden lists stay off the shelf until asked for.
    expect(screen.queryByText('The 30 Best Cevicherias in Lima')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Show 1 hidden' }))
    expect(screen.getByText('The 30 Best Cevicherias in Lima')).toBeInTheDocument()
  })

  it('opens a saved list by reading it, never by searching it', async () => {
    listRuns.mockResolvedValue([WINGS])
    loadGrill.mockResolvedValue({ ...AGREED, run_id: 'efd5a7cd' })
    renderAt('/listicle-pipeline')

    await userEvent.click(await screen.findByText('The Best Chicken Wings in Lima Peru'))

    await waitFor(() =>
      expect(screen.getByTestId('where')).toHaveTextContent('/listicle-pipeline/efd5a7cd'),
    )
    await waitFor(() => expect(loadGrill).toHaveBeenCalledWith('efd5a7cd'))
    expect(runSearch).not.toHaveBeenCalled()
  })

  it('hides a list without touching it', async () => {
    listRuns.mockResolvedValueOnce([WINGS]).mockResolvedValue([{ ...WINGS, hidden: true }])
    renderAt('/listicle-pipeline')

    await screen.findByText('The Best Chicken Wings in Lima Peru')
    await userEvent.click(screen.getByRole('button', { name: 'Hide' }))

    expect(setRunHidden).toHaveBeenCalledWith('efd5a7cd', true)
    expect(await screen.findByRole('button', { name: 'Show 1 hidden' })).toBeInTheDocument()
  })

  it('is not shown inside a run, which links back to it instead', async () => {
    loadGrill.mockResolvedValue(grill())
    renderAt('/listicle-pipeline/abc123')

    expect(await screen.findByText(/How many items/)).toBeInTheDocument()
    expect(listRuns).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('link', { name: 'All lists' }))
    await waitFor(() =>
      expect(screen.getByTestId('where')).toHaveTextContent(/^\/listicle-pipeline$/),
    )
    expect(await screen.findByRole('region', { name: 'Your lists' })).toBeInTheDocument()
    expect(screen.queryByText(/Opening run/)).not.toBeInTheDocument()
  })

  it('starting over lands on the seed box, not on a run that never opens', async () => {
    loadGrill.mockResolvedValue(AGREED)
    renderAt('/listicle-pipeline/abc123')

    await userEvent.click(await screen.findByRole('button', { name: /start over/i }))

    await waitFor(() =>
      expect(screen.getByTestId('where')).toHaveTextContent(/^\/listicle-pipeline$/),
    )
    expect(await screen.findByText('Paste a working title')).toBeInTheDocument()
    expect(screen.queryByText(/Opening run/)).not.toBeInTheDocument()
  })
})
