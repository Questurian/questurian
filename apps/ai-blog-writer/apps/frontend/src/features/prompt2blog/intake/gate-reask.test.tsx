import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GateQuestion } from './intake.types'

/**
 * Asking a research question again, at the gate.
 *
 * Run 76b36468 asked for a community-led project "in Buenos Aires" and
 * research answered about a garden collective in Argentina — the article is
 * about Medellín, whose Buenos Aires is the neighbourhood the Ayacucho tram
 * runs through. The question was fine; the answer was about the wrong
 * continent, and it came back marked supported so nothing downstream caught it.
 *
 * Before this the operator could only drop a good question or research it
 * themselves.
 */

const readGate = vi.fn()
const reaskQuestion = vi.fn()
const settleGate = vi.fn()
vi.mock('./intake.api', () => ({
  readGate: (...args: unknown[]) => readGate(...args),
  reaskQuestion: (...args: unknown[]) => reaskQuestion(...args),
  settleGate: (...args: unknown[]) => settleGate(...args),
}))

const { GateScreen } = await import('./components/GateScreen')

const QUESTION: GateQuestion = {
  requirement_id: 'q6',
  question: 'What community-led project offers guided visits in Buenos Aires?',
  kind: 'load_bearing',
  status: 'supported',
  gap: '',
  found: ['A garden collective in Puerto Madero, Argentina.'],
}

beforeEach(() => {
  readGate.mockReset()
  reaskQuestion.mockReset()
  settleGate.mockReset()
  readGate.mockResolvedValue({ blocking: [QUESTION] })
  reaskQuestion.mockResolvedValue({})
})

async function openReask(): Promise<void> {
  render(<GateScreen runId="run-1" onSettled={vi.fn()} onReopen={vi.fn()} busy={false} />)
  fireEvent.click(await screen.findByText(/ask it differently/i))
}

describe('asking a research question again', () => {
  it('offers it beside the other moves', async () => {
    render(
      <GateScreen runId="run-1" onSettled={vi.fn()} onReopen={vi.fn()} busy={false} />,
    )

    expect(await screen.findByText(/ask it differently/i)).toBeInTheDocument()
    expect(screen.getByText(/drop the question/i)).toBeInTheDocument()
  })

  it('starts from the wording that is already there, so it is edited not retyped', async () => {
    await openReask()

    expect(await screen.findByDisplayValue(QUESTION.question)).toBeInTheDocument()
  })

  it('says what it costs before the operator presses it', async () => {
    // The only move at this gate that spends anything.
    await openReask()

    expect(await screen.findByText(/buys one new search/i)).toBeInTheDocument()
    expect(screen.getByText(/keeps the answer it already has/i)).toBeInTheDocument()
  })

  it('refuses to send the same question back unchanged', async () => {
    await openReask()

    expect(await screen.findByText(/ask it again/i)).toBeDisabled()
  })

  it('sends the rewritten question', async () => {
    const onSettled = vi.fn()
    render(
      <GateScreen runId="run-1" onSettled={onSettled} onReopen={vi.fn()} busy={false} />,
    )
    fireEvent.click(await screen.findByText(/ask it differently/i))

    const field = await screen.findByDisplayValue(QUESTION.question)
    fireEvent.change(field, {
      target: { value: 'What community-led project offers guided visits in Medellin?' },
    })
    await act(async () => {
      fireEvent.click(screen.getByText(/ask it again/i))
    })

    expect(reaskQuestion).toHaveBeenCalledWith('run-1', {
      requirement_id: 'q6',
      question: 'What community-led project offers guided visits in Medellin?',
    })
    await waitFor(() => expect(onSettled).toHaveBeenCalled())
  })

  it('keeps the operator on the question when the search fails', async () => {
    reaskQuestion.mockRejectedValueOnce(new Error('The search did not come back.'))
    await openReask()

    const field = await screen.findByDisplayValue(QUESTION.question)
    fireEvent.change(field, { target: { value: 'Something else entirely?' } })
    await act(async () => {
      fireEvent.click(screen.getByText(/ask it again/i))
    })

    expect(await screen.findByText(/did not come back/i)).toBeInTheDocument()
    // Still editable, rather than stuck saying "Searching".
    expect(screen.getByText(/ask it again/i)).not.toBeDisabled()
  })
})
