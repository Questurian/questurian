import { useReducer } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DayWorkspace } from './components/DayWorkspace'
import { createDay, createEmptyDraft, layoutSignature, tripSignature } from './draft'
import { initialState, setupReducer } from './setupReducer'
import { validateDraft } from './validation'
import { BUILT_IN_TEMPLATES } from './templates'
import type { ItinerarySetupDraft } from './types'
import type {
  DaySelection,
  DayWorkView,
  ExportView,
  ImportPreview,
  ProposalView,
} from './dayWork/types'

/**
 * The day workflow as an operator drives it, against a fake backend.
 *
 * The server's own rules are tested in pytest. What is tested here is the part
 * the screen owns: that the right step is live at the right time, that the
 * buttons that spend are the only ones that do, that a failed check cannot be
 * saved, and that the screen never claims something happened that did not.
 */

const template = BUILT_IN_TEMPLATES[0]

function draftWithOneDay(): ItinerarySetupDraft {
  const base = createEmptyDraft()
  const trip = {
    ...base.trip,
    titleSeed: 'Three easy days in Lima',
    dayCountInput: '1',
    baseCity: 'Lima, Peru',
  }
  const day = createDay(0, template)
  const withTrip = { ...base, trip, days: [day] }
  return {
    ...withTrip,
    days: [
      {
        ...day,
        approval: {
          tripRevision: tripSignature(trip),
          layoutRevision: layoutSignature(day),
          approvedAt: '2026-09-15T10:00:00Z',
        },
      },
    ],
    ui: { ...base.ui, stage: 'workspace', activeDayId: day.id },
  }
}

function dayView(draft: ItinerarySetupDraft, over: Partial<DayWorkView> = {}): DayWorkView {
  const day = draft.days[0]
  return {
    workspace_id: 'ws1',
    workspace_revision: 1,
    day_id: day.id,
    day_number: 1,
    day_label: 'Day 1',
    day_date: '',
    window: 'Full day',
    slots: day.slots.map(slot => ({
      id: slot.id,
      label: slot.label,
      kind: slot.kind,
      daypart: slot.daypart,
      optional: slot.optional,
      categories: slot.allowedCategories,
      purpose: slot.purpose,
    })),
    layout_approved: true,
    context_key: 'ctx1',
    state: 'ready_to_start',
    grill: null,
    grill_context_changed: false,
    candidate_direction: null,
    accepted_direction: null,
    stay: { start: null, end: null, final_day: true },
    export: null,
    proposal: null,
    previous_version: null,
    history: [],
    research: null,
    pending_attempt: null,
    ...over,
  }
}

function asking(draft: ItinerarySetupDraft, turns = 0): Partial<DayWorkView> {
  return {
    state: 'grill_asking',
    grill: {
      run_id: 'run1',
      seed: 'Day 1 of 1 in Lima, Peru',
      status: 'asking',
      consensus: '',
      markers_covered: [],
      markers_missing: ['purpose', 'geography'],
      turns: Array.from({ length: turns }, (_, index) => ({
        question_id: `q${index}`,
        ask: `Question ${index + 1}?`,
        pushback: '',
        answer: `Answer ${index + 1}`,
        accepted_as_drafted: index === 0,
      })),
      pending: {
        question_id: `q${turns}`,
        ask: 'What should make this day worth following?',
        recommendation: 'An easy coastal introduction with lunch as the main event.',
        pushback: '',
      },
    },
  }
}

const direction = {
  revision: 1,
  status: 'candidate' as const,
  context_key: 'ctx1',
  created_at: '2026-09-15T10:00:00Z',
  accepted_at: '',
  direction: {
    contract_version: 'itinerary-day-summary-v1' as const,
    day_id: 'day',
    angle: 'A relaxed Miraflores introduction built around lunch.',
    trip_fit: 'The opener; the centre is saved for later.',
    area: 'Miraflores, coast then streets.',
    requirements: ['No cliff stairs'],
    preferences: ['Walkable'],
    avoid: ['Barranco'],
    slots: [],
    agreement_trace: [
      {
        decision: 'What should make this day worth following?',
        recommendation: 'An easy coastal introduction.',
        answer: 'An easy coastal introduction.',
        answer_origin: 'accepted_recommendation' as const,
      },
    ],
  },
}

const olderDirection = {
  ...direction,
  status: 'accepted' as const,
  direction: {
    contract_version: 'itinerary-day-direction-v1' as const,
    day_id: 'day',
    promise: 'An eating education taken in the order the city takes it.',
    trip_role: 'The culinary day.',
    agreement_trace: [],
  },
}

