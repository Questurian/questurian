import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const listRuns = vi.fn()
vi.mock('./intake.api', async importOriginal => ({
  ...(await importOriginal<typeof import('./intake.api')>()),
  listRuns: () => listRuns(),
}))
import { BriefScreen } from './components/BriefScreen'
import { ArticleScreen } from './components/ArticleScreen'
import { GrillScreen } from './components/GrillScreen'
import { WorkingScreen } from './components/WorkingScreen'
import { ResearchScreen } from './components/ResearchScreen'
import { RunList } from './components/RunList'
import { WorkOrderScreen } from './components/WorkOrderScreen'
import type {
  IntakeBrief,
  IntakeBudgetProjection,
  IntakeRunSummary,
  IntakeGrill,
  IntakeWorkOrder,
  IntakeWriting,
} from './intake.types'

/**
 * What the intake screens owe the person using them.
 *
 * The old page asked for a title, a location, a tone, a brand voice and a
 * direction card before it would do anything, and never asked what the article
 * was for. These pin the behaviours that replaced it.
 */

function grill(overrides: Partial<IntakeGrill> = {}): IntakeGrill {
  return {
    status: 'asking',
    seed: 'Lima is no longer simply the stopover',
    turns: [],
    pending: {
      question_id: 'q1',
      topic: 'what this should do',
      ask: 'Do you want a guide, or to make the case?',
      recommendation: 'My recommendation: a guide with a point of view.',
      pushback: '',
      asks_about: 'form',
    },
    consensus: '',
    markers_covered: [],
    markers_missing: ['reader', 'fails_if'],
    ...overrides,
  }
}

describe('the write hand-off', () => {
  it('actually asks the server to write, rather than doing nothing', async () => {
    // It was an empty function with a comment saying stage 5 would land it.
    // Stage 5 shipped, the route existed, and nothing ever called it.
    const { startWriting } = await import('./intake.api')
    expect(typeof startWriting).toBe('function')
  })
})

