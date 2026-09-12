import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * One place, prepared and researched, through the screen.
 *
 * A backend function is not the feature: what the operator does is tick two
 * boxes, press one button, read what came back and correct it. These are those
 * moves, with the network replaced by counters -- so "this screen buys exactly
 * one call" is a thing a test can say.
 */

const loadBoard = vi.fn()
const loadGoogleChecks = vi.fn()
const loadPlacesAllowance = vi.fn()
const loadResearchBoard = vi.fn()
const saveCandidatePrep = vi.fn()
const startPlaceResearch = vi.fn()
const loadProfileResearch = vi.fn()
const editProfileFinding = vi.fn()
const addProfileFinding = vi.fn()
const addPossibleAngle = vi.fn()
const loadResearchAttempt = vi.fn()

vi.mock('./api', async importOriginal => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    loadBoard: (...args: unknown[]) => loadBoard(...args),
    loadGoogleChecks: (...args: unknown[]) => loadGoogleChecks(...args),
    loadPlacesAllowance: (...args: unknown[]) => loadPlacesAllowance(...args),
    loadResearchBoard: (...args: unknown[]) => loadResearchBoard(...args),
    saveCandidatePrep: (...args: unknown[]) => saveCandidatePrep(...args),
    startPlaceResearch: (...args: unknown[]) => startPlaceResearch(...args),
    loadProfileResearch: (...args: unknown[]) => loadProfileResearch(...args),
    editProfileFinding: (...args: unknown[]) => editProfileFinding(...args),
    addProfileFinding: (...args: unknown[]) => addProfileFinding(...args),
    addPossibleAngle: (...args: unknown[]) => addPossibleAngle(...args),
    loadResearchAttempt: (...args: unknown[]) => loadResearchAttempt(...args),
  }
})

import { ResearchBlockedError } from './api'
import { SearchResults } from './components/SearchResults'
import type {
  ListicleAttemptSummary,
  ListicleFinding,
  ListiclePrep,
  ListicleProfileResearch,
  ListicleProfileSummary,
  ListicleReadiness,
  ListicleResearchBoard,
  ListicleSearchResults,
} from './types'

const CANDIDATE = {
  candidate_id: 'cand-wings',
  name: 'Example Wings',
  district: 'Jesús María',
  evidence: 'known for its wings',
  found_by: ['wings joints'],
  overlap: 1,
  possible_duplicates: [],
  possible_duplicate_ids: [],
  sightings: [],
}

function results(): ListicleSearchResults {
  return {
    run_id: 'run-1',
    revision: 1,
    target: 20,
    found: 1,
    shortfall: 0,
    rows_returned: 1,
    running: false,
    complete: true,
    uncertain_identity: 0,
    capacity: 20,
    capacity_warning: '',
    cut_checked: true,
    cut_review_status: 'complete',
    barred_count: 0,
    order: {
      kind: 'chicken wings',
      place: 'Lima, Peru',
      target_count: 20,
      standard: 'written up by somebody else',
      exclusions: 'no delivery-only kitchens',
      count_source: 'answered',
      count_ambiguous: false,
      count_note: '',
    },
    angles: [],
    candidates: [CANDIDATE],
  }
}

function prep(overrides: Partial<ListiclePrep> = {}): ListiclePrep {
  return {
    run_id: 'run-1',
    candidate_id: 'cand-wings',
    version: 3,
    identity_confirmed: true,
    identity_confirmed_at: '2026-09-12T00:10:00+00:00',
    identity_confirmed_by: 'staff',
    open_confirmed: true,
    open_confirmed_at: '2026-09-12T00:11:00+00:00',
    open_confirmed_by: 'staff',
    status_note: '',
    exclusion_decision: '',
    exclusion_reason: '',
    exclusion_at: '',
    cut_confirmed: false,
    cut_confirmed_at: '',
    tripadvisor_url: '',
    source_links: [],
    updated_at: '2026-09-12T00:11:00+00:00',
    ...overrides,
  }
}

function readiness(overrides: Partial<ListicleReadiness> = {}): ListicleReadiness {
  return {
    candidate_id: 'cand-wings',
    ready: true,
    blockers: [],
    required_total: 2,
    required_done: 2,
    progress: 1,
    prep_version: 3,
    identity_fingerprint: 'fp',
    status_fingerprint: 'sp',
    exclusion_fingerprint: '',
    cut_fingerprint: '',
    google_name: 'Example Wings',
    google_address: 'Av. Brasil 100, Jesús María',
    place_id: 'gid-wings',
    identity_twins: [],
    ...overrides,
  }
}