const exported: ExportView = {
  export_id: 'exp1',
  created_at: '2026-09-15T10:05:00Z',
  direction_revision: 1,
  input_hash: 'abcd1234abcd1234',
  prompt_text: '# Choose the places for one day\n\n…the whole request…',
  stale: false,
  changes: [],
  characters: 7_100,
  sections: {
    instructions: '# Choose the places for one day',
    brief: '## The trip\nLima, Peru · city only\n\n## Stops, in order\n1. slot · Breakfast',
    schema: '{"type":"object"}',
  },
  size: {
    sections: { instructions: 1900, brief: 1900, system: 381, schema: 2690 },
    total: 6_900,
    target: 10_000,
    over_target: false,
    largest_section: 'schema',
    copy_characters: 7_100,
  },
  budget: { venues: 6, searches: 14, fetches: 9 },
  revision: null,
}

function selectionFor(draft: ItinerarySetupDraft, over: Partial<DaySelection> = {}): DaySelection {
  const slots = draft.days[0].slots
  return {
    contractVersion: 'itinerary-day-selection-v1',
    workspaceId: 'ws1',
    dayId: draft.days[0].id,
    exportId: 'exp1',
    inputHash: exported.input_hash,
    overview: 'An easy Miraflores day, from the bakery to a sea-view dinner.',
    tripFit: 'The gentle opener.',
    stay: null,
    picks: slots.map((slot, index) => ({
      slotId: slot.id,
      status: 'selected' as const,
      name: index === 0 ? 'A real bakery' : `Place ${index + 1}`,
      category: null,
      area: 'Miraflores',
      address: index === 0 ? 'Calle Alcanfores 410' : null,
      reason: index === 0 ? 'A bakery start that fits the food focus.' : `Reason ${index + 1}.`,
      note: index === 0 ? 'Closed Mondays.' : '',
      sources: index === 0 ? [{ url: 'https://example.com/bakery', title: 'The bakery' }] : [],
      mapsUrl: index === 0 ? 'https://www.google.com/maps/search/?api=1&query=bakery' : null,
      chosenBy: 'ai' as const,
    })),
    journeys: slots.slice(1).map((slot, index) => ({
      from: slots[index].id,
      to: slot.id,
      mode: 'walk',
      minutes: 10,
      note: '',
    })),
    questions: [],
    ...over,
  }
}

function completeness(complete: boolean, open: string[] = []) {
  return {
    selected: 6,
    unresolved: open.length,
    omitted_optional: 0,
    required_unresolved: open,
    outstanding_checks: [],
    complete,
  }
}

function previewOf(draft: ItinerarySetupDraft, over: Partial<ImportPreview> = {}): ImportPreview {
  return {
    valid: true,
    report: { valid: true, issues: [], normalizations: [], completeness: completeness(true) },
    selection: selectionFor(draft),
    content_hash: 'hash-of-the-answer',
    export_id: 'exp1',
    changes: [],
    repair_prompt: null,
    ...over,
  }
}

function proposalOf(draft: ItinerarySetupDraft, over: Partial<ProposalView> = {}): ProposalView {
  return {
    revision: 1,
    saved_at: '2026-09-15T11:00:00Z',
    origin: 'answer',
    export_id: 'exp1',
    selection: selectionFor(draft),
    report: { valid: true, issues: [], normalizations: [], completeness: completeness(true) },
    stale: false,
    changes: [],
    ...over,
  }
}

/** Every call the screen can make, answered from one place. */
function backend() {
  const calls: Array<{ path: string; body: unknown }> = []
  let next: DayWorkView | null = null
  let preview: ImportPreview | null = null

  const fetchSpy = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const path = String(input)
    calls.push({
      path,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    })
    const body =
      path.includes('/imports/preview') && preview
        ? preview
        : path.endsWith('/hotels') || path.includes('/hotels?')
          ? { available: true, error: '', hotels: [] }
          : (next ?? {})
    return {
      ok: true,
      status: 200,
      json: async () => body,
    } as unknown as Response
  })

  return {
    calls,
    fetchSpy,
    reply(view: DayWorkView) {
      next = view
    },
    replyPreview(value: ImportPreview) {
      preview = value
    },
    pathsHit(fragment: string) {
      return calls.filter(call => call.path.includes(fragment))
    },
  }
}

/**
 * The panel over the real reducer, so a dispatch actually changes the draft.
 *
 * A stubbed dispatch would make `linkWorkspace` a no-op, and the one race this
 * screen has to survive — the read that linking triggers arriving after the
 * turn that started it — could not happen at all.
 */
