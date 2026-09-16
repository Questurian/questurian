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
import type { DayWorkView, ExportView, ImportPreview } from './dayWork/types'

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
    export: null,
    result: null,
    result_history: [],
    review: { notes: '', evidence_reviewed: false },
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
    contract_version: 'itinerary-day-direction-v1',
    day_id: 'day',
    promise: 'A relaxed Miraflores introduction built around lunch.',
    trip_role: 'The opener.',
    anchors: ['The lunch'],
    geography: {
      required_area: 'Miraflores',
      starting_point: 'A hotel in Miraflores',
      progression: 'Coast then streets',
      transfer_tolerance: 'Fifteen minutes on foot',
      avoid_today: ['Barranco'],
    },
    rhythm: {
      effort: 'Low',
      meal_balance: 'One big lunch',
      rest_policy: 'One explicit gap',
      rest_minutes_minimum: 45,
      optionality: 'The evening may go',
    },
    constraints: ['No cliff stairs'],
    slot_directions: [],
    continuity: {
      covered_elsewhere: [],
      reserved_for_later: ['The historic centre'],
      deliberate_overlaps: [],
    },
    change_policy: {
      must_remain: 'Every stop',
      may_be_proposed: 'A swap, with the reason',
      optional_slots_may_be_omitted: true,
    },
    fails_if: ['The afternoon repeats the morning'],
    research_checklist: ['Which of these open every day'],
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

const exported: ExportView = {
  export_id: 'exp1',
  created_at: '2026-09-15T10:05:00Z',
  direction_revision: 1,
  input_hash: 'abcd1234abcd1234',
  voice_version: 'v0ice1234',
  prompt_text: '# Research and write one day of a trip\n\n…the whole packet…',
  stale: false,
  characters: 15_900,
  wire_version: 'itinerary-day-research-v2',
  compact: true,
  legacy: false,
  runnable: true,
  sections: {
    instructions: '# Research and write one day of a trip',
    brief: '## The trip\nLima, Peru · city only\n\n## Stops, in order\n1. slot · Breakfast',
    writing: '## The writing',
    schema: '{"type":"object","properties":{"stops":{"type":"array"}}}',
  },
  size: {
    sections: { system: 384, instructions: 2600, brief: 3700, writing: 4280, schema: 4000 },
    total: 15_100,
    budget: 18_000,
    over_budget: false,
    largest_section: 'writing',
    copy_characters: 15_900,
  },
  budget: { venues: 6, searches: 16, fetches: 11 },
}

const completePreview: ImportPreview = {
  valid: true,
  report: {
    valid: true,
    issues: [],
    normalizations: [],
    completeness: {
      selected: 6,
      unresolved: 0,
      omitted_optional: 0,
      required_unresolved: [],
      missing_timing: [],
      outstanding_checks: [],
      complete: true,
    },
  },
  result: null,
  content_hash: 'hash-of-the-research',
  export_id: 'exp1',
  changes: [],
  repair_prompt: null,
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
      path.includes('/imports/preview') && preview ? preview : (next ?? {})
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
    expect(server.fetchSpy).not.toHaveBeenCalled()
    expect(screen.getByText(/Nothing has been decided about this day yet/)).toBeInTheDocument()
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

describe('the direction', () => {
  it('shows the candidate before it can be accepted, and accepts it by revision', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(dayView(draft, { state: 'direction_review', candidate_direction: direction }))
    renderWorkspace(draft)
    const user = userEvent.setup()

    expect(
      await screen.findByText('A relaxed Miraflores introduction built around lunch.'),
    ).toBeInTheDocument()
    expect(screen.getByText(/exactly what will be sent/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Agree and prepare the prompt/ }))
    await waitFor(() => expect(server.pathsHit('/direction/accept')).toHaveLength(1))
    expect(server.pathsHit('/direction/accept')[0].body).toEqual({ revision: 1 })
  })

  it('keeps an accepted suggestion visible as the interviewer’s wording', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(dayView(draft, { state: 'direction_review', candidate_direction: direction }))
    renderWorkspace(draft)
    const user = userEvent.setup()

    await user.click(await screen.findByText(/How this was agreed/))
    expect(screen.getByText('You accepted the suggestion unchanged.')).toBeInTheDocument()
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
    // The prompt is built and current and no answer is back yet, so the day
    // is waiting on research: run it here, or copy it out. Pasting an answer
    // from elsewhere is offered beside it, folded.
    expect(active[0].querySelector('h3')?.textContent).toContain('Research')
    expect(screen.getByText('Or paste an answer from elsewhere')).toBeInTheDocument()
  })

  it('points at nothing once a complete day is saved', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(
      dayView(draft, {
        state: 'saved_complete',
        accepted_direction: { ...direction, status: 'accepted' },
        export: exported,
      }),
    )
    renderWorkspace(draft)

    await screen.findByText(/Its facts are still unchecked/)
    expect(document.querySelectorAll('.ip-step-active')).toHaveLength(0)
  })
})