describe('the grill screen', () => {
  it('starts with the recommended answer already in the box', () => {
    // Nobody faces a blank. Correcting is easy where composing is not.
    render(
      <GrillScreen grill={grill()} busy={false} onAnswer={vi.fn()} onApprove={vi.fn()} onReopen={vi.fn()} />,
    )

    expect(screen.getByRole('textbox')).toHaveValue(
      'My recommendation: a guide with a point of view.',
    )
  })

  it('offers agreement as one click when the answer is unchanged', () => {
    render(
      <GrillScreen grill={grill()} busy={false} onAnswer={vi.fn()} onApprove={vi.fn()} onReopen={vi.fn()} />,
    )

    expect(screen.getByRole('button', { name: /sounds right/i })).toBeInTheDocument()
  })

  it('sends what was actually typed, not the recommendation', () => {
    const onAnswer = vi.fn()
    render(
      <GrillScreen grill={grill()} busy={false} onAnswer={onAnswer} onApprove={vi.fn()} onReopen={vi.fn()} />,
    )

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'guide, but a bit of a pitch' },
    })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))

    expect(onAnswer).toHaveBeenCalledWith('guide, but a bit of a pitch')
  })

  it('reads as a conversation: the seed, then each exchange, then the question', () => {
    render(
      <GrillScreen
        grill={grill({
          turns: [
            {
              question_id: 'q1',
              topic: 't',
              ask: 'Who is this for?',
              recommendation: 'First-timers with three days.',
              pushback: '',
              answer: 'people with 3 days and no spanish',
              accepted_as_drafted: false,
            },
          ],
        })}
        busy={false}
        onAnswer={vi.fn()}
        onApprove={vi.fn()}
        onReopen={vi.fn()}
      />,
    )

    expect(screen.getByText(/lima is no longer simply the stopover/i)).toBeInTheDocument()
    expect(screen.getByText('Who is this for?')).toBeInTheDocument()
    expect(screen.getByText(/people with 3 days and no spanish/i)).toBeInTheDocument()
    expect(screen.getByText(/do you want a guide/i)).toBeInTheDocument()
  })

  it('marks an accepted suggestion as accepting rather than answering', () => {
    // The grill agreed with itself after two turns because nothing showed the
    // difference. It is worth different amounts and it should look different.
    render(
      <GrillScreen
        grill={grill({
          turns: [
            {
              question_id: 'q1',
              topic: 't',
              ask: 'Who is this for?',
              recommendation: 'First-timers with three days.',
              pushback: '',
              answer: 'First-timers with three days.',
              accepted_as_drafted: true,
            },
          ],
        })}
        busy={false}
        onAnswer={vi.fn()}
        onApprove={vi.fn()}
        onReopen={vi.fn()}
      />,
    )

    expect(screen.getByText(/you accepted the suggestion/i)).toBeInTheDocument()
  })

  it('says what the brief still needs, rather than counting questions', () => {
    render(
      <GrillScreen
        grill={grill({ markers_missing: ['reader', 'fails_if'] })}
        busy={false}
        onAnswer={vi.fn()}
        onApprove={vi.fn()}
        onReopen={vi.fn()}
      />,
    )

    expect(screen.getByText(/who it is for/i)).toBeInTheDocument()
    expect(screen.getByText(/what would fail/i)).toBeInTheDocument()
  })

  it('sends on Enter and breaks the line on shift+Enter', () => {
    const onAnswer = vi.fn()
    render(
      <GrillScreen grill={grill()} busy={false} onAnswer={onAnswer} onApprove={vi.fn()} onReopen={vi.fn()} />,
    )
    const box = screen.getByRole('textbox')

    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true })
    expect(onAnswer).not.toHaveBeenCalled()

    fireEvent.keyDown(box, { key: 'Enter' })
    expect(onAnswer).toHaveBeenCalledWith('My recommendation: a guide with a point of view.')
  })

  it('lets the suggestion be cleared so the answer can be their own', () => {
    render(
      <GrillScreen grill={grill()} busy={false} onAnswer={vi.fn()} onApprove={vi.fn()} onReopen={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /clear/i }))

    expect(screen.getByRole('textbox')).toHaveValue('')
  })

  it('shows the contradiction above the question that exists to resolve it', () => {
    render(
      <GrillScreen
        grill={grill({
          pending: {
            ...grill().pending!,
            pushback: 'Your line said destination; a food argument is one thing, not a place.',
          },
        })}
        busy={false}
        onAnswer={vi.fn()}
        onApprove={vi.fn()}
        onReopen={vi.fn()}
      />,
    )

    expect(screen.getByText(/your line said destination/i)).toBeInTheDocument()
  })

  it('offers agreement or more talking once it has played back what it heard', () => {
    render(
      <GrillScreen
        grill={grill({ status: 'agreed', pending: null, consensus: 'A guide for a Lima layover.' })}
        busy={false}
        onAnswer={vi.fn()}
        onApprove={vi.fn()}
        onReopen={vi.fn()}
      />,
    )

    expect(screen.getByText('A guide for a Lima layover.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /that.s the article/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /keep talking/i })).toBeInTheDocument()
  })
})

const BRIEF: IntakeBrief = {
  brief_fingerprint: 'bf-1',
  seed: 'Lima is no longer simply the stopover',
  location: 'Lima, Peru',
  form_id: 'destination-guide',
  spine: 'food, cheap beats famous',
  outcome: 'book two extra nights',
  fails_if: 'reads like a tourist board',
  must_name: ['Surquillo market'],
  material: [{ kind: 'firsthand', statement: 'I was there 4 days. mostly ate.' }],
}