function Harness({
  initial,
  spy,
}: {
  initial: ItinerarySetupDraft
  spy: (action: unknown) => void
}) {
  const [state, dispatch] = useReducer(setupReducer, undefined, () => initialState(initial))
  return (
    <DayWorkspace
      draft={state.draft}
      validation={validateDraft(state.draft)}
      dispatch={action => {
        spy(action)
        dispatch(action)
      }}
      onEditLayouts={() => {}}
      announce={() => {}}
    />
  )
}

function renderWorkspace(draft: ItinerarySetupDraft) {
  const dispatch = vi.fn()
  render(<Harness initial={draft} spy={dispatch} />)
  return dispatch
}

let server: ReturnType<typeof backend>

/**
 * A clipboard this test can watch.
 *
 * Installed AFTER `userEvent.setup()`, which puts its own stub on
 * `navigator.clipboard` and would otherwise take the call.
 */
function watchClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
  return writeText
}

beforeEach(() => {
  server = backend()
  vi.stubGlobal('fetch', server.fetchSpy)
})

describe('arriving at a day', () => {
  it('asks the network for nothing before anything has been started', async () => {
    renderWorkspace(draftWithOneDay())
    expect(await screen.findByRole('heading', { name: 'Plan each day' })).toBeInTheDocument()
    expect(server.calls.map(call => call.path)).toEqual([])
    expect(screen.getByRole('status')).toHaveTextContent('Not started')
  })

  it('reads a linked day once, and reads rather than starts', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(dayView(draft, asking(draft, 1)))
    renderWorkspace(draft)

    expect(await screen.findByText('Question 1?')).toBeInTheDocument()
    const reads = server.calls.filter(call => call.path.includes('/days/'))
    expect(reads).toHaveLength(1)
    // A read is a GET. Nothing on arrival posts.
    expect(server.pathsHit('/grill/start')).toHaveLength(0)
  })
})

describe('the interview', () => {
  it('starts, links the workspace, and shows the question with its suggestion', async () => {
    const draft = draftWithOneDay()
    server.reply(dayView(draft, asking(draft)))
    const dispatch = renderWorkspace(draft)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /Start day Grill/ }))

    expect(await screen.findByText(/What should make this day worth following/)).toBeInTheDocument()
    // The suggestion arrives in the box, so the operator corrects rather than
    // composing into a blank.
    expect(screen.getByLabelText('Your answer')).toHaveValue(
      'An easy coastal introduction with lunch as the main event.',
    )
    expect(screen.getByRole('button', { name: 'Sounds right' })).toBeInTheDocument()
    // The workspace is remembered only after the server confirmed it exists.
    expect(dispatch).toHaveBeenCalledWith({ type: 'linkWorkspace', workspaceId: 'ws1' })
  })

  it('does not let the read that follows linking land on the started interview', async () => {
    // Starting links the workspace, and linking starts a read of the day. Both
    // are then in the air at once, and whichever lands last wins. If that is
    // the read — a slow network, a fast turn — it puts a day with no interview
    // on top of the conversation that just started.
    const draft = draftWithOneDay()
    const started = dayView(draft, asking(draft))
    const empty = dayView(draft)

    let releaseRead: (value: unknown) => void = () => {}
    const readHeld = new Promise(resolve => {
      releaseRead = resolve
    })
    server.fetchSpy.mockImplementation(async (input: RequestInfo) => {
      const path = String(input)
      const reply = (body: unknown) =>
        ({ ok: true, status: 200, json: async () => body }) as unknown as Response
      if (path.includes('/grill/start')) return reply(started)
      if (path.includes('/days/')) {
        // Held open so it is guaranteed to land AFTER the turn it raced.
        await readHeld
        return reply(empty)
      }
      return reply({ workspace_id: 'ws1', revision: 1, setup_hash: 'h', days: [] })
    })

    renderWorkspace(draft)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Start day Grill/ }))
    expect(await screen.findByText(/What should make this day worth following/)).toBeInTheDocument()

    releaseRead(undefined)
    await waitFor(() =>
      expect(screen.getByText(/What should make this day worth following/)).toBeInTheDocument(),
    )
    // And the answer box is still there, which is the thing the operator loses.
    expect(screen.getByLabelText('Your answer')).toBeInTheDocument()
  })

  it('sends one attempt key per turn, so a double click cannot buy two', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(dayView(draft, asking(draft)))
    renderWorkspace(draft)
    const user = userEvent.setup()

    await screen.findByLabelText('Your answer')
    await user.click(screen.getByRole('button', { name: 'Sounds right' }))
    await waitFor(() => expect(server.pathsHit('/grill/answer')).toHaveLength(1))

    const sent = server.pathsHit('/grill/answer')[0].body as { attempt_key: string }
    expect(sent.attempt_key).toMatch(/^[a-z0-9]{10,}$/)
  })

  it('marks an accepted suggestion as accepted, not as an answer', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(dayView(draft, asking(draft, 2)))
    renderWorkspace(draft)

    const thread = await screen.findByRole('log')
    expect(within(thread).getByText('You accepted the suggestion')).toBeInTheDocument()
    // Only the first turn was accepted as drafted; the second was written.
    expect(within(thread).getAllByText('You accepted the suggestion')).toHaveLength(1)
  })

  it('says what the interview still has to settle', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(dayView(draft, asking(draft)))
    renderWorkspace(draft)
    expect(
      await screen.findByText(/Still to settle:.*what the day promises.*where it happens/),
    ).toBeInTheDocument()
  })
})