describe('the prompt', () => {
  it('copies without calling anything, and says copying is not research', async () => {
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
    await user.click(screen.getByRole('button', { name: /Copy the prompt instead/ }))

    expect(clipboard).toHaveBeenCalledWith(exported.prompt_text)
    expect(server.fetchSpy.mock.calls).toHaveLength(before)
    // The badge and the button both say so, and neither claims research ran.
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
    // And copying still says plainly that it is not research.
    expect(screen.getByText(/the app cannot see what happens out there/)).toBeInTheDocument()
  })

  it('says a prompt is out of date rather than letting it look current', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(
      dayView(draft, {
        state: 'context_changed',
        accepted_direction: { ...direction, status: 'accepted' },
        export: { ...exported, stale: true },
      }),
    )
    renderWorkspace(draft)
    expect(await screen.findByText(/This day has changed since this prompt was built/)).toBeInTheDocument()
    expect(screen.getByText('Out of date')).toBeInTheDocument()
  })
})

describe('researching the day in the app', () => {
  function readyToResearch(draft: ItinerarySetupDraft, over: Partial<DayWorkView> = {}) {
    return dayView(draft, {
      state: 'prompt_ready',
      accepted_direction: { ...direction, status: 'accepted' },
      export: exported,
      ...over,
    })
  }

  const researchDone = {
    state: 'done' as const,
    stalled: false,
    detail: '',
    fault: '',
    model: 'claude-sonnet-5',
    cost_usd: 3.42,
    turns: 26,
    started_at: '2026-09-16T01:00:00Z',
    finished_at: '2026-09-16T01:06:00Z',
    for_current_export: true,
    raw: '{"the":"researched day"}',
  }

  it('offers running it here as the main action, with copy still there', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(readyToResearch(draft))
    renderWorkspace(draft)
    const user = userEvent.setup()

    const run = await screen.findByRole('button', { name: /Research this day/ })
    expect(screen.getByRole('button', { name: /Copy the prompt instead/ })).toBeInTheDocument()

    await user.click(run)
    await waitFor(() => expect(server.pathsHit('/research')).toHaveLength(1))
    const body = server.pathsHit('/research')[0].body as { attempt_key: string }
    expect(body.attempt_key).toMatch(/^[a-z0-9]{10,}$/)
  })

  it('will not research a prompt the day has outgrown', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(
      readyToResearch(draft, { state: 'context_changed', export: { ...exported, stale: true } }),
    )
    renderWorkspace(draft)
    expect(await screen.findByRole('button', { name: /Research this day/ })).toBeDisabled()
  })

  it('says it is working, and that leaving is fine', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(
      readyToResearch(draft, { research: { ...researchDone, state: 'running', raw: '' } }),
    )
    renderWorkspace(draft)

    expect(await screen.findByText(/searching, reading pages and writing/)).toBeInTheDocument()
    expect(screen.getByText(/the run keeps going/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Researching…/ })).toBeDisabled()
  })

  it('checks the answer for you and still makes you save it', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(readyToResearch(draft, { research: researchDone }))
    server.replyPreview({
      valid: true,
      report: {
        valid: true,
        issues: [],
        normalizations: [],
        completeness: {
          selected: 6,
          unresolved: 0,
          omitted_optional: 0,
          required_unresolved: [],
          missing_timing: [],
          outstanding_checks: [],
          complete: true,
        },
      },
      result: null,
      content_hash: 'hash-of-the-research',
      export_id: 'exp1',
      changes: [],
      repair_prompt: null,
    })
    renderWorkspace(draft)

    // The answer lands in the box and checks itself...
    await waitFor(() =>
      expect(screen.getByLabelText('The returned JSON')).toHaveValue(
        '{"the":"researched day"}',
      ),
    )
    expect(server.pathsHit('/imports/preview')).toHaveLength(1)
    // ...and stops there. Running the call is not reviewing the answer.
    expect(server.pathsHit('/imports/apply')).toHaveLength(0)
    expect(await screen.findByRole('button', { name: /Save this day/ })).toBeInTheDocument()
  })

  it('checks a researched answer once, not on every poll', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(readyToResearch(draft, { research: researchDone }))
    server.replyPreview(completePreview)
    renderWorkspace(draft)

    await waitFor(() => expect(server.pathsHit('/imports/preview')).toHaveLength(1))
    // A re-read of the same day carries the same answer; it must not re-check.
    await new Promise(resolve => setTimeout(resolve, 60))
    expect(server.pathsHit('/imports/preview')).toHaveLength(1)
  })

  it('reports how many round trips it took, because one means it never searched', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(
      readyToResearch(draft, { research: { ...researchDone, turns: 1, raw: '' } }),
    )
    renderWorkspace(draft)
    expect(
      await screen.findByText(/never actually searched/, { exact: false }),
    ).toBeInTheDocument()
  })

  it('does not leave the button disabled after a run that never came back', async () => {
    // The usual cause is the server restarting mid-call. Counting that as
    // "running" would disable Research for good on a day nothing is happening
    // to, which is the one state an operator cannot get out of.
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(
      readyToResearch(draft, {
        research: { ...researchDone, state: 'running', stalled: true, raw: '' },
      }),
    )
    renderWorkspace(draft)

    expect(await screen.findByText(/never came back/)).toBeInTheDocument()
    // And it is honest about what it does not know.
    expect(screen.getByText(/may still have used some of your usage/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Research this day/ })).toBeEnabled()
  })

  it('tells you what to do about the way it failed', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(
      readyToResearch(draft, {
        research: {
          ...researchDone,
          state: 'failed',
          raw: '',
          fault: 'quota_exhausted',
          detail: 'The Claude subscription is exhausted.',
        },
      }),
    )
    renderWorkspace(draft)

    expect(await screen.findByText(/The Claude subscription is exhausted\./)).toBeInTheDocument()
    // An exhausted subscription has a different next step from a bad reply.
    expect(screen.getByText(/Copy the prompt and run it somewhere else/)).toBeInTheDocument()
  })

  it('does not offer an answer that belongs to an older prompt', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(
      readyToResearch(draft, {
        research: { ...researchDone, for_current_export: false, raw: '' },
      }),
    )
    renderWorkspace(draft)

    await screen.findByRole('button', { name: /Research this day/ })
    expect(server.pathsHit('/imports/preview')).toHaveLength(0)
    expect(screen.getByLabelText('The returned JSON')).toHaveValue('')
  })
})

