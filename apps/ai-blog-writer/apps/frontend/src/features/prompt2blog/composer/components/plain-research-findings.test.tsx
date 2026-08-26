/* @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PlainResearchFindings } from './PlainResearchFindings'

afterEach(cleanup)

const questions = [
  { requirement_id: 'r1', question: 'What do current costs show?' },
  { requirement_id: 'r2', question: 'Which tradeoffs change the value judgment?' },
]

describe('PlainResearchFindings', () => {
  it('reads one source-gate line, not the same sentence twice', () => {
    render(
      <PlainResearchFindings
        findings={[
          {
            code: 'source_gate',
            requirement_ids: [],
            message: 'The city-guide form still needs attributable-responses.',
          },
          {
            code: 'source_gate',
            requirement_ids: [],
            message: 'The city-guide form still needs on-the-ground-observation.',
          },
        ]}
        questions={questions}
      />
    )

    expect(
      screen.getAllByText('This kind of article needs a first-hand source')
    ).toHaveLength(1)
    expect(screen.queryByText(/attributable-responses/)).toBeNull()
  })

  it('drops the id-only gap message but keeps a real one', () => {
    render(
      <PlainResearchFindings
        findings={[
          {
            code: 'requirement_gap',
            requirement_ids: ['r1'],
            message: 'Requirement r1 is incomplete.',
          },
          {
            code: 'requirement_gap',
            requirement_ids: ['r2'],
            message: 'No evidence covers the livability tradeoffs.',
          },
        ]}
        questions={questions}
      />
    )

    expect(screen.getByText(/Question 1: What do current costs show\?$/)).toBeInTheDocument()
    expect(screen.queryByText(/Requirement r1 is incomplete/)).toBeNull()
    expect(
      screen.getByText(/No evidence covers the livability tradeoffs\./)
    ).toBeInTheDocument()
  })
})