describe('the summary', () => {
  it('shows the candidate before it can be accepted, and accepts it by revision', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(dayView(draft, { state: 'direction_review', candidate_direction: direction }))
    renderWorkspace(draft)
    const user = userEvent.setup()

    expect(
      await screen.findByText('A relaxed Miraflores introduction built around lunch.'),
    ).toBeInTheDocument()
    // Firm requirements and preferences are shown apart.
    expect(screen.getByRole('heading', { name: 'Firm requirements' })).toBeInTheDocument()
    expect(screen.getByText('No cliff stairs')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Preferences' })).toBeInTheDocument()
    // No research checklist or failure conditions.
    expect(screen.queryByText(/wrong if/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Agree$/ }))
    await waitFor(() => expect(server.pathsHit('/direction/accept')).toHaveLength(1))
    expect(server.pathsHit('/direction/accept')[0].body).toEqual({ revision: 1 })
  })

  it('says an accepted suggestion only counts as a preference', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(dayView(draft, { state: 'direction_review', candidate_direction: direction }))
    renderWorkspace(draft)
    const user = userEvent.setup()

    await user.click(await screen.findByText(/How this was agreed/))
    expect(screen.getByText(/counts as a preference/)).toBeInTheDocument()
  })

  it('offers to write the short summary for a day agreed in the older format', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(
      dayView(draft, {
        state: 'direction_outdated',
        grill: { ...asking(draft).grill!, status: 'agreed', pending: null },
        accepted_direction: olderDirection,
        previous_version: {
          revision: 1,
          saved_at: '2026-09-16T16:30:00Z',
          title: 'Lima’s eating day',
          intro: 'An older article intro.',
          stops: [],
        },
      }),
    )
    renderWorkspace(draft)
    const user = userEvent.setup()

    expect(await screen.findByText('Agreed in the older format')).toBeInTheDocument()
    expect(screen.getByText(/Nothing new is built from this version/)).toBeInTheDocument()
    // The older article is still there to reread.
    expect(screen.getByText(/Previous version: Lima’s eating day/)).toBeInTheDocument()
    // No request can be built from it.
    expect(screen.queryByRole('button', { name: /Build the request/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Write the short summary/ }))
    await waitFor(() => expect(server.pathsHit('/direction/prepare')).toHaveLength(1))
  })
})

describe('which step the screen points at', () => {
  it('lights exactly one, and it is the one holding the outstanding action', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(
      dayView(draft, {
        state: 'prompt_ready',
        accepted_direction: { ...direction, status: 'accepted' },
        export: exported,
      }),
    )
    renderWorkspace(draft)

    await screen.findByText(/copying starts nothing/)
    const active = document.querySelectorAll('.ip-step-active')
    expect(active).toHaveLength(1)
    expect(active[0].querySelector('h3')?.textContent).toContain('Choose places')
    expect(screen.getByText('Or paste an answer from elsewhere')).toBeInTheDocument()
  })

  it('points at nothing once a proposal is saved, and leads with it', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(
      dayView(draft, {
        state: 'proposal_ready',
        accepted_direction: { ...direction, status: 'accepted' },
        export: exported,
        proposal: proposalOf(draft),
      }),
    )
    renderWorkspace(draft)

    const overview = await screen.findByText(/An easy Miraflores day, from the bakery/)
    expect(document.querySelectorAll('.ip-step-active')).toHaveLength(0)
    const made = screen.getByRole('heading', { name: 'How this day was made' })
    expect(overview.compareDocumentPosition(made) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    document.querySelectorAll('details.ip-fold').forEach(fold => expect(fold).not.toHaveAttribute('open'))
  })
})