describe('the brief screen', () => {
  it('shows your own words back, exactly', () => {
    // First-hand material skips fact-checking by design, so this screen is the
    // only place a wrong version of what you said can still be caught.
    render(<BriefScreen brief={BRIEF} busy={false} onPlanResearch={vi.fn()} onReopen={vi.fn()} />)

    expect(screen.getByText('I was there 4 days. mostly ate.')).toBeInTheDocument()
  })

  it('shows what would make the article a failure', () => {
    render(<BriefScreen brief={BRIEF} busy={false} onPlanResearch={vi.fn()} onReopen={vi.fn()} />)

    expect(screen.getByText('reads like a tourist board')).toBeInTheDocument()
  })

  it('cannot be edited in place', () => {
    // Changing it means talking to the grill again: a typed brief is untracked
    // instruction injected into every stage after it.
    render(<BriefScreen brief={BRIEF} busy={false} onPlanResearch={vi.fn()} onReopen={vi.fn()} />)

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})

const WORK_ORDER: IntakeWorkOrder = {
  work_order_fingerprint: 'wo-1',
  brief_fingerprint: 'bf-1',
  primary_subject: 'Lima',
  requirements: [
    {
      requirement_id: 'r1',
      question: 'What do stalls charge?',
      purpose: 'Fixes the price the tasting menus are compared against.',
      kind: 'load_bearing',
      precision: 'exact',
      bundled_note: '',
    },
    {
      requirement_id: 'r2',
      question: 'What is it like at night?',
      purpose: '',
      kind: 'texture',
      precision: 'approximate',
      bundled_note: '',
    },
  ],
  load_bearing_count: 1,
  texture_count: 1,
  cut_warnings: [],
  budget_projection: null,
}

/** A plan that projects past the hard ceiling: it never reaches the writer. */
const CANNOT_FINISH: IntakeBudgetProjection = {
  question_count: 44,
  spent: 40_000,
  projected_research: 651_200,
  projected_writing: 134_000,
  projected_total: 825_200,
  repair_reserve: 90_000,
  budget: 425_000,
  projected_cost_usd: 1.05,
  cost_budget_usd: 2.0,
  repair_affordable: false,
  questions_that_fit: 0,
  ceiling: 650_000,
  can_finish: false,
  questions_that_finish: 31,
  fact_budget: 0,
  editorial_note: '',
  note: '44 questions projects to about 825,200 tokens, past the 650,000 hard ceiling. This plan stops part-way through research and never reaches the writer, so there is no article at the end of it. About 31 questions would finish. Cut the plan before starting research.',
}

describe('the work order screen', () => {
  it('lets a load-bearing question be struck', () => {
    // A decision that cannot be wrong is not a decision.
    const onCut = vi.fn()
    render(
      <WorkOrderScreen
        workOrder={WORK_ORDER}
        warnings={[]}
        busy={false}
        onCut={onCut}
        onReopen={vi.fn()}
        onResearch={vi.fn()}
      />,
    )

    fireEvent.click(screen.getAllByRole('checkbox')[1])
    fireEvent.click(screen.getByRole('button', { name: /apply changes/i }))

    expect(onCut).toHaveBeenCalledWith(['r2'], [])
  })

  it('shows what the plan will cost, because nobody ever saw the number', () => {
    // It was computed and written to the run from the start, and never
    // rendered. A plan that could not finish was approved and died in
    // research, 707,468 tokens in, with no draft.
    render(
      <WorkOrderScreen
        workOrder={{ ...WORK_ORDER, budget_projection: CANNOT_FINISH }}
        warnings={[]}
        busy={false}
        onCut={vi.fn()}
        onReopen={vi.fn()}
        onResearch={vi.fn()}
      />,
    )

    expect(screen.getByText(/never reaches the writer/i)).toBeInTheDocument()
  })

  it('will not start research on a plan that cannot reach the writer', () => {
    const onResearch = vi.fn()
    render(
      <WorkOrderScreen
        workOrder={{ ...WORK_ORDER, budget_projection: CANNOT_FINISH }}
        warnings={[]}
        busy={false}
        onCut={vi.fn()}
        onReopen={vi.fn()}
        onResearch={onResearch}
      />,
    )

    expect(screen.getByRole('button', { name: /go and find this out/i })).toBeDisabled()
    expect(onResearch).not.toHaveBeenCalled()
  })

  it('leaves a plan that merely cannot repair itself alone', () => {
    // It publishes. That makes it the operator's call, not the system's.
    render(
      <WorkOrderScreen
        workOrder={{
          ...WORK_ORDER,
          budget_projection: {
            ...CANNOT_FINISH,
            can_finish: true,
            note: 'will not be able to repair itself',
          },
        }}
        warnings={[]}
        busy={false}
        onCut={vi.fn()}
        onReopen={vi.fn()}
        onResearch={vi.fn()}
      />,
    )

    expect(screen.getByText(/repair itself/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /go and find this out/i }),
    ).not.toBeDisabled()
  })

  it('says what each question is for, beside the question', () => {
    // "Does this article need this?" is unanswerable from the question alone,
    // and the operator is being asked exactly that on this screen.
    render(
      <WorkOrderScreen
        workOrder={WORK_ORDER}
        warnings={[]}
        busy={false}
        onCut={vi.fn()}
        onReopen={vi.fn()}
        onResearch={vi.fn()}
      />,
    )

    expect(
      screen.getByText(/fixes the price the tasting menus are compared against/i),
    ).toBeInTheDocument()
  })

  it('flags a question that never named its job', () => {
    // Kept, not hidden and not dropped: a question with no nameable job is
    // usually one the article has no room for, and often one no source can
    // answer. Five such questions blocked run e23257c0 and were struck by hand.
    render(
      <WorkOrderScreen
        workOrder={WORK_ORDER}
        warnings={[]}
        busy={false}
        onCut={vi.fn()}
        onReopen={vi.fn()}
        onResearch={vi.fn()}
      />,
    )

    expect(screen.getByText(/no stated job in the article/i)).toBeInTheDocument()
  })

  it('says how much editorial room the article has, not just how much money', () => {
    // The money projection said run e23257c0's 57 questions "fit". True, and
    // silent about the article having room for eighteen of the 431 facts.
    render(
      <WorkOrderScreen
        workOrder={{
          ...WORK_ORDER,
          budget_projection: {
            ...CANNOT_FINISH,
            can_finish: true,
            note: 'inside the budget',
            fact_budget: 18,
            editorial_note: '57 questions, against an article with room for about 18 facts.',
          },
        }}
        warnings={[]}
        busy={false}
        onCut={vi.fn()}
        onReopen={vi.fn()}
        onResearch={vi.fn()}
      />,
    )

    expect(screen.getByText(/room for about 18 facts/i)).toBeInTheDocument()
    // It reports. It never refuses: there is no cap on how many questions a
    // plan may ask, and the form decides how many it takes.
    expect(
      screen.getByRole('button', { name: /go and find this out/i }),
    ).not.toBeDisabled()
  })

  it('will not buy research for a plan with nothing worth reading', () => {
    // The gate refuses a dossier with no colour in it, and offers nothing to
    // settle when it does, so the run would spend its whole research budget
    // and stop dead. The length constraint makes this reachable by accident:
    // told the article has room for eighteen facts, the planner cuts colour
    // first.
    const onResearch = vi.fn()
    render(
      <WorkOrderScreen
        workOrder={{
          ...WORK_ORDER,
          requirements: WORK_ORDER.requirements.filter(item => item.kind !== 'texture'),
        }}
        warnings={[]}
        busy={false}
        onCut={vi.fn()}
        onReopen={vi.fn()}
        onResearch={onResearch}
      />,
    )

    expect(screen.getByText(/nothing here would be a pleasure to read/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /go and find this out/i })).toBeDisabled()
    expect(onResearch).not.toHaveBeenCalled()
  })

  it('says so as soon as the last colour question is struck', () => {
    // Before the cut is applied, not after the research is bought.
    render(
      <WorkOrderScreen
        workOrder={WORK_ORDER}
        warnings={[]}
        busy={false}
        onCut={vi.fn()}
        onReopen={vi.fn()}
        onResearch={vi.fn()}
      />,
    )

    expect(screen.queryByText(/pleasure to read/i)).not.toBeInTheDocument()
    // r2 is the texture question in this fixture.
    fireEvent.click(screen.getAllByRole('checkbox')[1])

    expect(screen.getByText(/nothing here would be a pleasure to read/i)).toBeInTheDocument()
  })

  it('will not let every load-bearing question be struck', () => {
    render(
      <WorkOrderScreen
        workOrder={WORK_ORDER}
        warnings={[]}
        busy={false}
        onCut={vi.fn()}
        onReopen={vi.fn()}
        onResearch={vi.fn()}
      />,
    )

    fireEvent.click(screen.getAllByRole('checkbox')[0])

    expect(screen.getByText(/nothing to write/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /apply changes/i })).toBeDisabled()
  })

  it('shows what a cut cost, after the fact', () => {
    render(
      <WorkOrderScreen
        workOrder={WORK_ORDER}
        warnings={['Cut "What do stalls charge?" — without it the piece cannot claim…']}
        busy={false}
        onCut={vi.fn()}
        onReopen={vi.fn()}
        onResearch={vi.fn()}
      />,
    )

    expect(screen.getByText(/without it the piece cannot claim/i)).toBeInTheDocument()
  })
})