function profile(overrides: Partial<ListicleProfileSummary> = {}): ListicleProfileSummary {
  return {
    profile_id: 'prof-1',
    name: 'Example Wings',
    place_id: 'gid-wings',
    district: 'Jesús María',
    findings_total: 4,
    findings_this_topic: 4,
    kept: 0,
    unreviewed: 4,
    unattributed: 1,
    open_questions: 1,
    other_topics: [],
    last_research_at: '2026-09-12T00:20:00+00:00',
    last_state: 'completed',
    angles: 0,
    other_runs: [],
    ...overrides,
  }
}

function attempt(overrides: Partial<ListicleAttemptSummary> = {}): ListicleAttemptSummary {
  return {
    attempt_id: 'att-1',
    run_id: 'run-1',
    candidate_id: 'cand-wings',
    profile_id: 'prof-1',
    mode: 'initial',
    state: 'completed',
    reason_code: '',
    reason: '',
    findings_added: 4,
    findings_seen: 4,
    open_questions: ['Who owns it now?'],
    started_at: '2026-09-12T00:20:00+00:00',
    finished_at: '2026-09-12T00:21:00+00:00',
    model: 'gemini-2.5-flash',
    running: false,
    ...overrides,
  }
}

function board(overrides: Partial<ListicleResearchBoard> = {}): ListicleResearchBoard {
  return {
    run_id: 'run-1',
    revision: 1,
    topic: 'chicken-wings',
    topic_label: 'chicken wings',
    exclusions: 'no delivery-only kitchens',
    active_attempt: null,
    cards: [
      {
        candidate_id: 'cand-wings',
        name: 'Example Wings',
        district: 'Jesús María',
        prep: prep(),
        readiness: readiness(),
        profile: null,
        last_attempt: null,
      },
    ],
    ...overrides,
  }
}

function finding(overrides: Partial<ListicleFinding> = {}): ListicleFinding {
  return {
    finding_id: 'f1',
    text: 'The wings are fried twice and finished in a rocoto glaze.',
    kind: 'signature',
    categories: ['signature_offering'],
    topics: ['chicken-wings'],
    scope: 'branch',
    temporal_type: 'current_offering',
    event_date: '',
    source_published_at: '2025-04-02',
    valid_until: '',
    expired: false,
    curation: 'unreviewed',
    origin: 'research',
    version: 1,
    attribution: 'attributed',
    author: '',
    observed_at: '',
    attempt_id: 'att-1',
    created_at: '2026-09-12T00:20:00+00:00',
    updated_at: '2026-09-12T00:20:00+00:00',
    evidence: [
      {
        source_id: 's1',
        supporting_excerpt: 'doble fritura y glaseado de rocoto',
        evidence_scope: 'branch',
        url: 'https://press.test/wings',
        publisher: 'El Comercio',
        title: 'Las mejores alitas',
        published_at: '2025-04-02',
        retrieved_at: '2026-09-12T00:20:00+00:00',
      },
    ],
    revisions: [],
    ...overrides,
  }
}

function research(overrides: Partial<ListicleProfileResearch> = {}): ListicleProfileResearch {
  return {
    profile_id: 'prof-1',
    name: 'Example Wings',
    city: 'Lima, Peru',
    district: 'Jesús María',
    place_id: 'gid-wings',
    topics: ['chicken-wings'],
    topic: '',
    findings: [
      finding(),
      finding({
        finding_id: 'f2',
        text: 'A regular says the portions have got smaller this year.',
        categories: ['customer_observations'],
        attribution: 'incomplete',
        source_published_at: '',
        evidence: [],
      }),
    ],
    sources: [],
    possible_angles: [],
    history: [attempt()],
    coverage: [
      { topic: 'chicken-wings', category: 'history', state: 'not_found', note: '' },
    ],
    open_questions: ['Who owns it now?'],
    runs: [],
    ...overrides,
  }
}

function show() {
  render(<SearchResults results={results()} busy={false} onRun={() => {}} />)
}

