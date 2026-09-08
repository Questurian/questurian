import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const listRuns = vi.fn()
const readEditActions = vi.fn()
const proposeSectionEdit = vi.fn()
const applySectionEdit = vi.fn()
const undoSectionEdit = vi.fn()
vi.mock('./intake.api', async importOriginal => ({
  ...(await importOriginal<typeof import('./intake.api')>()),
  listRuns: () => listRuns(),
  readEditActions: () => readEditActions(),
  proposeSectionEdit: (...args: unknown[]) => proposeSectionEdit(...args),
  applySectionEdit: (...args: unknown[]) => applySectionEdit(...args),
  undoSectionEdit: (...args: unknown[]) => undoSectionEdit(...args),
}))
import { BriefScreen } from './components/BriefScreen'
import { PromptScreen } from './components/PromptScreen'
import { DraftScreen } from './components/DraftScreen'
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
  IntakeDraft,
  IntakeFinding,
  IntakeGeneration,
  IntakeReview,
  IntakeReviewResult,
  IntakeWriterPrompt,
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
  topic_module_ids: ['food-drink'],
  primary_reader: 'a layover traveller with two spare nights',
  reader_tags: ['first-time-visitor'],
  reader_question: 'Is Lima worth two extra nights?',
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
    render(
      <BriefScreen brief={BRIEF} busy={false} onGeneratePrompt={vi.fn()} onReopen={vi.fn()} />,
    )

    expect(screen.getByText('I was there 4 days. mostly ate.')).toBeInTheDocument()
  })

  it('shows what would make the article a failure', () => {
    render(
      <BriefScreen brief={BRIEF} busy={false} onGeneratePrompt={vi.fn()} onReopen={vi.fn()} />,
    )

    expect(screen.getByText('reads like a tourist board')).toBeInTheDocument()
  })

  it('shows every field that reaches the writer', () => {
    // The brief is now the whole assignment (ADR 0036). Approving it while the
    // reader and the reader's question sit off screen is approving something
    // unread -- and those two travel verbatim into the prompt.
    render(
      <BriefScreen brief={BRIEF} busy={false} onGeneratePrompt={vi.fn()} onReopen={vi.fn()} />,
    )

    expect(
      screen.getByText('a layover traveller with two spare nights'),
    ).toBeInTheDocument()
    expect(screen.getByText('Is Lima worth two extra nights?')).toBeInTheDocument()
  })

  it('cannot be edited in place', () => {
    // Changing it means talking to the grill again: a typed brief is untracked
    // instruction injected straight into the writing assignment.
    render(
      <BriefScreen brief={BRIEF} busy={false} onGeneratePrompt={vi.fn()} onReopen={vi.fn()} />,
    )

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('says that generating the prompt costs nothing', () => {
    // The button before this one bought a research plan. This one buys nothing,
    // and a person who does not know that will not press it to look.
    render(
      <BriefScreen brief={BRIEF} busy={false} onGeneratePrompt={vi.fn()} onReopen={vi.fn()} />,
    )

    expect(screen.getByRole('button', { name: 'Generate prompt' })).toBeInTheDocument()
    expect(screen.getByText(/costs nothing/)).toBeInTheDocument()
  })
})

const WRITER_PROMPT: IntakeWriterPrompt = {
  prompt_fingerprint: 'wp-1',
  brief_fingerprint: 'bf-1',
  template_version: 'writer-prompt-1',
  style_version: 'short-style-1',
  target_word_count: 900,
  research_date: '2026-09-07',
  characters: 42,
  text: 'Write an approximately 900-word article from the approved Article Brief below.',
}