describe('the request', () => {
  it('copies without calling anything, and says copying starts nothing', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(
      dayView(draft, {
        state: 'prompt_ready',
        accepted_direction: { ...direction, status: 'accepted' },
        export: exported,
      }),
    )
    renderWorkspace(draft)
    const user = userEvent.setup()

    await screen.findByText(/copying starts nothing/)
    const clipboard = watchClipboard()
    const before = server.fetchSpy.mock.calls.length
    await user.click(screen.getByRole('button', { name: /Copy instead/ }))

    expect(clipboard).toHaveBeenCalledWith(exported.prompt_text)
    expect(server.fetchSpy.mock.calls).toHaveLength(before)
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('names what changed when a request is out of date', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(
      dayView(draft, {
        state: 'context_changed',
        accepted_direction: { ...direction, status: 'accepted' },
        export: {
          ...exported,
          stale: true,
          changes: ['The stay changed: Starts from: Casa Pucllana, Miraflores.'],
        },
      }),
    )
    renderWorkspace(draft)
    expect(await screen.findByText(/changed since the request was built/)).toBeInTheDocument()
    expect(screen.getByText(/The stay changed: Starts from: Casa Pucllana/)).toBeInTheDocument()
    expect(screen.getByText('Out of date')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Choose places/ })).toBeDisabled()
  })

  it('shows what is sent, with its size, and no writing section', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(
      dayView(draft, {
        state: 'prompt_ready',
        accepted_direction: { ...direction, status: 'accepted' },
        export: exported,
      }),
    )
    renderWorkspace(draft)
    const user = userEvent.setup()

    await user.click(await screen.findByText(/What is sent/))
    expect(screen.getByText('Sent to Claude')).toBeInTheDocument()
    expect(screen.getByText(/## Stops, in order/)).toBeInTheDocument()
    expect(screen.queryByText(/Voice and writing/)).not.toBeInTheDocument()
  })
})

describe('choosing places in the app', () => {
  function readyToChoose(draft: ItinerarySetupDraft, over: Partial<DayWorkView> = {}) {
    return dayView(draft, {
      state: 'prompt_ready',
      accepted_direction: { ...direction, status: 'accepted' },
      export: exported,
      ...over,
    })
  }

  const runDone = {
    state: 'done' as const,
    stalled: false,
    detail: '',
    fault: '',
    model: 'claude-sonnet-5',
    cost_usd: 1.1,
    turns: 20,
    started_at: '2026-09-16T01:00:00Z',
    finished_at: '2026-09-16T01:06:00Z',
    searches: 12,
    fetches: 8,
    for_current_export: true,
    raw: '{"the":"chosen places"}',
  }

  it('offers choosing here as the main action, with copy still there', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(readyToChoose(draft))
    renderWorkspace(draft)
    const user = userEvent.setup()

    const run = await screen.findByRole('button', { name: /Choose places/ })
    expect(screen.getByRole('button', { name: /Copy instead/ })).toBeInTheDocument()
    await user.click(run)
    await waitFor(() => expect(server.pathsHit('/research')).toHaveLength(1))
    const body = server.pathsHit('/research')[0].body as { attempt_key: string }
    expect(body.attempt_key).toMatch(/^[a-z0-9]{10,}$/)
  })

  it('says it is working, and that leaving is fine', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(readyToChoose(draft, { research: { ...runDone, state: 'running', raw: '' } }))
    renderWorkspace(draft)

    expect(await screen.findByText(/Claude is choosing places/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Choosing…/ })).toBeDisabled()
  })

  it('shows the returned places and still makes you save them', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(readyToChoose(draft, { research: runDone }))
    server.replyPreview(previewOf(draft))
    renderWorkspace(draft)

    // The places, not the JSON.
    expect(await screen.findByText('A real bakery')).toBeInTheDocument()
    expect(screen.getByText('A bakery start that fits the food focus.')).toBeInTheDocument()
    expect(server.pathsHit('/imports/preview')).toHaveLength(1)
    expect(server.pathsHit('/imports/apply')).toHaveLength(0)
    expect(screen.getByText('New places are back — not saved yet')).toBeInTheDocument()
    const save = screen.getByRole('button', { name: /Save this proposal/ })

    await userEvent.setup().click(save)
    await waitFor(() => expect(server.pathsHit('/imports/apply')).toHaveLength(1))
    expect(
      (server.pathsHit('/imports/apply')[0].body as { content_hash: string }).content_hash,
    ).toBe('hash-of-the-answer')
  })

  it('checks a returned answer once, not on every poll', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(readyToChoose(draft, { research: runDone }))
    server.replyPreview(previewOf(draft))
    renderWorkspace(draft)

    await waitFor(() => expect(server.pathsHit('/imports/preview')).toHaveLength(1))
    await new Promise(resolve => setTimeout(resolve, 60))
    expect(server.pathsHit('/imports/preview')).toHaveLength(1)
  })

  it('does not leave the button disabled after a run that never came back', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(
      readyToChoose(draft, { research: { ...runDone, state: 'running', stalled: true, raw: '' } }),
    )
    renderWorkspace(draft)

    expect(await screen.findByText(/never came back/)).toBeInTheDocument()
    expect(screen.getByText(/may still have used some of your usage/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Choose places/ })).toBeEnabled()
  })

  it('tells you what to do about the way it failed', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(
      readyToChoose(draft, {
        research: {
          ...runDone,
          state: 'failed',
          raw: '',
          fault: 'quota_exhausted',
          detail: 'The Claude subscription is exhausted.',
        },
      }),
    )
    renderWorkspace(draft)

    expect(await screen.findByText(/The Claude subscription is exhausted\./)).toBeInTheDocument()
    expect(screen.getByText(/Copy the prompt and run it somewhere else/)).toBeInTheDocument()
  })

  it('does not offer an answer that belongs to an older request', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(
      readyToChoose(draft, { research: { ...runDone, for_current_export: false, raw: '' } }),
    )
    renderWorkspace(draft)

    await screen.findByRole('button', { name: /Choose places/ })
    expect(server.pathsHit('/imports/preview')).toHaveLength(0)
    expect(screen.getByLabelText('The returned JSON')).toHaveValue('')
  })
})