beforeEach(() => {
  loadBoard.mockReset().mockResolvedValue({ removed: [], distinct_pairs: [] })
  loadGoogleChecks.mockReset().mockResolvedValue({ checks: {}, running: false })
  loadPlacesAllowance
    .mockReset()
    .mockResolvedValue({ available: true, free: 1000, left: 900, month_start: '', as_of: '' })
  loadResearchBoard.mockReset().mockResolvedValue(board())
  saveCandidatePrep.mockReset()
  startPlaceResearch.mockReset()
  loadProfileResearch.mockReset().mockResolvedValue(research())
  editProfileFinding.mockReset()
  addProfileFinding.mockReset()
  addPossibleAngle.mockReset()
  loadResearchAttempt.mockReset()
})

describe('the card', () => {
  it('opens without buying anything', async () => {
    show()
    await screen.findByRole('button', { name: 'Research Example Wings' })
    expect(startPlaceResearch).not.toHaveBeenCalled()
    expect(loadResearchBoard).toHaveBeenCalledTimes(1)
  })

  it('says which place the confirmation is about', async () => {
    show()
    expect(
      await screen.findByText(/Example Wings · Av. Brasil 100, Jesús María/),
    ).toBeInTheDocument()
  })

  it('lists what is missing rather than disabling a button in silence', async () => {
    loadResearchBoard.mockResolvedValue(
      board({
        cards: [
          {
            candidate_id: 'cand-wings',
            name: 'Example Wings',
            district: 'Jesús María',
            prep: prep({ open_confirmed: false }),
            readiness: readiness({
              ready: false,
              required_done: 1,
              progress: 0.5,
              blockers: [
                {
                  code: 'open_unconfirmed',
                  message: 'Confirm the place is still open.',
                  where: 'prep',
                },
              ],
            }),
            profile: null,
            last_attempt: null,
          },
        ],
      }),
    )
    show()
    expect(
      await screen.findByText('Confirm the place is still open.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Research Example Wings' })).toBeDisabled()
  })

  it('says what the last request did, in quantities', async () => {
    loadResearchBoard.mockResolvedValue(
      board({
        cards: [
          {
            candidate_id: 'cand-wings',
            name: 'Example Wings',
            district: 'Jesús María',
            prep: prep(),
            readiness: readiness(),
            profile: profile(),
            last_attempt: attempt(),
          },
        ],
      }),
    )
    show()
    expect(
      await screen.findByText(/4 findings · 1 unresolved question/),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View research' })).toBeInTheDocument()
  })

  it('tells a request that found nothing from one that failed', async () => {
    loadResearchBoard.mockResolvedValue(
      board({
        cards: [
          {
            candidate_id: 'cand-wings',
            name: 'Example Wings',
            district: 'Jesús María',
            prep: prep(),
            readiness: readiness(),
            profile: profile({ findings_total: 0, findings_this_topic: 0 }),
            last_attempt: attempt({
              state: 'completed_empty',
              findings_added: 0,
              open_questions: [],
              reason: 'The request ran and returned no findings.',
            }),
          },
        ],
      }),
    )
    show()
    expect(await screen.findByText('No findings returned')).toBeInTheDocument()
    expect(
      screen.getByText(/ran and returned no findings/),
    ).toBeInTheDocument()
  })

  it('keeps earlier findings visible when a later request failed', async () => {
    loadResearchBoard.mockResolvedValue(
      board({
        cards: [
          {
            candidate_id: 'cand-wings',
            name: 'Example Wings',
            district: 'Jesús María',
            prep: prep(),
            readiness: readiness(),
            profile: profile(),
            last_attempt: attempt({
              state: 'failed',
              reason_code: 'provider_failed',
              reason: 'The research call did not come back. Nothing was saved.',
            }),
          },
        ],
      }),
    )
    show()
    expect(await screen.findByText('The request failed')).toBeInTheDocument()
    // The failure is execution; the four findings are still there to read.
    expect(screen.getByRole('button', { name: 'View research' })).toBeInTheDocument()
  })

  it('will not send a request while a tick is still saving', async () => {
    // The card's readiness is the readiness of the version before the tick
    // that is still in flight. A request sent against that is refused anyway,
    // after paying for the round trip.
    let release: (value: unknown) => void = () => {}
    saveCandidatePrep.mockImplementation(
      () => new Promise(resolve => {
        release = resolve
      }),
    )
    show()
    const list = await screen.findByRole('list', { name: 'Checklist for Example Wings' })
    await userEvent.click(within(list).getByLabelText(/Still open/))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Research Example Wings' })).toBeDisabled(),
    )
    expect(within(list).getByText('Saving…')).toBeInTheDocument()

    release({ prep: prep(), readiness: readiness() })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Research Example Wings' })).toBeEnabled(),
    )
    expect(startPlaceResearch).not.toHaveBeenCalled()
  })

  it('buys one request per press and says it will not retry', async () => {
    startPlaceResearch.mockResolvedValue({ attempt: attempt(), profile: profile() })
    show()
    const button = await screen.findByRole('button', { name: 'Research Example Wings' })
    expect(screen.getByText(/One grounded request. No automatic retries./)).toBeInTheDocument()

    await userEvent.click(button)

    await waitFor(() => expect(startPlaceResearch).toHaveBeenCalledTimes(1))
    const [, , body] = startPlaceResearch.mock.calls[0]
    expect(body.expected_prep_version).toBe(3)
    expect(body.expected_order_revision).toBe(1)
    expect(body.mode).toBe('initial')
  })

  it('does not retry a request that failed on the way out', async () => {
    startPlaceResearch.mockRejectedValue(new Error('the connection dropped'))
    show()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Research Example Wings' }),
    )
    await waitFor(() => expect(startPlaceResearch).toHaveBeenCalledTimes(1))
    expect(
      await screen.findByText(/Nothing was retried; the card shows how the request ended./),
    ).toBeInTheDocument()
    // Re-read rather than re-sent: the attempt was written down before the
    // call went out, so the card can say what became of it.
    await waitFor(() => expect(loadResearchBoard).toHaveBeenCalledTimes(2))
    expect(startPlaceResearch).toHaveBeenCalledTimes(1)
  })

  it('shows a refusal as the list of things to fix', async () => {
    startPlaceResearch.mockRejectedValue(
      new ResearchBlockedError('Settle the duplicate first.', [
        { code: 'duplicates_open', message: 'Settle the duplicate first.', where: 'board' },
      ]),
    )
    show()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Research Example Wings' }),
    )
    expect(await screen.findByText('Settle the duplicate first.')).toBeInTheDocument()
  })

  it('says when another place holds the one slot', async () => {
    loadResearchBoard.mockResolvedValue(
      board({
        active_attempt: attempt({ candidate_id: 'someone-else', state: 'running', running: true }),
        cards: [
          {
            candidate_id: 'cand-wings',
            name: 'Example Wings',
            district: 'Jesús María',
            prep: prep(),
            readiness: readiness({
              ready: false,
              blockers: [
                {
                  code: 'another_running',
                  message: 'Another place is being researched right now.',
                  where: 'execution',
                },
              ],
            }),
            profile: null,
            last_attempt: null,
          },
        ],
      }),
    )
    show()
    expect(
      await screen.findByText(/One place is being researched/),
    ).toBeInTheDocument()
  })
})

