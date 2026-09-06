import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const readSelection = vi.fn()
const reviseSelection = vi.fn()
vi.mock('./intake.api', async importOriginal => ({
  ...(await importOriginal<typeof import('./intake.api')>()),
  readSelection: (...args: unknown[]) => readSelection(...args),
  reviseSelection: (...args: unknown[]) => reviseSelection(...args),
}))
import { FactPicker } from './components/FactPicker'
import type { SelectableClaim, SelectionReview } from './intake.types'

/**
 * What the picker owes the person using it (#534).
 *
 * The one thing it must never do is make the cut invisible. Run 9e66bf84's
 * article read like a database because 105 facts reached the writer and
 * nothing decided which of them it needed; a picker that hides what it left
 * out replaces one silent decision with another.
 */

function claim(overrides: Partial<SelectableClaim> = {}): SelectableClaim {
  return {
    claim_id: 'c1',
    text: 'A chifa plate runs about 25 soles in Barrio Chino.',
    rank: 1,
    selected: true,
    rescued: false,
    dropped: false,
    why: 'The reader cannot choose without a price.',
    questions: ['What does chifa cost?'],
    merged_in: [],
    confidence: 'high',
    ...overrides,
  }
}

function review(overrides: Partial<SelectionReview> = {}): SelectionReview {
  return {
    available: true,
    keep_count: 1,
    target_word_count: 900,
    deduped: true,
    ranked: true,
    note: '',
    claims: [
      claim(),
      claim({
        claim_id: 'c2',
        text: 'Chifa is widely considered Lima’s second cuisine.',
        rank: 2,
        selected: false,
        why: 'Restates the seed.',
      }),
    ],
    ...overrides,
  }
}

describe('the fact picker', () => {
  it('says how many facts the article keeps, out of how many there are', async () => {
    readSelection.mockResolvedValue(review())

    render(<FactPicker runId="run-1" onChanged={vi.fn()} />)

    expect(await screen.findByText(/1 of 2 findings/i)).toBeInTheDocument()
  })

  it('shows what is being left out when asked, rather than hiding it', async () => {
    // A cut nobody can see is the same silent decision, made by a model.
    readSelection.mockResolvedValue(review())

    render(<FactPicker runId="run-1" onChanged={vi.fn()} />)
    await screen.findByText(/1 of 2 findings/i)

    expect(screen.queryByTestId('fact-c2')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /show the 1 being left out/i }))

    expect(screen.getByTestId('fact-c2')).toBeInTheDocument()
  })

  it('moves the line', async () => {
    readSelection.mockResolvedValue(review())
    reviseSelection.mockResolvedValue(review({ keep_count: 2 }))
    const onChanged = vi.fn()

    render(<FactPicker runId="run-1" onChanged={onChanged} />)
    await screen.findByText(/1 of 2 findings/i)

    fireEvent.change(screen.getByLabelText(/how many findings to keep/i), {
      target: { value: '2' },
    })

    await waitFor(() =>
      expect(reviseSelection).toHaveBeenCalledWith('run-1', { keep_count: 2 }),
    )
    expect(onChanged).toHaveBeenCalled()
  })

  it('keeps one fact by hand without moving the line', async () => {
    readSelection.mockResolvedValue(review())
    reviseSelection.mockResolvedValue(review())

    render(<FactPicker runId="run-1" onChanged={vi.fn()} />)
    await screen.findByText(/1 of 2 findings/i)
    fireEvent.click(screen.getByRole('button', { name: /show the 1 being left out/i }))
    fireEvent.click(screen.getByRole('button', { name: /keep it anyway/i }))

    await waitFor(() =>
      expect(reviseSelection).toHaveBeenCalledWith('run-1', { rescue: 'c2' }),
    )
  })

  it('offers to undo a fact kept by hand, not to keep it twice', async () => {
    readSelection.mockResolvedValue(
      review({
        keep_count: 1,
        claims: [claim(), claim({ claim_id: 'c2', rank: 2, selected: true, rescued: true })],
      }),
    )

    render(<FactPicker runId="run-1" onChanged={vi.fn()} />)

    expect(await screen.findByRole('button', { name: /kept by hand/i })).toBeInTheDocument()
  })

  it('names the findings a survivor absorbed', async () => {
    readSelection.mockResolvedValue(
      review({
        claims: [claim({ merged_in: ['The same fact, differently worded.'] })],
        keep_count: 1,
      }),
    )

    render(<FactPicker runId="run-1" onChanged={vi.fn()} />)

    expect(
      await screen.findByText(/also said by 1 other finding/i),
    ).toBeInTheDocument()
  })

  it('says when a pass fell over, because then the order is not a ranking', async () => {
    readSelection.mockResolvedValue(
      review({ ranked: false, keep_count: 2, note: 'Ranking did not run.' }),
    )

    render(<FactPicker runId="run-1" onChanged={vi.fn()} />)

    expect(await screen.findByText('Ranking did not run.')).toBeInTheDocument()
  })

  it('renders nothing on a run that never selected', async () => {
    readSelection.mockResolvedValue({
      available: false,
      claims: [],
      keep_count: 0,
      note: '',
    })

    const { container } = render(<FactPicker runId="run-1" onChanged={vi.fn()} />)

    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('marks the rows that are there for colour', async () => {
    // Cutting one of these costs the piece something a price band cannot
    // replace, so the operator has to be able to see which they are.
    readSelection.mockResolvedValue(
      review({
        keep_count: 2,
        claims: [
          claim(),
          claim({
            claim_id: 'c2',
            rank: 2,
            selected: true,
            texture: true,
            text: 'The walls are covered in football flags; the owner is Argentine.',
          }),
        ],
      }),
    )

    render(<FactPicker runId="run-1" onChanged={vi.fn()} />)

    expect(await screen.findByText('colour')).toBeInTheDocument()
  })
})
