import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BriefScreen } from './components/BriefScreen'
import { ArticleScreen } from './components/ArticleScreen'
import { GrillScreen } from './components/GrillScreen'
import { WorkingScreen } from './components/WorkingScreen'
import { ResearchScreen } from './components/ResearchScreen'
import { WorkOrderScreen } from './components/WorkOrderScreen'
import type {
  IntakeBrief,
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
    { requirement_id: 'r1', question: 'What do stalls charge?', kind: 'load_bearing' },
    { requirement_id: 'r2', question: 'What is it like at night?', kind: 'texture' },
  ],
  load_bearing_count: 1,
  texture_count: 1,
  cut_warnings: [],
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
      <ResearchScreen research={research} busy={false} onWrite={vi.fn()} onReopen={vi.fn()} />,
    )

    expect(screen.getByRole('button', { name: /write it/i })).toBeInTheDocument()
  })

  it('sends a thin dossier back to the grill, not to more research', () => {
    // The grill is the single exit from every dead end.
    render(
      <ResearchScreen
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
  it('names the question it is searching, and how far along it is', () => {
    render(
      <WorkingScreen
        research={{
          phase: 'gathering',
          done: 3,
          total: 10,
          current_question: 'What do the tasting menus charge?',
        }}
      />,
    )

    expect(screen.getByText(/searching the web: 4 of 10/i)).toBeInTheDocument()
    expect(screen.getByText(/what do the tasting menus charge/i)).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3')
  })

  it('gives structuring its own phase rather than looking like a stall', () => {
    render(
      <WorkingScreen
        research={{ phase: 'structuring', done: 10, total: 10, current_question: '' }}
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

describe('the finished article screen', () => {
  it('shows the title and the stamp instead of leaving the run invisible', () => {
    render(<ArticleScreen writing={writing()} article={null} onReopen={vi.fn()} busy={false} />)

    expect(screen.getByText(/lima is no longer simply the stopover/i)).toBeInTheDocument()
    expect(screen.getByText(/ready for staging/i)).toBeInTheDocument()
  })

  it('renders the article once it arrives', () => {
    render(
      <ArticleScreen
        writing={writing()}
        article={{
          run_id: 'r',
          title: 'T',
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
    render(
      <ArticleScreen
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
    render(
      <ArticleScreen
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
    render(
      <ArticleScreen
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
})
