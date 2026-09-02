import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GateQuestion } from './intake.types'

/**
 * The gate saying which move fits, and the move it did not have.
 *
 * Run a2066506 (2026-09-01) blocked three times. Two of the three were
 * questions research had already answered: no Miraflores listing count is
 * published anywhere, and there is no 4-star hotel within five blocks of the
 * Plaza Mayor. The gate could record neither, and offered four buttons with no
 * indication which was right — so the operator read a dozen research bullets
 * to work out what the notes already said.
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

function question(overrides: Partial<GateQuestion> = {}): GateQuestion {
  return {
    requirement_id: 'q4',
    question: 'Three 4-star hotels within five blocks of the Plaza Mayor?',
    kind: 'load_bearing',
    status: 'partial',
    gap: 'No 4-star property was found in that radius.',
    found: [
      'Hotel Maury is 3-star, two blocks from the Plaza Mayor.',
      'The nearest 4-star is the Sheraton Lima Historic Center, 1.4 km away.',
    ],
    cause: 'does_not_exist',
    suggestion: {
      move: 'nonexistent',
      why: 'Research answered, and the answer was that the thing is not there.',
    },
    ...overrides,
  }
}

function show() {
  render(<GateScreen runId="run-1" onSettled={vi.fn()} onReopen={vi.fn()} busy={false} />)
}

beforeEach(() => {
  readGate.mockReset()
  reaskQuestion.mockReset()
  settleGate.mockReset()
  settleGate.mockResolvedValue({})
  readGate.mockResolvedValue({ blocking: [question()] })
})

describe('recording that the thing is not there', () => {
  it('offers the move at all, which is the whole issue', async () => {
    show()

    expect(await screen.findByText(/nothing like this exists/i)).toBeTruthy()
  })

  it('sends what research found instead, not an answer the operator invented', async () => {
    show()
    fireEvent.click(await screen.findByText(/nothing like this exists/i))

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Nearest 4-star is the Sheraton, 1.4 km away.' },
    })
    fireEvent.click(screen.getByText(/save and continue/i))

    await waitFor(() =>
      expect(settleGate).toHaveBeenCalledWith('run-1', {
        requirement_id: 'q4',
        nonexistent_note: 'Nearest 4-star is the Sheraton, 1.4 km away.',
      }),
    )
  })

  it('is not confused with nobody publishing it', async () => {
    show()
    fireEvent.click(await screen.findByText(/nothing like this exists/i))

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Not there.' } })
    fireEvent.click(screen.getByText(/save and continue/i))

    await waitFor(() => expect(settleGate).toHaveBeenCalled())
    expect(settleGate.mock.calls[0][1]).not.toHaveProperty('unpublished_note')
  })

  it('says the found claims are what let the article state the absence', async () => {
    show()
    fireEvent.click(await screen.findByText(/nothing like this exists/i))

    expect(screen.getByText(/state the absence rather than assert it/i)).toBeTruthy()
  })
})

describe('saying which move fits', () => {
  it('reads out the diagnosis instead of leaving it in the notes', async () => {
    show()

    expect(
      await screen.findByText(/the answer was that the thing is not there/i),
    ).toBeTruthy()
  })

  it('marks only the suggested move as the primary one', async () => {
    show()
    await screen.findByText(/nothing like this exists/i)

    const suggested = screen.getByText(/nothing like this exists/i)
    const other = screen.getByText(/nobody publishes this/i)
    expect(suggested.className).not.toContain('p2b-secondary')
    expect(other.className).toContain('p2b-secondary')
  })

  it('leaves every other move one click away, because it is a suggestion', async () => {
    show()
    await screen.findByText(/nothing like this exists/i)

    for (const label of [
      /i.ll answer this/i,
      /nobody publishes this/i,
      /ask it differently/i,
      /drop the question/i,
    ]) {
      expect(screen.getByText(label)).toBeTruthy()
    }
  })

  it('says nothing at all when research did not say why', async () => {
    // A run recorded before causes existed. Silence beats a confident guess.
    readGate.mockResolvedValue({
      blocking: [question({ cause: 'unknown', suggestion: null })],
    })
    show()
    await screen.findByText(/nothing like this exists/i)

    expect(screen.queryByText(/what this looks like/i)).toBeNull()
    // And with no suggestion, the answer move is primary as it always was.
    expect(screen.getByText(/i.ll answer this/i).className).not.toContain('p2b-secondary')
  })
})
