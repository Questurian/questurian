/* @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Prompt2BlogV3NeedsResearchResponse } from '../../api'
import { NeedsResearchResult } from './NeedsResearchResult'

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
  it('states plainly that nothing was queued and no article was written', () => {
    render(
      <NeedsResearchResult result={result} onBackToResearch={() => {}} onDismiss={() => {}} />,
    )

    expect(screen.getByRole('status').textContent).toMatch(/Nothing was queued/)
  })

  it('lists every reason the gate stopped the run', () => {
    render(
      <NeedsResearchResult result={result} onBackToResearch={() => {}} onDismiss={() => {}} />,
    )

    expect(screen.getByText(/No evidence covers the livability tradeoffs/)).toBeTruthy()
    expect(screen.getAllByText(/attributable-responses/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Which quality-of-life tradeoffs/)).toBeTruthy()
    expect(screen.getByText(/Unresolved conflicts: k1/)).toBeTruthy()
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