describe('the research viewer', () => {
  async function openViewer() {
    loadResearchBoard.mockResolvedValue(
      board({
        cards: [
          {
            candidate_id: 'cand-wings',
            name: 'Example Wings',
            district: 'Jesús María',
            prep: prep(),
            readiness: readiness(),
            profile: profile(),
            last_attempt: attempt(),
          },
        ],
      }),
    )
    show()
    await userEvent.click(await screen.findByRole('button', { name: 'View research' }))
    return screen.findByRole('dialog', { name: 'Research for Example Wings' })
  }

  it('opens free, and shows each finding with its source and dates', async () => {
    const dialog = await openViewer()
    expect(loadProfileResearch).toHaveBeenCalledWith('prof-1')
    expect(startPlaceResearch).not.toHaveBeenCalled()
    expect(within(dialog).getByText(/fried twice/)).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'El Comercio' })).toBeInTheDocument()
    expect(within(dialog).getByText('Published 2025-04-02')).toBeInTheDocument()
  })

  it('marks a finding nothing attributes, rather than lending it a link', async () => {
    const dialog = await openViewer()
    expect(within(dialog).getByText('No source of its own')).toBeInTheDocument()
    // The sourced finding's link is not borrowed by the unsourced one: there
    // is exactly one link on screen, and it belongs to the row that earned it.
    expect(within(dialog).getAllByRole('link', { name: 'El Comercio' })).toHaveLength(1)
    expect(within(dialog).getByText(/with no source of their own/)).toBeInTheDocument()
  })

  it('opens a row to its supporting passage and provenance', async () => {
    const dialog = await openViewer()
    await userEvent.click(within(dialog).getByText(/fried twice/))
    expect(
      within(dialog).getByText('doble fritura y glaseado de rocoto'),
    ).toBeInTheDocument()
    expect(within(dialog).getByText(/about this branch/)).toBeInTheDocument()
  })

  it('keeps a finding, and says so without deleting anything', async () => {
    editProfileFinding.mockResolvedValue(
      research({ findings: [finding({ curation: 'kept', version: 2 })] }),
    )
    const dialog = await openViewer()
    await userEvent.click(within(dialog).getAllByRole('button', { name: 'Keep' })[0])
    await waitFor(() =>
      expect(editProfileFinding).toHaveBeenCalledWith('prof-1', 'f1', {
        curation: 'kept',
        expected_version: 1,
      }),
    )
    expect(await within(dialog).findByText('Kept')).toBeInTheDocument()
  })

  it('corrects a finding by hand', async () => {
    editProfileFinding.mockResolvedValue(
      research({ findings: [finding({ text: 'Corrected: an ají amarillo glaze.' })] }),
    )
    const dialog = await openViewer()
    await userEvent.click(within(dialog).getAllByRole('button', { name: 'Edit' })[0])
    const box = within(dialog).getByLabelText(/Correct the finding/)
    await userEvent.clear(box)
    await userEvent.type(box, 'Corrected: an ají amarillo glaze.')
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Save the correction' }),
    )
    await waitFor(() =>
      expect(editProfileFinding).toHaveBeenCalledWith('prof-1', 'f1', {
        text: 'Corrected: an ají amarillo glaze.',
        expected_version: 1,
      }),
    )
  })

  it('takes an idea as an idea, not as a fact', async () => {
    addPossibleAngle.mockResolvedValue(research())
    const dialog = await openViewer()
    await userEvent.type(
      within(dialog).getByLabelText(/An idea for writing about this place/),
      'The one for a long lunch',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add the idea' }))
    await waitFor(() =>
      expect(addPossibleAngle).toHaveBeenCalledWith('prof-1', {
        label: 'The one for a long lunch',
        topic: 'chicken-wings',
      }),
    )
  })

  it('asks one focused follow-up, and only when there is a question', async () => {
    startPlaceResearch.mockResolvedValue({ attempt: attempt({ mode: 'gap' }), profile: profile() })
    const dialog = await openViewer()
    const ask = within(dialog).getByRole('button', { name: 'Ask this one thing' })
    expect(ask).toBeDisabled()
    await userEvent.type(
      within(dialog).getByLabelText('What is missing'),
      'Who owns it now?',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ask this one thing' }))
    await waitFor(() => expect(startPlaceResearch).toHaveBeenCalledTimes(1))
    const [, , body] = startPlaceResearch.mock.calls[0]
    expect(body.mode).toBe('gap')
    expect(body.gap_text).toBe('Who owns it now?')
  })

  it('closes on Escape and leaves the board where it was', async () => {
    const dialog = await openViewer()
    expect(dialog).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Research for Example Wings' })).toBeNull(),
    )
    expect(screen.getByText('Example Wings')).toBeInTheDocument()
  })

  it('can be worked from the keyboard alone', async () => {
    const dialog = await openViewer()
    // The close button takes focus when the drawer opens, so tabbing reaches
    // the controls in order without a mouse.
    expect(within(dialog).getByRole('button', { name: 'Close research' })).toHaveFocus()
    await userEvent.tab()
    expect(document.activeElement).not.toBe(document.body)
  })

  it('shows what was asked for apart from what the provider says it searched', async () => {
    loadResearchAttempt.mockResolvedValue({
      ...attempt(),
      topic: 'chicken-wings',
      requested_queries: ['"Example Wings" alitas carta'],
      actual_queries: [],
      validation_issues: [],
      coverage: [],
      usage: { total_tokens: 900 },
      duration_seconds: 12.5,
      prompt_version: 'place-research/1',
      gap_text: '',
      raw_response: '{"findings": []}',
      prompt: 'Research Example Wings…',
    })
    const dialog = await openViewer()
    await userEvent.click(within(dialog).getByText(/Research history/))
    await userEvent.click(
      within(dialog).getByRole('button', { name: /initial · completed/ }),
    )
    expect(
      await within(dialog).findByText(/Asked for: "Example Wings" alitas carta/),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText(/it did not say. What was asked for is not evidence/),
    ).toBeInTheDocument()
  })
})
