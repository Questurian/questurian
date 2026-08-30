import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BriefScreen } from './components/BriefScreen'
import { GrillScreen } from './components/GrillScreen'
import { ResearchScreen } from './components/ResearchScreen'
import { WorkOrderScreen } from './components/WorkOrderScreen'
import type { IntakeBrief, IntakeGrill, IntakeWorkOrder } from './intake.types'

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
    },
    consensus: '',
    ...overrides,
  }
}

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