describe('the import', () => {
  const failing: ImportPreview = {
    valid: false,
    report: {
      valid: false,
      issues: [
        {
          severity: 'error',
          layer: 'structure',
          path: 'stops → Lunch',
          message: 'This stop is missing from the answer.',
        },
        {
          severity: 'warning',
          layer: 'review',
          message: 'The model says it did not browse.',
          path: 'research',
        },
      ],
      normalizations: ['Unwrapped one surrounding ``` code fence.'],
      completeness: {
        selected: 0,
        unresolved: 0,
        omitted_optional: 0,
        required_unresolved: [],
        missing_timing: [],
        outstanding_checks: [],
        complete: false,
      },
    },
    result: null,
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

  it('checks a paste without saving anything, and shows what is wrong where', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(readyToImport(draft))
    server.replyPreview(failing)
    renderWorkspace(draft)
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('The returned JSON'), 'a pasted answer')
    await user.click(screen.getByRole('button', { name: 'Check it' }))

    expect(await screen.findByText('This stop is missing from the answer.')).toBeInTheDocument()
    expect(screen.getByText('stops → Lunch')).toBeInTheDocument()
    // A warning is shown and is not a blocker, and the two are never mixed.
    expect(screen.getByText(/none of these blocks saving/)).toBeInTheDocument()
    // Nothing was saved.
    expect(server.pathsHit('/imports/apply')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /Save this day/ })).not.toBeInTheDocument()
  })

  it('offers a fix-it prompt for a paste that failed', async () => {
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

  it('drops the check the moment the paste is edited', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(readyToImport(draft))
    server.replyPreview(failing)
    renderWorkspace(draft)
    const user = userEvent.setup()

    const box = await screen.findByLabelText('The returned JSON')
    await user.type(box, 'a pasted answer')
    await user.click(screen.getByRole('button', { name: 'Check it' }))
    expect(await screen.findByText('This stop is missing from the answer.')).toBeInTheDocument()

    await user.type(box, ' ')
    expect(screen.queryByText('This stop is missing from the answer.')).not.toBeInTheDocument()
  })

  it('saves a valid result and says whether it is complete', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(readyToImport(draft))
    server.replyPreview({
      valid: true,
      report: {
        valid: true,
        issues: [],
        normalizations: [],
        completeness: {
          selected: 5,
          unresolved: 1,
          omitted_optional: 0,
          required_unresolved: ['Lunch'],
          missing_timing: [],
          outstanding_checks: [],
          complete: false,
        },
      },
      result: null,
      content_hash: 'hash-of-the-paste',
      export_id: 'exp1',
      changes: ['Nothing is saved for this day yet; this would be the first result.'],
      repair_prompt: null,
    })
    renderWorkspace(draft)
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('The returned JSON'), 'a pasted answer')
    await user.click(screen.getByRole('button', { name: 'Check it' }))

    // Valid and incomplete is a real state, and the button says so.
    const save = await screen.findByRole('button', { name: /Save as needs work/ })
    expect(screen.getByText(/Still open: Lunch/)).toBeInTheDocument()

    await user.click(save)
    await waitFor(() => expect(server.pathsHit('/imports/apply')).toHaveLength(1))
    const body = server.pathsHit('/imports/apply')[0].body as { content_hash: string }
    // Pinned to exactly the text that was checked.
    expect(body.content_hash).toBe('hash-of-the-paste')
  })
})