describe('a pasted answer', () => {
  const failing: ImportPreview = {
    valid: false,
    report: {
      valid: false,
      issues: [
        {
          severity: 'error',
          layer: 'structure',
          path: 'picks → Lunch',
          message: 'This stop has no pick.',
        },
        {
          severity: 'warning',
          layer: 'structure',
          path: 'stay',
          message: 'This day was asked to recommend a stay and did not.',
        },
      ],
      normalizations: ['Unwrapped one surrounding ``` code fence.'],
      completeness: completeness(false),
    },
    selection: null,
    content_hash: '',
    export_id: 'exp1',
    changes: [],
    repair_prompt: '# Fix and resend the day',
  }

  function readyToImport(draft: ItinerarySetupDraft) {
    return dayView(draft, {
      state: 'prompt_ready',
      accepted_direction: { ...direction, status: 'accepted' },
      export: exported,
    })
  }

  it('checks without saving anything, and shows what is wrong where', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(readyToImport(draft))
    server.replyPreview(failing)
    renderWorkspace(draft)
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('The returned JSON'), 'a pasted answer')
    await user.click(screen.getByRole('button', { name: 'Check it' }))

    expect(await screen.findByText('This stop has no pick.')).toBeInTheDocument()
    expect(screen.getByText('picks → Lunch')).toBeInTheDocument()
    expect(screen.getByText(/none blocks saving/)).toBeInTheDocument()
    expect(server.pathsHit('/imports/apply')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /Save this proposal/ })).not.toBeInTheDocument()
  })

  it('offers a fix-it prompt for an answer that failed', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(readyToImport(draft))
    server.replyPreview(failing)
    renderWorkspace(draft)
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('The returned JSON'), 'a pasted answer')
    await user.click(screen.getByRole('button', { name: 'Check it' }))
    const clipboard = watchClipboard()
    await user.click(await screen.findByRole('button', { name: /Copy a fix-it prompt/ }))
    expect(clipboard).toHaveBeenCalledWith('# Fix and resend the day')
  })

  it('drops the check the moment the answer is edited', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(readyToImport(draft))
    server.replyPreview(failing)
    renderWorkspace(draft)
    const user = userEvent.setup()

    const box = await screen.findByLabelText('The returned JSON')
    await user.type(box, 'a pasted answer')
    await user.click(screen.getByRole('button', { name: 'Check it' }))
    expect(await screen.findByText('This stop has no pick.')).toBeInTheDocument()

    await user.type(box, ' ')
    expect(screen.queryByText('This stop has no pick.')).not.toBeInTheDocument()
  })

  it('saves a proposal with an open stop, and shows the question', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    const open = selectionFor(draft)
    open.picks[2] = { ...open.picks[2], status: 'unresolved', name: null, reason: 'Nothing step-free fits.' }
    open.questions = [
      { slotId: open.picks[2].slotId, question: 'Allow one step, or move lunch?', options: [] },
    ]
    server.reply(readyToImport(draft))
    server.replyPreview(
      previewOf(draft, {
        selection: open,
        report: {
          valid: true,
          issues: [],
          normalizations: [],
          completeness: completeness(false, ['Lunch']),
        },
      }),
    )
    renderWorkspace(draft)
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('The returned JSON'), 'a pasted answer')
    await user.click(screen.getByRole('button', { name: 'Check it' }))

    expect(await screen.findByText('Has open stops')).toBeInTheDocument()
    expect(screen.getByText('Still open')).toBeInTheDocument()
    expect(screen.getByText('Allow one step, or move lunch?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save this proposal/ })).toBeEnabled()
  })
})