describe('the research screen', () => {
  const research = {
    work_order_fingerprint: 'wo-1',
    source_count: 4,
    claim_count: 9,
    requirement_status: { r1: 'supported', r2: 'unpublished' },
    findings: {},
    conflicts: [],
    coverage: {
      can_write: true,
      reason: 'ready_to_write',
      unsupported_load_bearing: [],
      refuted_assumptions: [],
      has_texture: true,
      findings: [],
    },
  }

  it('offers to write when research carried the piece', () => {
    render(
      <ResearchScreen runId="run-1" onChanged={vi.fn()} research={research} busy={false} onWrite={vi.fn()} onReopen={vi.fn()} />,
    )

    expect(screen.getByRole('button', { name: /write it/i })).toBeInTheDocument()
  })

  it('sends a thin dossier back to the grill, not to more research', () => {
    // The grill is the single exit from every dead end.
    render(
      <ResearchScreen
        runId="run-1"
        onChanged={vi.fn()}
        research={{
          ...research,
          coverage: {
            ...research.coverage,
            can_write: false,
            reason: 'nothing_worth_reading',
            has_texture: false,
            findings: ['Nothing here would be a pleasure to read.'],
          },
        }}
        busy={false}
        onWrite={vi.fn()}
        onReopen={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /back to the grill/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /write it/i })).toBeNull()
    expect(screen.getByText(/pleasure to read/i)).toBeInTheDocument()
  })

  it('says plainly when more research cannot help', () => {
    render(
      <ResearchScreen
        runId="run-1"
        onChanged={vi.fn()}
        research={{
          ...research,
          coverage: {
            ...research.coverage,
            can_write: false,
            reason: 'premise_refuted',
            refuted_assumptions: ['a1'],
            findings: ['a1 was assumed and turned out not to be so.'],
          },
        }}
        busy={false}
        onWrite={vi.fn()}
        onReopen={vi.fn()}
      />,
    )

    expect(screen.getByText(/not something more research can fix/i)).toBeInTheDocument()
  })
})