describe('the saved day', () => {
  const savedDraft = () => ({ ...draftWithOneDay(), workspaceId: 'ws1' })

  function withResult(draft: ItinerarySetupDraft, complete: boolean) {
    const slotId = draft.days[0].slots[0].id
    return dayView(draft, {
      state: complete ? 'saved_complete' : 'saved_needs_work',
      accepted_direction: { ...direction, status: 'accepted' },
      export: exported,
      result: {
        result_revision: 1,
        saved_at: '2026-09-15T11:00:00Z',
        export_id: 'exp1',
        report: {
          valid: true,
          issues: [],
          normalizations: [],
          completeness: {
            selected: 1,
            unresolved: complete ? 0 : 1,
            omitted_optional: 0,
            required_unresolved: complete ? [] : ['Lunch'],
            missing_timing: [],
            outstanding_checks: [],
            complete,
          },
        },
        result: {
          contractVersion: 'itinerary-day-result-v1',
          workspaceId: 'ws1',
          dayId: draft.days[0].id,
          exportId: 'exp1',
          inputHash: exported.input_hash,
          research: {
            performedAt: '2026-09-15',
            browsingUsed: true,
            limitations: ['No routing tool was run.'],
          },
          status: 'ready_for_editor_review',
          title: 'An easy Miraflores day',
          dayIntro: 'A gentle first day by the sea.',
          tripRole: 'The opener.',
          scheduleLabel: 'Illustrative; check opening days.',
          stops: [
            {
              slotId,
              status: 'selected',
              name: 'A real bakery',
              category: 'dining',
              addressOrMeetingPoint: 'Calle Alcanfores 410',
              area: 'Miraflores',
              mapsUrl: 'https://maps.example.com/x',
              startMinutes: 570,
              durationMinutes: 45,
              whyHere: 'A gentle opener.',
              readerCopy: 'Start here with a coffee.',
              whatToDo: ['Order a coffee'],
              practicalNotes: ['Open daily 7am–9pm'],
              claimIds: ['c1'],
              selectionReason: 'It is on the route.',
              unresolvedReason: null,
            },
          ],
          transfers: [],
          restWindows: [],
          sources: [
            {
              id: 's1',
              url: 'https://example.com/bakery',
              title: 'The bakery',
              publisher: 'Example',
              sourceType: 'official',
              accessedAt: '2026-09-15',
              publishedOrUpdatedAt: null,
            },
          ],
          claims: [
            {
              id: 'c1',
              text: 'It opens at 7am every day.',
              sourceIds: ['s1'],
              appliesTo: slotId,
            },
          ],
          feasibility: [],
          proposedChanges: [],
          tripMemory: {
            usedPlaces: [],
            coveredExperiences: [],
            reservedForLater: [],
            nextDayImplications: [],
          },
          editorNotes: [],
        },
      },
      result_history: [
        {
          result_revision: 1,
          saved_at: '2026-09-15T11:00:00Z',
          title: 'An easy Miraflores day',
          complete,
        },
      ],
    })
  }

  it('reads as a day, with the time and the venue where they belong', async () => {
    const draft = savedDraft()
    server.reply(withResult(draft, true))
    renderWorkspace(draft)

    expect(await screen.findByText('An easy Miraflores day')).toBeInTheDocument()
    expect(screen.getByText('A real bakery')).toBeInTheDocument()
    // Minutes past midnight, read back as a clock.
    expect(screen.getByText(/09:30/)).toBeInTheDocument()
    expect(screen.getByText('Start here with a coffee.')).toBeInTheDocument()
  })

  it('says the evidence is unchecked, and keeps saying it', async () => {
    const draft = savedDraft()
    server.reply(withResult(draft, true))
    renderWorkspace(draft)

    expect(
      await screen.findByText(/Nothing below has been checked against its sources/),
    ).toBeInTheDocument()
    // And the model's own verdict is attributed to the model.
    expect(screen.getByText(/the model called it ready for review/)).toBeInTheDocument()
    expect(screen.getByLabelText(/I have read the sources myself/)).not.toBeChecked()
  })

  it('shows a needs-work day as needing work rather than as finished', async () => {
    const draft = savedDraft()
    server.reply(withResult(draft, false))
    renderWorkspace(draft)

    expect(await screen.findByText('Needs work')).toBeInTheDocument()
    expect(screen.getByText(/Still open: Lunch/)).toBeInTheDocument()
  })

  it('leads with the day and folds how it was made below it', async () => {
    const draft = savedDraft()
    server.reply(withResult(draft, false))
    renderWorkspace(draft)

    const article = await screen.findByRole('article')
    const made = screen.getByRole('heading', { name: 'How this day was made' })
    // The day comes first in reading order; the process follows it.
    expect(article.compareDocumentPosition(made) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // The finished stages are one-line summaries that open on request.
    const folds = document.querySelectorAll('details.ip-fold')
    expect(folds.length).toBeGreaterThan(0)
    folds.forEach(fold => expect(fold).not.toHaveAttribute('open'))
    // And the status says what the saved day is, not only where it came from.
    expect(screen.getByText('Saved — not ready for planning')).toBeInTheDocument()
  })

  it('stores a review beside the result and never inside it', async () => {
    const draft = savedDraft()
    server.reply(withResult(draft, true))
    renderWorkspace(draft)
    const user = userEvent.setup()

    await user.click(await screen.findByLabelText(/I have read the sources myself/))
    await user.type(
      screen.getByLabelText('Review notes'),
      'Rang the bakery; the hours are right.',
    )
    await user.click(screen.getByRole('button', { name: 'Save my review' }))

    await waitFor(() => expect(server.pathsHit('/review')).toHaveLength(1))
    expect(server.pathsHit('/review')[0].body).toEqual({
      notes: 'Rang the bakery; the hours are right.',
      evidence_reviewed: true,
    })
  })

  it('never renders a link from the packet that is not http', async () => {
    const draft = savedDraft()
    const view = withResult(draft, true)
    view.result!.result.sources[0].url = 'javascript:alert(1)'
    view.result!.result.stops[0].mapsUrl = 'javascript:alert(1)'
    server.reply(view)
    renderWorkspace(draft)

    await screen.findByText('A real bakery')
    const links = screen.queryAllByRole('link')
    for (const link of links) {
      expect(link.getAttribute('href')).toMatch(/^https?:/)
    }
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
    // The conversation is untouched.
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

describe('the compact research prompt', () => {
  function ready(draft: ItinerarySetupDraft, over: Partial<DayWorkView> = {}) {
    return dayView(draft, {
      state: 'prompt_ready',
      accepted_direction: { ...direction, status: 'accepted' },
      export: exported,
      ...over,
    })
  }

  const ran = {
    state: 'done' as const,
    stalled: false,
    detail: '',
    fault: '',
    model: 'claude-sonnet-5',
    cost_usd: 1.21,
    turns: 31,
    started_at: '2026-09-16T01:00:00Z',
    finished_at: '2026-09-16T01:07:00Z',
    for_current_export: true,
    raw: '',
    duration_ms: 425_000,
    searches: 14,
    fetches: 9,
    budget: { venues: 6, searches: 16, fetches: 11 },
    sent_characters: 15_100,
    returned_characters: 11_800,
  }

  it('leads with the day brief and says what each part weighs', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(ready(draft))
    renderWorkspace(draft)

    expect(await screen.findByText(/One research call with web searches/)).toBeInTheDocument()
    expect(screen.getByText(/About 16 searches and 11 page reads for 6 venue stops/)).toBeInTheDocument()
    expect(screen.getByText(/Lima, Peru · city only/)).toBeInTheDocument()
    const sizes = screen.getByLabelText(/What the call is handed/)
    expect(within(sizes).getByText('Day brief')).toBeInTheDocument()
    expect(within(sizes).getByText('Sent to Claude')).toBeInTheDocument()
    expect(within(sizes).getByText(/15,100/)).toBeInTheDocument()
    // The rest is there, one click away, and the full text is what Copy gives.
    expect(screen.getByText('Instructions', { selector: 'summary' })).toBeInTheDocument()
    expect(screen.getByText('Output format', { selector: 'summary' })).toBeInTheDocument()
    expect(screen.getByText('Full export', { selector: 'summary' })).toBeInTheDocument()
    expect(screen.queryByText(/over the 18,000/)).not.toBeInTheDocument()
  })

  it('says when a brief is large, names the part, and still lets you run it', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    const size = {
      ...(exported.size as Exclude<ExportView['size'], Record<string, never>>),
      total: 24_570,
      over_budget: true,
      largest_section: 'brief' as const,
      sections: { system: 384, instructions: 2600, brief: 12_697, writing: 4280, schema: 4520 },
    }
    server.reply(ready(draft, { export: { ...exported, size } }))
    renderWorkspace(draft)

    expect(await screen.findByText(/over the 18,000 a normal day fits in/)).toBeInTheDocument()
    expect(screen.getByText(/The largest part is the day brief/)).toBeInTheDocument()
    expect(screen.getByText(/Nothing was cut/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Research this day with this scope/ }),
    ).toBeEnabled()
  })

  it('will not run a prompt in the older format, and still lets you copy it', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(
      ready(draft, {
        export: {
          ...exported,
          compact: false,
          legacy: true,
          runnable: false,
          sections: {},
          size: {},
          budget: {},
          wire_version: 'itinerary-day-result-v1',
        },
      }),
    )
    renderWorkspace(draft)

    expect(await screen.findByText(/older, larger format/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Research this day/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Copy the prompt instead/ })).toBeEnabled()
    expect(screen.getByLabelText('The research prompt')).toBeInTheDocument()
  })

  it('reports what the run did, and says unknown when it cannot tell', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(ready(draft, { research: ran }))
    server.replyPreview(completePreview)
    const { unmount } = render(<Harness initial={draft} spy={vi.fn()} />)

    expect(
      await screen.findByText(/14 searches and 9 page reads \(allowance about 16 and 11\)/),
    ).toBeInTheDocument()
    expect(screen.getByText(/7m 05s/)).toBeInTheDocument()
    expect(screen.getByText(/15,100 characters sent/)).toBeInTheDocument()
    unmount()

    server.reply(ready(draft, { research: { ...ran, searches: null, fetches: null } }))
    render(<Harness initial={draft} spy={vi.fn()} />)
    expect(await screen.findByText(/searches and page reads unknown/)).toBeInTheDocument()
  })
})