describe('the saved proposal', () => {
  const linked = () => ({ ...draftWithOneDay(), workspaceId: 'ws1' })

  function withProposal(draft: ItinerarySetupDraft, over: Partial<ProposalView> = {}) {
    return dayView(draft, {
      state: over.report?.completeness.complete === false ? 'proposal_open' : 'proposal_ready',
      accepted_direction: { ...direction, status: 'accepted' },
      export: exported,
      proposal: proposalOf(draft, over),
      history: [
        {
          revision: 1,
          saved_at: '2026-09-15T11:00:00Z',
          kind: 'proposal',
          origin: 'answer',
          headline: 'An easy Miraflores day',
          complete: true,
        },
      ],
    })
  }

  it('reads as places with one reason each, details one click away', async () => {
    const draft = linked()
    server.reply(withProposal(draft))
    renderWorkspace(draft)
    const user = userEvent.setup()

    expect(await screen.findByText('A real bakery')).toBeInTheDocument()
    expect(screen.getByText('A bakery start that fits the food focus.')).toBeInTheDocument()
    expect(screen.getByText('Closed Mondays.')).toBeInTheDocument()
    expect(screen.getAllByText(/About 10 min walk \(estimate\)/).length).toBeGreaterThan(0)
    // The address is behind "View details", not in front.
    expect(screen.queryByText('Calle Alcanfores 410')).not.toBeVisible()
    await user.click(screen.getAllByText('View details')[0])
    expect(screen.getByText('Calle Alcanfores 410')).toBeVisible()
    expect(screen.getByRole('link', { name: /The bakery/ })).toHaveAttribute(
      'href',
      'https://example.com/bakery',
    )
  })

  it('has no review checklist, source checkbox or evidence grade', async () => {
    const draft = linked()
    server.reply(withProposal(draft))
    renderWorkspace(draft)

    await screen.findByText('A real bakery')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByText(/unchecked/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Needs your attention/)).not.toBeInTheDocument()
    expect(screen.getByText('Proposal ready')).toBeInTheDocument()
  })

  it('swaps a place by hand for free, against the version on screen', async () => {
    const draft = linked()
    server.reply(withProposal(draft))
    renderWorkspace(draft)
    const user = userEvent.setup()

    await screen.findByText('A real bakery')
    await user.click(screen.getAllByRole('button', { name: /Swap place/ })[0])
    await user.click(screen.getByLabelText('Choose it myself'))
    await user.type(screen.getByLabelText('Place'), 'My corner café')
    await user.type(screen.getByLabelText('Area (optional)'), 'Barranco')
    await user.click(screen.getByRole('button', { name: 'Use this place' }))

    await waitFor(() => expect(server.pathsHit('/swap')).toHaveLength(1))
    const body = server.pathsHit('/swap')[0].body as Record<string, unknown>
    expect(body).toMatchObject({
      slot_id: draft.days[0].slots[0].id,
      name: 'My corner café',
      area: 'Barranco',
      expected_revision: 1,
    })
    expect(server.pathsHit('/revisions')).toHaveLength(0)
  })

  it('asks for another place as a revision of that stop', async () => {
    const draft = linked()
    server.reply(withProposal(draft))
    renderWorkspace(draft)
    const user = userEvent.setup()

    await screen.findByText('A real bakery')
    await user.click(screen.getAllByRole('button', { name: /Swap place/ })[0])
    await user.type(screen.getByLabelText(/What should be different/), 'somewhere quieter')
    await user.click(screen.getByRole('button', { name: 'Ask for another' }))

    await waitFor(() => expect(server.pathsHit('/revisions')).toHaveLength(1))
    const body = server.pathsHit('/revisions')[0].body as Record<string, unknown>
    expect(body.base_revision).toBe(1)
    expect(body.slot_id).toBe(draft.days[0].slots[0].id)
    expect(String(body.change)).toContain('“A real bakery”')
    expect(String(body.change)).toContain('somewhere quieter')
  })

  it('turns an answered question into a revision request', async () => {
    const draft = linked()
    const selection = selectionFor(draft)
    selection.picks[2] = { ...selection.picks[2], status: 'unresolved', name: null, reason: 'No fit.' }
    selection.questions = [
      {
        slotId: selection.picks[2].slotId,
        question: 'Which should give?',
        options: ['Allow one step', 'Move lunch to Barranco'],
      },
    ]
    server.reply(
      withProposal(draft, {
        selection,
        report: {
          valid: true,
          issues: [],
          normalizations: [],
          completeness: { ...completeness(false, ['Lunch']), outstanding_checks: ['Which should give?'] },
        },
      }),
    )
    renderWorkspace(draft)
    const user = userEvent.setup()

    expect(await screen.findByText('Proposal — needs your decision')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Move lunch to Barranco' }))
    await waitFor(() => expect(server.pathsHit('/revisions')).toHaveLength(1))
    const body = server.pathsHit('/revisions')[0].body as Record<string, unknown>
    expect(body.slot_id).toBe(selection.picks[2].slotId)
    expect(String(body.change)).toContain('Move lunch to Barranco')
  })

  it('names what changed since, and offers to refresh', async () => {
    const draft = linked()
    server.reply(
      withProposal(draft, { stale: true, changes: ['Day 1 now uses different places.'] }),
    )
    renderWorkspace(draft)
    const user = userEvent.setup()

    expect(await screen.findByText('Day 1 now uses different places.')).toBeInTheDocument()
    // The proposal is still shown; nothing was discarded.
    expect(screen.getByText('A real bakery')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Refresh the proposal/ }))
    await waitFor(() => expect(server.pathsHit('/revisions')).toHaveLength(1))
    expect(String((server.pathsHit('/revisions')[0].body as { change: string }).change)).toContain(
      'Keep the current choices',
    )
  })

  it('never renders a link from an answer that is not http', async () => {
    const draft = linked()
    const selection = selectionFor(draft)
    selection.picks[0] = {
      ...selection.picks[0],
      mapsUrl: 'javascript:alert(1)',
      sources: [{ url: 'javascript:alert(1)', title: 'Bad' }],
    }
    server.reply(withProposal(draft, { selection }))
    renderWorkspace(draft)

    await screen.findByText('A real bakery')
    for (const link of screen.queryAllByRole('link')) {
      expect(link.getAttribute('href')).toMatch(/^https?:/)
    }
  })

  it('shows the whole trip at a glance above the day', async () => {
    const draft = linked()
    const view = withProposal(draft)
    server.fetchSpy.mockImplementation(async (input: RequestInfo) => {
      const path = String(input)
      const body = path.endsWith('/workspaces/ws1')
        ? {
            workspace_id: 'ws1',
            revision: 1,
            setup_hash: 'h',
            days: [
              {
                day_id: draft.days[0].id,
                day_number: 1,
                day_label: 'Day 1',
                state: 'proposal_ready',
                complete: true,
                overview: 'An easy Miraflores day.',
                trip_fit: 'Day 1 explores food in Miraflores and Barranco.',
                picks: [{ label: 'Breakfast', name: 'El Pan de la Chola', status: 'selected' }],
                stay: {
                  start: { id: 's', mode: 'location_manager', name: 'Casa Pucllana', area: 'Miraflores', note: '', nights: [1, 1], resolved: true },
                  end: { id: 's', mode: 'location_manager', name: 'Casa Pucllana', area: 'Miraflores', note: '', nights: [1, 1], resolved: true },
                  final_day: true,
                },
              },
            ],
          }
        : view
      return { ok: true, status: 200, json: async () => body } as unknown as Response
    })
    renderWorkspace(draft)

    expect(
      await screen.findByText('Day 1 explores food in Miraflores and Barranco.'),
    ).toBeInTheDocument()
    expect(screen.getByText('El Pan de la Chola')).toBeInTheDocument()
    expect(screen.getByText('Staying at Casa Pucllana, Miraflores')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Copy for writing/ })).toBeInTheDocument()
  })
})

describe('when something goes wrong', () => {
  it('says so and leaves the day exactly where it was', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(dayView(draft, asking(draft, 1)))
    renderWorkspace(draft)
    const user = userEvent.setup()

    await screen.findByText('Question 1?')
    server.fetchSpy.mockImplementationOnce(
      async () =>
        ({
          ok: false,
          status: 502,
          json: async () => ({
            detail: 'The interview could not decide what to ask next.',
          }),
        }) as unknown as Response,
    )

    await user.click(screen.getByRole('button', { name: 'Sounds right' }))
    expect(
      await screen.findByText('The interview could not decide what to ask next.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Question 1?')).toBeInTheDocument()
  })

  it('warns about a call it never heard the end of', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(
      dayView(draft, {
        ...asking(draft, 1),
        pending_attempt: {
          attempt_key: 'k1',
          kind: 'grill_answer',
          started_at: '2026-09-15T11:22:00Z',
        },
      }),
    )
    renderWorkspace(draft)
    expect(await screen.findByText(/never came back/)).toBeInTheDocument()
    expect(screen.getByText(/may still have been charged/)).toBeInTheDocument()
  })
})