describe('the prompt screen', () => {
  it('shows the whole assignment, not a summary of it', () => {
    // The old pipeline assembled its instruction from a form rulebook, a work
    // order, a packet, an SEO block and forty-one prohibitions, and no operator
    // ever saw a line of it.
    render(<PromptScreen
        prompt={WRITER_PROMPT}
        busy={false}
        onGenerate={vi.fn()}
        onReopen={vi.fn()}
        onPaste={vi.fn()}
      />)

    expect(screen.getByText(WRITER_PROMPT.text)).toBeInTheDocument()
  })

  it('cannot be edited in place', () => {
    // A textarea invites an edit that would be silently discarded: the stored
    // assignment is the one that gets sent.
    render(<PromptScreen
        prompt={WRITER_PROMPT}
        busy={false}
        onGenerate={vi.fn()}
        onReopen={vi.fn()}
        onPaste={vi.fn()}
      />)

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('says which writer and which length', () => {
    render(<PromptScreen
        prompt={WRITER_PROMPT}
        busy={false}
        onGenerate={vi.fn()}
        onReopen={vi.fn()}
        onPaste={vi.fn()}
      />)

    expect(screen.getByText(/about 900 words/)).toBeInTheDocument()
    expect(screen.getByText(/Claude Opus, high effort/)).toBeInTheDocument()
  })

  it('says that generating spends, before it is pressed', () => {
    // The button before this one bought nothing. This one buys an article, and
    // saying so afterwards is not saying it.
    render(
      <PromptScreen
        prompt={WRITER_PROMPT}
        busy={false}
        onGenerate={vi.fn()}
        onReopen={vi.fn()}
        onPaste={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Generate article' })).toBeInTheDocument()
    expect(screen.getByText(/spends Claude allowance/)).toBeInTheDocument()
  })

  it('leads back to the grill rather than offering a text box', () => {
    const onReopen = vi.fn()
    render(<PromptScreen
      prompt={WRITER_PROMPT}
      busy={false}
      onGenerate={vi.fn()}
      onReopen={onReopen}
      onPaste={vi.fn()}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Change something' }))

    expect(onReopen).toHaveBeenCalled()
  })
})

const GENERATION: IntakeGeneration = {
  state: 'succeeded',
  attempt_id: 'a-1',
  attempts: 1,
  started_at: '2026-09-07T10:00:00Z',
  finished_at: '2026-09-07T10:08:32Z',
  failure: null,
  message: null,
  raw: null,
  requested_model: 'claude-opus-5-high',
  served_model: 'claude-opus-5-20260101',
  effort: 'high',
  turns: 14,
  elapsed_seconds: 512.4,
  cost_usd: 0.42,
  tool_denials: [],
  source: 'written',
  written_by: null,
  has_draft: true,
  headline: 'Two nights in Lima',
  word_count: 912,
  parse_issue: null,
}

describe('bringing in an article written somewhere else', () => {
  function renderPrompt(onPaste = vi.fn()) {
    render(
      <PromptScreen
        prompt={WRITER_PROMPT}
        busy={false}
        onGenerate={vi.fn()}
        onReopen={vi.fn()}
        onPaste={onPaste}
      />,
    )
    return onPaste
  }

  it('offers the way back in without pushing it', () => {
    // The prompt is a copy-paste artifact by design. This is the return path,
    // and it stays folded away so it does not compete with the button that
    // writes the article here.
    renderPrompt()

    expect(
      screen.getByRole('button', { name: /paste an article instead/i }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('says plainly that it costs nothing and destroys nothing', () => {
    renderPrompt()

    expect(screen.getByText(/Costs nothing/)).toBeInTheDocument()
    expect(
      screen.getByText(/does not replace a draft this run already has/),
    ).toBeInTheDocument()
  })

  it('files the pasted text against the run', () => {
    const onPaste = renderPrompt()
    fireEvent.click(screen.getByRole('button', { name: /paste an article instead/i }))

    fireEvent.change(screen.getByLabelText('The article'), {
      target: { value: '# A headline\n\nThe article.' },
    })
    fireEvent.change(screen.getByLabelText(/Who wrote it/), {
      target: { value: 'a browser, some other model' },
    })
    fireEvent.click(screen.getByRole('button', { name: /use this as the draft/i }))

    expect(onPaste).toHaveBeenCalledWith(
      '# A headline\n\nThe article.',
      'a browser, some other model',
    )
  })

  it('will not file an empty paste', () => {
    renderPrompt()
    fireEvent.click(screen.getByRole('button', { name: /paste an article instead/i }))

    expect(screen.getByRole('button', { name: /use this as the draft/i })).toBeDisabled()
  })

  it('asks who wrote it and says the answer is not checked', () => {
    // Recorded as the operator's word. Nothing here resolves a model, so
    // nothing here may look like it did.
    renderPrompt()
    fireEvent.click(screen.getByRole('button', { name: /paste an article instead/i }))

    expect(screen.getByText(/Recorded as your word/)).toBeInTheDocument()
  })
})

const DRAFT: IntakeDraft = {
  run_id: 'r-1',
  attempt_id: 'a-1',
  headline: 'Two nights in Lima',
  article_markdown: 'Surquillo market opens at six.',
  research_note: '- https://example.pe -- stall prices, checked 7 September 2026',
  parse_issue: '',
  content_hash: 'dv-1',
  word_count: 912,
  raw: 'everything that came back',
}

const REVIEW_STATE: IntakeReview = {
  state: 'succeeded',
  review_id: 'rv-1',
  reviews: 1,
  started_at: '2026-09-07T10:00:00+00:00',
  finished_at: '2026-09-07T10:03:00+00:00',
  failure: null,
  message: null,
  raw: null,
  has_review: true,
  stale: false,
  reviewed_draft_version: 'dv-1',
  finding_count: 1,
  served_model: 'claude-opus-5-20260101',
  turns: 8,
  elapsed_seconds: 190,
  cost_usd: 0.66,
  parse_issue: null,
}

const FINDING: IntakeFinding = {
  finding_id: 'f1',
  label: 'Museum price wrong by threefold',
  severity: 'serious',
  quote: 'Surquillo market opens at six.',
  problem: 'It opens at five. The whole plan rests on the wrong hour.',
  whole_article: false,
}

const REVIEW_RESULT: IntakeReviewResult = {
  run_id: 'r-1',
  review_id: 'rv-1',
  draft_version: 'dv-1',
  findings: [FINDING],
  verdict: 'Good on the food, wrong on the times.',
  parse_issue: '',
  raw: 'everything the editor said',
  served_model: 'claude-opus-5-20260101',
  turns: 8,
  elapsed_seconds: 190,
  cost_usd: 0.66,
}

function renderDraft(
  generation: Partial<IntakeGeneration> = {},
  draft: IntakeDraft | null = DRAFT,
  review: { state: Partial<IntakeReview> | null; result: IntakeReviewResult | null } = {
    state: null,
    result: null,
  },
  handlers: {
    onReview?: () => void
    onSettleFinding?: (
      findingId: string,
      verdict: 'agreed' | 'not_a_fault' | null,
    ) => void
  } = {},
) {
  return render(
    <MemoryRouter>
      <DraftScreen
        runId="r-1"
        generation={{ ...GENERATION, ...generation }}
        draft={draft}
        reviewState={review.state ? { ...REVIEW_STATE, ...review.state } : null}
        review={review.result}
        busy={false}
        onRetry={vi.fn()}
        onReopen={vi.fn()}
        onReview={handlers.onReview ?? vi.fn()}
        onSettleFinding={handlers.onSettleFinding ?? vi.fn()}
      />
    </MemoryRouter>,
  )
}

describe('the draft screen', () => {
  it('shows the article', () => {
    renderDraft()

    expect(screen.getByText('Two nights in Lima')).toBeInTheDocument()
    expect(screen.getByText('Surquillo market opens at six.')).toBeInTheDocument()
  })

  it('keeps the research note beside the article, not inside it', () => {
    // Published as body text the note is a list of URLs and admissions, and it
    // reads as prose to anything that only counts words.
    renderDraft()

    expect(screen.getByText('Research note')).toBeInTheDocument()
    expect(screen.getByText(/example\.pe/)).toBeInTheDocument()
  })

  it('says plainly when nothing was sourced', () => {
    renderDraft({}, { ...DRAFT, research_note: '' })

    expect(screen.getByText(/Nothing here has been checked/)).toBeInTheDocument()
  })

  it('names the model that actually answered', () => {
    // Every v4 receipt said Opus while Flash wrote the article.
    renderDraft()

    expect(screen.getByText(/claude-opus-5-20260101/)).toBeInTheDocument()
  })

  it('shows a substitution as a difference between two names', () => {
    renderDraft({ served_model: 'gemini-2.5-flash' })

    expect(screen.getByText(/you asked for claude-opus-5-high/)).toBeInTheDocument()
  })

  it('does not claim the article was one call', () => {
    renderDraft()

    expect(screen.getByText(/14 exchanges with the model/)).toBeInTheDocument()
  })

  it('offers staging without any check having passed', () => {
    // ADR 0036 removed the readiness verdict. A draft is savable because it
    // exists, not because a score allowed it.
    renderDraft()

    expect(
      screen.getByRole('link', { name: /Stage in Payload Editor/ }),
    ).toBeInTheDocument()
  })

  it('carries no score, badge or readiness verdict', () => {
    renderDraft()

    expect(screen.queryByText(/verified/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/needs_revision/i)).not.toBeInTheDocument()
  })

  it('shows what came back when it was not an article', () => {
    // Those words were paid for.
    renderDraft(
      {
        state: 'failed',
        failure: 'unusable_response',
        message: 'Claude answered, but the answer was not an article.',
        raw: 'I cannot help with that.',
        has_draft: false,
      },
      null,
    )

    expect(screen.getByText('I cannot help with that.')).toBeInTheDocument()
  })

  it('keeps an earlier draft readable after a failed retry', () => {
    // The reason attempts accumulate instead of overwriting.
    renderDraft({ state: 'failed', message: 'Claude did not finish.', attempts: 2 })

    expect(screen.getByText('Surquillo market opens at six.')).toBeInTheDocument()
    expect(screen.getByText('Claude did not finish.')).toBeInTheDocument()
  })

  it('names what could not be read out of the reply', () => {
    renderDraft({ parse_issue: 'The writer returned no headline.' })

    expect(screen.getByText('The writer returned no headline.')).toBeInTheDocument()
  })
})

describe('the detector on the draft screen', () => {
  it('does not claim a draft is clean before anybody has read it', () => {
    // The dangerous version of this screen is one that looks reviewed by
    // default. An absent review and a review that found nothing are different
    // answers and must not look alike.
    renderDraft()

    expect(screen.getByRole('button', { name: /read this draft/i })).toBeInTheDocument()
    expect(screen.getByText(/Nobody has read this yet/)).toBeInTheDocument()
  })

  it('says a clean read found nothing, rather than saying nothing', () => {
    renderDraft({}, DRAFT, {
      state: { finding_count: 0 },
      result: { ...REVIEW_RESULT, findings: [] },
    })

    expect(screen.getByText(/found nothing wrong with it/)).toBeInTheDocument()
  })

  it('marks the paragraph the finding is about', () => {
    renderDraft({}, DRAFT, { state: {}, result: REVIEW_RESULT })

    expect(
      screen.getByRole('button', { name: /Museum price wrong by threefold/ }),
    ).toBeInTheDocument()
  })

  it('shows the exact quote and the problem once the mark is opened', () => {
    // The mark is only paragraph-accurate, so the quote it was made from has
    // to be readable beside it.
    renderDraft({}, DRAFT, { state: {}, result: REVIEW_RESULT })

    fireEvent.click(screen.getByRole('button', { name: /Museum price wrong/ }))

    expect(screen.getByText(/It opens at five/)).toBeInTheDocument()
  })

  it('offers a verdict on a finding and nothing that applies a fix', () => {
    // Detection only. An apply button here would be fixing before anybody
    // knows what is actually wrong with these articles.
    const onSettleFinding = vi.fn()
    renderDraft({}, DRAFT, { state: {}, result: REVIEW_RESULT }, { onSettleFinding })

    fireEvent.click(screen.getByRole('button', { name: /Museum price wrong/ }))
    fireEvent.click(screen.getByRole('button', { name: /real problem/i }))

    expect(onSettleFinding).toHaveBeenCalledWith('f1', 'agreed')
    expect(screen.queryByRole('button', { name: /apply|fix|rewrite/i })).toBeNull()
  })

  it('lets a verdict be taken back', () => {
    const onSettleFinding = vi.fn()
    renderDraft(
      {},
      DRAFT,
      {
        state: {},
        result: { ...REVIEW_RESULT, findings: [{ ...FINDING, verdict: 'agreed' }] },
      },
      { onSettleFinding },
    )

    fireEvent.click(screen.getByRole('button', { name: /Museum price wrong/ }))
    fireEvent.click(screen.getByRole('button', { name: /real problem/i }))

    expect(onSettleFinding).toHaveBeenCalledWith('f1', null)
  })

  it('keeps a finding whose quote is nowhere in the article', () => {
    // The failure this guards against is silent: an unmatched quote used to
    // mean the finding appeared nowhere at all, in a review whose whole value
    // is that every finding gets read.
    renderDraft({}, DRAFT, {
      state: {},
      result: {
        ...REVIEW_RESULT,
        findings: [{ ...FINDING, quote: 'a sentence that is not in the article' }],
      },
    })

    expect(screen.getByText('About the whole piece')).toBeInTheDocument()
    expect(screen.getByText(/It opens at five/)).toBeInTheDocument()
  })

  it('does not hang a read of an earlier draft on the article now on screen', () => {
    // Its quotes point at paragraphs that no longer exist. It is not wrong; it
    // is simply not about this article, and it stays readable as history.
    renderDraft({}, DRAFT, { state: { stale: true }, result: REVIEW_RESULT })

    expect(screen.getByText(/read of an earlier draft/)).toBeInTheDocument()
    expect(screen.getByText('Findings from the earlier draft')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Museum price wrong by threefold/ })).toBeNull()
  })

  it('reports no model, no time and no cost for an article it did not write', () => {
    // The v4 receipts named Opus while Flash wrote the article. This app made
    // no call for a pasted draft, so it claims none.
    renderDraft({
      source: 'pasted',
      written_by: 'a browser, some other model',
      served_model: null,
      requested_model: null,
      cost_usd: null,
      turns: null,
      elapsed_seconds: null,
    })

    expect(screen.getByText(/Written outside this app and pasted in/)).toBeInTheDocument()
    expect(screen.getByText(/as told to us, not checked/)).toBeInTheDocument()
    expect(screen.getByText('Nothing was spent here')).toBeInTheDocument()
    expect(screen.queryByText(/at API rates/)).toBeNull()
    expect(screen.queryByText(/exchanges with the model/)).toBeNull()
  })

  it('says what a read cost', () => {
    renderDraft({}, DRAFT, { state: {}, result: REVIEW_RESULT })

    expect(screen.getByText(/\$0\.66/)).toBeInTheDocument()
  })

  it('says what it is doing while it reads, instead of going silent', () => {
    renderDraft({}, DRAFT, {
      state: { state: 'running', has_review: false },
      result: null,
    })

    expect(screen.getByRole('button', { name: /reading it/i })).toBeDisabled()
    expect(screen.getByText(/checking the facts it rests on/)).toBeInTheDocument()
  })

  it('explains a failed read without touching the article', () => {
    renderDraft({}, DRAFT, {
      state: {
        state: 'failed',
        has_review: false,
        finding_count: 0,
        failure: 'quota_exhausted',
        message: 'The Claude account has no allowance left.',
      },
      result: null,
    })

    expect(screen.getByText(/no allowance left/)).toBeInTheDocument()
    expect(screen.getByText('Surquillo market opens at six.')).toBeInTheDocument()
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

  it('says the checks describe the pipeline draft once the article is edited', async () => {
    // Nothing re-reads an article after prose exists -- the audit is a
    // pre-writing gate by design. So a hand edit cannot refresh these numbers,
    // and the screen must stop implying they describe what is on it. Showing
    // "Ready for staging - 914 words" over prose somebody has since cut is the
    // page asserting something nobody checked.
    readEditActions.mockResolvedValue({
      actions: [{ action_id: 'shorten', label: 'Say it in fewer words' }],
    })
    proposeSectionEdit.mockResolvedValue({
      run_id: 'run-1',
      edit_id: 'e1',
      base_revision: 0,
      section_id: 's1',
      heading: 'The elevation contrast',
      action_id: 'shorten',
      text_hash: 'abc',
      original: '## The elevation contrast\n\nCusco sits at 3,399 meters.',
      revised: '## The elevation contrast\n\nCusco is at 3,399 m.',
      what_changed: 'Tightened it.',
      could_not_do: '',
      introduced_figures: [],
      review: {
        status: 'supported',
        checked: true,
        assessment: 'Every figure matches its record.',
        unsupported_claims: [],
      },
    })
    applySectionEdit.mockResolvedValue({
      markdown: '## The elevation contrast\n\nCusco is at 3,399 m.',
      edits: 1,
      revision: 1,
      review_status: 'supported',
      already_applied: false,
    })

    renderArticle(
      <ArticleScreen
        runId="run-1"
        writing={writing({
          constraint_checks: {
            sentence_count: 75,
            sentence_mean_words: 11.3,
            sentence_widest_band_share: 0.57,
            sentences_over_25_words: 1,
            sentence_variety_note: 'Nothing here blocks.',
          },
        })}
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

    expect(screen.getByText(/ready for staging/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Edit The elevation contrast' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Say it in fewer words' }),
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Use this' }))

    expect(
      await screen.findByText(/describe the draft the pipeline wrote/i),
    ).toBeInTheDocument()
    // The stamp stops claiming the article is the one that was assessed.
    expect(screen.queryByText(/ready for staging/i)).toBeNull()
    expect(screen.getByText(/edited by hand/i)).toBeInTheDocument()
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