describe('a saved compact day', () => {
  function compactSaved(draft: ItinerarySetupDraft, complete: boolean) {
    const [first, second] = draft.days[0].slots
    return dayView(draft, {
      state: complete ? 'saved_complete' : 'saved_needs_work',
      accepted_direction: { ...direction, status: 'accepted' },
      export: exported,
      result: {
        result_revision: 1,
        saved_at: '2026-09-16T11:00:00Z',
        export_id: 'exp1',
        returned_raw: '{"contractVersion":"itinerary-day-research-v2","title":"As returned"}',
        report: {
          valid: true,
          issues: [
            {
              severity: 'warning',
              layer: 'schedule',
              path: 'stops',
              message: '120 min between A and B are not planned.',
            },
          ],
          normalizations: [],
          completeness: {
            selected: 2,
            unresolved: 0,
            omitted_optional: 0,
            required_unresolved: [],
            missing_timing: [],
            outstanding_checks: complete ? [] : ['Dinner: It closes at 19:00 on Sundays.'],
            missing_legs: [],
            schedule_conflicts: [],
            complete,
          },
        },
        result: {
          contractVersion: 'itinerary-day-result-v1',
          wireVersion: 'itinerary-day-research-v2',
          workspaceId: 'ws1',
          dayId: draft.days[0].id,
          exportId: 'exp1',
          inputHash: exported.input_hash,
          research: {
            performedAt: '2026-09-16',
            browsingUsed: true,
            browsingBasis: 'tool_calls',
            limitations: [],
          },
          status: complete ? 'ready_for_editor_review' : 'needs_decision',
          title: 'A compact Miraflores day',
          dayIntro: 'An introduction.',
          tripRole: 'The opener.',
          scheduleLabel: 'Full day',
          stops: [
            {
              slotId: first.id,
              status: 'selected',
              name: 'Bakery',
              category: 'dining',
              addressOrMeetingPoint: 'Av. Mariscal La Mar 918',
              area: 'Miraflores',
              mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Bakery',
              startMinutes: 480,
              durationMinutes: 60,
              whyHere: '',
              readerCopy: 'Start with bread.',
              whatToDo: [],
              practicalNotes: ['Open daily from 7:00.'],
              claimIds: ['c1'],
              selectionReason: '',
              unresolvedReason: null,
            },
            {
              slotId: second.id,
              status: 'selected',
              name: 'Market',
              category: 'attractions',
              addressOrMeetingPoint: 'Calle 1',
              area: 'Miraflores',
              mapsUrl: null,
              startMinutes: 555,
              durationMinutes: 60,
              whyHere: '',
              readerCopy: 'Then the market.',
              whatToDo: [],
              practicalNotes: [],
              claimIds: [],
              selectionReason: '',
              unresolvedReason: null,
            },
          ],
          transfers: [
            {
              from: first.id,
              to: second.id,
              mode: 'walk',
              minutesMin: 10,
              minutesMax: 15,
              basis: 'planning_estimate',
              sourceIds: [],
              note: '',
            },
          ],
          restWindows: [],
          sources: [
            {
              id: 's1',
              url: 'https://example.com/bakery',
              title: 'Bakery hours',
              publisher: 'example.com',
              sourceType: 'secondary',
              accessedAt: null,
              publishedOrUpdatedAt: null,
            },
          ],
          claims: [
            { id: 'c1', text: 'Opens daily at 7:00.', sourceIds: ['s1'], appliesTo: first.id },
          ],
          feasibility: complete
            ? []
            : [
                {
                  topic: 'Dinner: It closes at 19:00 on Sundays.',
                  status: 'unresolved',
                  detail: 'It closes at 19:00 on Sundays.',
                  sourceIds: [],
                },
              ],
          proposedChanges: complete
            ? []
            : [{ slotId: second.id, proposal: 'Eat earlier.', reason: 'It closes at 19:00.' }],
          tripMemory: {
            usedPlaces: ['Bakery', 'Market'],
            coveredExperiences: [],
            reservedForLater: [],
            nextDayImplications: [],
          },
          editorNotes: ['Market: Busy at weekends.'],
        },
      },
      result_history: [
        { result_revision: 1, saved_at: '2026-09-16T11:00:00Z', title: 'A compact Miraflores day', complete },
      ],
    })
  }

  it('reads as an article with the journey between the stops', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(compactSaved(draft, true))
    renderWorkspace(draft)

    const article = await screen.findByRole('article')
    expect(within(article).getByText('A compact Miraflores day')).toBeInTheDocument()
    expect(within(article).getByText('Start with bread.')).toBeInTheDocument()
    // Practical notes are under the stop, not behind a click.
    expect(within(article).getByText('Open daily from 7:00.')).toBeVisible()
    expect(
      within(article).getByText(/walk · 10–15 min · a planning estimate, not a routed time/),
    ).toBeInTheDocument()
    // Evidence opens beside its stop, with the address it was chosen at.
    expect(within(article).getByText('Chosen at: Av. Mariscal La Mar 918', { exact: false })).toBeInTheDocument()
    expect(within(article).getByText('Opens daily at 7:00.')).toBeInTheDocument()
    expect(within(article).getByRole('link', { name: /map search/ })).toHaveAttribute(
      'href',
      expect.stringMatching(/^https:\/\/www\.google\.com\/maps\/search\//),
    )
  })

  it('never passes the app’s status off as the model’s verdict', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(compactSaved(draft, true))
    renderWorkspace(draft)

    expect(await screen.findByText(/the app marked it this way/)).toBeInTheDocument()
    expect(screen.queryByText(/the model called it ready/)).not.toBeInTheDocument()
    expect(screen.getByText('What the model returned')).toBeInTheDocument()
    expect(screen.getByText('The saved object')).toBeInTheDocument()
    expect(screen.getByText(/built by the app from that answer/)).toBeInTheDocument()
  })

  it('puts what keeps the day open first, then proposals, then caveats', async () => {
    const draft = { ...draftWithOneDay(), workspaceId: 'ws1' }
    server.reply(compactSaved(draft, false))
    renderWorkspace(draft)

    const panel = await screen.findByRole('region', { name: /Needs your attention/ })
    const text = panel.textContent ?? ''
    const open = text.indexOf('Keeps the day open')
    const proposed = text.indexOf('Changes it proposes')
    const caveats = text.indexOf('Caveats')
    expect(open).toBeGreaterThanOrEqual(0)
    expect(open).toBeLessThan(proposed)
    expect(proposed).toBeLessThan(caveats)
    expect(within(panel).getByText('Dinner: It closes at 19:00 on Sundays.')).toBeInTheDocument()
    expect(within(panel).getByText(`${draft.days[0].slots[1].label}: Eat earlier.`)).toBeInTheDocument()
    expect(within(panel).getByText('Market: Busy at weekends.')).toBeInTheDocument()
    expect(within(panel).getByText('120 min between A and B are not planned.')).toBeInTheDocument()
    expect(screen.getByText('Needs work')).toBeInTheDocument()
  })
})