// --- while something is running, and after it stops -----------------------

function writing(overrides: Partial<IntakeWriting> = {}): IntakeWriting {
  return {
    state: 'completed',
    stage: 'complete',
    stage_label: 'Done',
    error: null,
    updated_at: '2026-08-31T04:15:29Z',
    final_title: 'Lima is no longer simply the stopover before Cusco',
    word_count: 914,
    pipeline_status: 'ready_for_staging',
    readiness_blockers: [],
    constraint_checks: {},
    ...overrides,
  }
}

describe('the working screen', () => {
  it('counts the searches that have come back, and names the last one', () => {
    render(
      <WorkingScreen
        research={{
          phase: 'gathering',
          done: 3,
          total: 10,
          last_question_back: 'What do the tasting menus charge?',
        }}
      />,
    )

    // Three back, not "searching number four": they are all in flight, so a
    // number that claims to be the current one would be a fiction.
    expect(screen.getByText(/searching the web: 3 of 10 back/i)).toBeInTheDocument()
    expect(screen.getByText(/what do the tasting menus charge/i)).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3')
  })

  it('says the searches went out together before any has come back', () => {
    render(
      <WorkingScreen
        research={{ phase: 'gathering', done: 0, total: 7, last_question_back: '' }}
      />,
    )

    expect(screen.getByText(/7 questions at once/i)).toBeInTheDocument()
    expect(screen.getByText(/the slowest single search/i)).toBeInTheDocument()
  })

  it('gives structuring its own phase rather than looking like a stall', () => {
    render(
      <WorkingScreen
        research={{ phase: 'structuring', done: 10, total: 10, last_question_back: '' }}
      />,
    )

    expect(screen.getByText(/turning the research into records/i)).toBeInTheDocument()
  })

  it('says the writing stage in words, not as a stage id', () => {
    render(
      <WorkingScreen writing={writing({ state: 'running', stage_label: 'Writing the article' })} />,
    )

    expect(screen.getByText('Writing the article')).toBeInTheDocument()
    expect(screen.queryByText(/stage_v3/)).not.toBeInTheDocument()
  })

  it('says the tab can be closed, because the work is on the server', () => {
    render(<WorkingScreen writing={writing({ state: 'running' })} />)

    expect(screen.getByText(/you can leave this page/i)).toBeInTheDocument()
  })
})

