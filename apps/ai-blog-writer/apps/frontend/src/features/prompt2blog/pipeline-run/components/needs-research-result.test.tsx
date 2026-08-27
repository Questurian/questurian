/* @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Prompt2BlogV3NeedsResearchResponse } from '../../api'
import { NeedsResearchResult } from './NeedsResearchResult'

afterEach(cleanup)

const result: Prompt2BlogV3NeedsResearchResponse = {
  status: 'needs_research',
  commission_fingerprint: 'abc',
  findings: [
    {
      code: 'requirement_gap',
      requirement_ids: ['r2'],
      message: 'No evidence covers the livability tradeoffs.',
    },
    {
      code: 'source_gate',
      requirement_ids: [],
      message: 'The interview-qa form still needs attributable-responses.',
    },
  ],
  unresolved_requirements: [
    {
      requirement_id: 'r2',
      question: 'Which quality-of-life tradeoffs change the value judgment?',
      gap: 'Nothing current was found.',
    },
  ],
  unresolved_conflict_ids: ['k1'],
  missing_source_requirements: ['attributable-responses'],
  follow_up_research_prompt: 'Close r2 without changing the commission.',
}

describe('NeedsResearchResult', () => {
  it('states plainly that nothing ran or was charged', () => {
    render(
      <NeedsResearchResult result={result} onBackToResearch={() => {}} onDismiss={() => {}} />,
    )

    expect(screen.getByText(
      'Not ready yet — 1 question still needs an answer. Nothing ran and nothing was charged.',
    )).toBeInTheDocument()
  })

  it('shows what was already established as unpublished so it is not chased again', () => {
    render(
      <NeedsResearchResult
        result={{
          ...result,
          unpublished_requirements: [
            {
              requirement_id: 'r3',
              question: 'How long does customs take?',
              gap: 'Checked the regulator and the operator. Neither measures it.',
            },
          ],
        }}
        onBackToResearch={() => {}}
        onDismiss={() => {}}
      />,
    )

    expect(
      screen.getByText('No published answer exists — already checked'),
    ).toBeInTheDocument()
    expect(screen.getAllByText(/Question 3: How long does customs take\?/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Neither measures it/)).toBeTruthy()
  })

  it('leaves the unpublished list out entirely when there is none', () => {
    render(
      <NeedsResearchResult result={result} onBackToResearch={() => {}} onDismiss={() => {}} />,
    )

    expect(screen.queryByText(/already checked/)).not.toBeInTheDocument()
  })

  it('lists every reason the gate stopped the run', () => {
    render(
      <NeedsResearchResult result={result} onBackToResearch={() => {}} onDismiss={() => {}} />,
    )

    expect(screen.getByText(/No evidence covers the livability tradeoffs/)).toBeTruthy()
    expect(screen.getByText('Still unanswered')).toBeTruthy()
    expect(
      screen.getAllByText(/Question 2: Which quality-of-life tradeoffs change the value judgment\?/)
        .length,
    ).toBeGreaterThan(0)
    expect(screen.getAllByText(/This kind of article needs a first-hand source/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Two sources disagree/)).toBeTruthy()
    expect(screen.queryByText(/attributable-responses/)).toBeNull()
    expect(screen.queryByText(/Unresolved conflicts: k1/)).toBeNull()
    expect(screen.queryByText('requirement_gap')).toBeNull()
    expect(screen.queryByText('source_gate')).toBeNull()
  })

  it('offers the follow-up prompt and a route back into research', () => {
    const onBackToResearch = vi.fn()
    render(
      <NeedsResearchResult
        result={result}
        onBackToResearch={onBackToResearch}
        onDismiss={() => {}}
      />,
    )

    expect(screen.getByLabelText('Follow-up research prompt')).toHaveValue(
      'Close r2 without changing the commission.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Back to research' }))
    expect(onBackToResearch).toHaveBeenCalledOnce()
  })

  it('offers no retry of the same run, because the same run would stop again', () => {
    render(
      <NeedsResearchResult result={result} onBackToResearch={() => {}} onDismiss={() => {}} />,
    )

    expect(screen.queryByRole('button', { name: /Retry|Run again/ })).toBeNull()
  })
})

describe('NeedsResearchResult, when the premise itself was refuted', () => {
  const refuted: Prompt2BlogV3NeedsResearchResponse = {
    ...result,
    requires_new_direction: true,
    findings: [
      {
        code: 'premise_refuted',
        requirement_ids: ['r1', 'r2', 'r3', 'r4', 'r5'],
        message:
          "The 2026 Latin America's 50 Best Restaurants list has been published — that is not so. The organizers schedule the reveal for 1 December 2026.",
      },
    ],
    unresolved_requirements: [],
    refuted_premise: [
      {
        assumption_id: 'a1',
        statement:
          "The 2026 Latin America's 50 Best Restaurants list has been published.",
        basis: 'The organizers schedule the reveal for 1 December 2026.',
        requirement_ids: ['r1', 'r2', 'r3', 'r4', 'r5'],
      },
    ],
  }

  it('leads with the false premise and says how much of the article rested on it', () => {
    render(
      <NeedsResearchResult
        result={refuted}
        onBackToResearch={() => {}}
        onBackToDirection={() => {}}
        onDismiss={() => {}}
      />,
    )

    expect(
      screen.getByText('This article is built on something that is not true'),
    ).toBeInTheDocument()
    expect(screen.getByText(/This is what 5 questions rested on/)).toBeTruthy()
    expect(screen.getByText(/More research will not change this/)).toBeTruthy()
  })

  it('offers a different direction instead of another research round', () => {
    const onBackToDirection = vi.fn()
    const onBackToResearch = vi.fn()
    render(
      <NeedsResearchResult
        result={refuted}
        onBackToResearch={onBackToResearch}
        onBackToDirection={onBackToDirection}
        onDismiss={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Choose a different direction' }))

    expect(onBackToDirection).toHaveBeenCalledOnce()
    expect(onBackToResearch).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Back to research' })).not.toBeInTheDocument()
  })

  it('hides the follow-up research prompt that cannot help', () => {
    // Offering it here is what made the dead end feel like a loop: research,
    // get the same refutation, research again.
    render(
      <NeedsResearchResult
        result={refuted}
        onBackToResearch={() => {}}
        onBackToDirection={() => {}}
        onDismiss={() => {}}
      />,
    )

    expect(screen.queryByLabelText('Follow-up research prompt')).not.toBeInTheDocument()
  })

  it('keeps the research route for a premise that merely could not be checked', () => {
    render(
      <NeedsResearchResult
        result={{
          ...result,
          unverified_premise: [
            {
              assumption_id: 'a1',
              statement: 'The airport published a 2026 passenger figure.',
              basis: 'The operator site was unreachable on three attempts.',
              requirement_ids: ['r2'],
            },
          ],
        }}
        onBackToResearch={() => {}}
        onBackToDirection={() => {}}
        onDismiss={() => {}}
      />,
    )

    expect(screen.getByText('Could not be checked either way')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to research' })).toBeInTheDocument()
    expect(screen.getByLabelText('Follow-up research prompt')).toBeInTheDocument()
  })
})
