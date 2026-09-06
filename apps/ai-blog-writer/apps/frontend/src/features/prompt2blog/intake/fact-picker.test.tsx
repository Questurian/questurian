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
    fireEvent.click(screen.getByRole('button', { name: /show the 1 in reserve/i }))

    expect(screen.getByTestId('fact-c2')).toBeInTheDocument()
    // Named, and named as reserve rather than as a hole. Every stage after
    // the writer now draws that distinction; the screen has to draw it too.
    expect(screen.getByText('In reserve')).toBeInTheDocument()
    expect(
      screen.getByText(/still answer whatever question they answered/i),
    ).toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('button', { name: /show the 1 in reserve/i }))
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

  it('says a run that never selected cannot be written, rather than nothing', async () => {
    // This used to render nothing, because a run with no selection wrote from
    // every fact research found. Writing refuses now — a ranking that fell
    // over and a person keeping everything looked identical from here — so an
    // empty screen would be the operator waiting for a hand-off that is never
    // coming.
    readSelection.mockResolvedValue({
      available: false,
      claims: [],
      keep_count: 0,
      note: '',
    })

    render(<FactPicker runId="run-1" onChanged={vi.fn()} />)

    expect(
      await screen.findByText(/cannot be written/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/The research is safe/i)).toBeInTheDocument()
  })

  it('warns when the choice no longer matches the research it was made from', async () => {
    // Somebody answered a question at the gate, or re-asked one. The facts on
    // screen were chosen against a dossier that has moved, and the hand-off
    // will refuse — so it is said here, while it can still be acted on.
    readSelection.mockResolvedValue(
      review({
        stale_reason:
          'The research has changed since these facts were chosen. Look at the list again before writing.',
      }),
    )

    render(<FactPicker runId="run-1" onChanged={vi.fn()} />)

    expect(
      await screen.findByText(/research has changed since these facts were chosen/i),
    ).toBeInTheDocument()
  })

  it('groups the kept facts by what each one is for', async () => {
    readSelection.mockResolvedValue(
      review({
        keep_count: 2,
        claims: [
          claim({ role: 'practical' }),
          claim({
            claim_id: 'c2',
            rank: 2,
            selected: true,
            role: 'backbone',
            text: 'Chifa is Lima’s second cuisine by number of restaurants.',
          }),
        ],
      }),
    )

    render(<FactPicker runId="run-1" onChanged={vi.fn()} />)

    expect(await screen.findByText('For this article')).toBeInTheDocument()
    expect(screen.getByText('What the piece argues from')).toBeInTheDocument()
    expect(screen.getByText('What the reader acts on')).toBeInTheDocument()
  })

  it('does not invent a grouping when nothing said what the facts are for', async () => {
    // Every selection made before roles existed carries none, and one
    // unlabelled group heading is not a grouping — it is the same words twice.
    readSelection.mockResolvedValue(review({ keep_count: 1 }))

    render(<FactPicker runId="run-1" onChanged={vi.fn()} />)

    expect(await screen.findByText('For this article')).toBeInTheDocument()
    expect(screen.queryByText('What the piece argues from')).not.toBeInTheDocument()
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