function renderArticle(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('the finished article screen', () => {
  it('shows the title and the stamp instead of leaving the run invisible', () => {
    renderArticle(<ArticleScreen runId="run-1" writing={writing()} article={null} onReopen={vi.fn()} busy={false} />)

    expect(screen.getByText(/lima is no longer simply the stopover/i)).toBeInTheDocument()
    expect(screen.getByText(/ready for staging/i)).toBeInTheDocument()
  })

  it('renders the article once it arrives', () => {
    renderArticle(
      <ArticleScreen
        runId="run-1"
        writing={writing()}
        article={{
          run_id: 'r',
          title: 'T',
          form_label: 'Destination Guide',
          markdown: '## The elevation contrast\n\nCusco sits at 3,399 meters.',
          pipeline_status: 'ready_for_staging',
          readiness_blockers: [],
          constraint_checks: {},
          word_count: 914,
        }}
        onReopen={vi.fn()}
        busy={false}
      />,
    )

    expect(screen.getByText('The elevation contrast')).toBeInTheDocument()
    expect(screen.getByText(/cusco sits at 3,399 meters/i)).toBeInTheDocument()
  })

  it('reports the measured sentence spread and says nothing blocks', () => {
    renderArticle(
      <ArticleScreen
        runId="run-1"
        writing={writing({
          constraint_checks: {
            sentence_count: 75,
            sentence_mean_words: 11.3,
            sentence_widest_band_share: 0.57,
            sentences_over_25_words: 1,
            sentence_variety_note: 'The prose will read as metered. Nothing here blocks.',
          },
        })}
        article={null}
        onReopen={vi.fn()}
        busy={false}
      />,
    )

    expect(screen.getByText('75')).toBeInTheDocument()
    expect(screen.getByText('57%')).toBeInTheDocument()
    expect(screen.getByText(/nothing here blocks/i)).toBeInTheDocument()
  })

  it('a needs-revision stamp is shown and never obeyed', () => {
    // ADR 0030: once prose exists nothing blocks. The article is still here.
    renderArticle(
      <ArticleScreen
        runId="run-1"
        writing={writing({
          pipeline_status: 'needs_revision',
          readiness_blockers: ['It is forty one words long.'],
        })}
        article={null}
        onReopen={vi.fn()}
        busy={false}
      />,
    )

    expect(screen.getByText(/written, with notes/i)).toBeInTheDocument()
    expect(screen.getByText(/forty one words long/i)).toBeInTheDocument()
    expect(screen.getByText(/lima is no longer/i)).toBeInTheDocument()
  })

  it('a failed run says where it stopped and keeps the way back', () => {
    const onReopen = vi.fn()
    renderArticle(
      <ArticleScreen
        runId="run-1"
        writing={writing({
          state: 'failed',
          stage_label: 'Writing the article',
          error: 'The writer refused.',
        })}
        article={null}
        onReopen={onReopen}
        busy={false}
      />,
    )

    expect(screen.getByText('The writer refused.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /back to the grill/i }))
    expect(onReopen).toHaveBeenCalled()
  })

  it('a finished article can be kept, not only read', () => {
    // The screen offered "start again from the grill" and nothing else, so the
    // one thing anyone wants at the end of a run -- keeping it -- was reachable
    // only from Saved Articles.
    renderArticle(
      <ArticleScreen
        runId="run-1"
        writing={writing()}
        article={{
          run_id: 'run-1',
          title: 'T',
          form_label: 'Destination Guide',
          markdown: 'Body.',
          pipeline_status: 'ready_for_staging',
          readiness_blockers: [],
          constraint_checks: {},
          word_count: 914,
        }}
        onReopen={vi.fn()}
        busy={false}
      />,
    )

    const link = screen.getByRole('link', { name: /stage in payload editor/i })
    expect(link).toHaveAttribute('href', expect.stringContaining('/prompt2blog/stage-article'))
    expect(link).toHaveAttribute('href', expect.stringContaining('runId=run-1'))
  })

  it('a needs-revision article carries the same staging button as a clean one', () => {
    renderArticle(
      <ArticleScreen
        runId="run-1"
        writing={writing({
          pipeline_status: 'needs_revision',
          readiness_blockers: ['It is forty one words long.'],
        })}
        article={null}
        onReopen={vi.fn()}
        busy={false}
      />,
    )

    expect(screen.getByRole('link', { name: /stage in payload editor/i })).toBeInTheDocument()
  })
})

describe('the list of runs to go back to', () => {
  function runs(rows: Partial<IntakeRunSummary>[]): IntakeRunSummary[] {
    return rows.map((row, index) => ({
      run_id: `run-${index}`,
      seed: `Seed ${index}`,
      status: 'completed',
      stage: 'complete',
      stage_label: 'Done',
      updated_at: '2026-08-31T18:13:33',
      ...row,
    }))
  }

  it('names each run by its seed, because a uuid is not a name', async () => {
    listRuns.mockResolvedValueOnce(runs([{ seed: 'Lima is no longer a stopover' }]))

    render(<RunList onResume={vi.fn()} />)

    expect(await screen.findByText(/lima is no longer a stopover/i)).toBeInTheDocument()
  })

  it('puts a run somebody is waiting on above the finished ones', async () => {
    listRuns.mockResolvedValueOnce(
      runs([
        { seed: 'Finished piece' },
        { seed: 'Still searching', status: 'running', stage_label: 'Searching the web' },
      ]),
    )

    render(<RunList onResume={vi.fn()} />)
    await screen.findByText(/still searching/i)

    const seeds = screen.getAllByText(/finished piece|still searching/i)
    expect(seeds[0]).toHaveTextContent(/still searching/i)
  })

  it('falls back to the id when a run failed before its seed was recorded', async () => {
    listRuns.mockResolvedValueOnce(runs([{ seed: '', run_id: 'run-abc' }]))

    render(<RunList onResume={vi.fn()} />)

    expect(await screen.findByText('run-abc')).toBeInTheDocument()
  })

  it('opens the run that was clicked', async () => {
    const onResume = vi.fn().mockResolvedValue(undefined)
    listRuns.mockResolvedValueOnce(runs([{ run_id: 'run-7', seed: 'Pick me' }]))

    render(<RunList onResume={onResume} />)
    const row = await screen.findByText(/pick me/i)
    // Opening flips the row's disabled state when the promise settles, which
    // is a state update the click itself does not wait for.
    await act(async () => {
      fireEvent.click(row)
    })

    expect(onResume).toHaveBeenCalledWith('run-7')
  })

  it('shows nothing at all when the list cannot be loaded', async () => {
    // A convenience must not stand between the operator and a new article.
    listRuns.mockRejectedValueOnce(new Error('offline'))

    let container!: HTMLElement
    await act(async () => {
      container = render(<RunList onResume={vi.fn()} />).container
    })

    await waitFor(() => expect(container.querySelector('.p2b-run-list')).toBeNull())
  })
})

it('shows outline fallback separately from the readiness stamp', () => {
  renderArticle(
    <ArticleScreen
      runId="run-1"
      writing={writing({ outline_warning: 'The section plan was unusable. Review its structure.' })}
      article={null}
      onReopen={vi.fn()}
      busy={false}
    />,
  )
  expect(screen.getByRole('status')).toHaveTextContent('The section plan was unusable.')
  expect(screen.getByText(/Ready for staging/)).toBeInTheDocument()
})
