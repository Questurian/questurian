import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SectionEditProposal } from './intake.types'

const readEditActions = vi.fn()
const proposeSectionEdit = vi.fn()
const applySectionEdit = vi.fn()
const undoSectionEdit = vi.fn()
vi.mock('./intake.api', () => ({
  readEditActions: (...a: unknown[]) => readEditActions(...a),
  proposeSectionEdit: (...a: unknown[]) => proposeSectionEdit(...a),
  applySectionEdit: (...a: unknown[]) => applySectionEdit(...a),
  undoSectionEdit: (...a: unknown[]) => undoSectionEdit(...a),
}))

const { SectionEditor } = await import('./components/SectionEditor')

/**
 * Asking for one change to one section.
 *
 * Three properties this screen exists to hold: nothing lands unread, a refusal
 * reads as an answer rather than an error, and a figure that came from nowhere
 * is called out above everything else.
 */

const ACTIONS = [
  { action_id: 'clarify_recommendation', label: 'Make the recommendation clearer' },
  { action_id: 'shorten', label: 'Say it in fewer words' },
]

function proposal(overrides: Partial<SectionEditProposal> = {}): SectionEditProposal {
  return {
    run_id: 'run-1',
    edit_id: 'edit-1',
    base_revision: 4,
    section_id: 's1',
    heading: 'Where to eat',
    action_id: 'clarify_recommendation',
    text_hash: 'abc123',
    original: '## Where to eat\n\nBoth are good.',
    revised: '## Where to eat\n\nGo to the stalls at $8.',
    what_changed: 'Named the choice instead of listing both.',
    could_not_do: '',
    introduced_figures: [],
    review: {
      status: 'supported',
      checked: true,
      assessment: 'Every figure matches the record it comes from.',
      unsupported_claims: [],
    },
    ...overrides,
  }
}

function open() {
  return render(
    <SectionEditor
      runId="run-1"
      sectionId="s1"
      heading="Where to eat"
      onApplied={() => {}}
      onClose={() => {}}
    />,
  )
}

beforeEach(() => {
  readEditActions.mockReset()
  proposeSectionEdit.mockReset()
  applySectionEdit.mockReset()
  undoSectionEdit.mockReset()
  readEditActions.mockResolvedValue({ actions: ACTIONS })
})

describe('nothing lands unread', () => {
  it('shows the proposal beside the original before anything is applied', async () => {
    proposeSectionEdit.mockResolvedValue(proposal())
    open()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Make the recommendation clearer' }),
    )

    await screen.findByLabelText('The proposed replacement')
    expect(screen.getByLabelText('The section now')).toHaveTextContent(
      'Both are good.',
    )
    // Proposing writes nothing. Applying is a second, separate press.
    expect(applySectionEdit).not.toHaveBeenCalled()
  })

  it('applies only when the editor says to', async () => {
    proposeSectionEdit.mockResolvedValue(proposal())
    applySectionEdit.mockResolvedValue({
      markdown: '# edited',
      edits: 1,
      revision: 5,
      review_status: 'supported',
      already_applied: false,
    })
    open()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Make the recommendation clearer' }),
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Use this' }))

    await waitFor(() => expect(applySectionEdit).toHaveBeenCalledTimes(1))
  })

  it('lets the editor keep what they had without losing the draft', async () => {
    proposeSectionEdit.mockResolvedValue(proposal())
    open()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Make the recommendation clearer' }),
    )
    await userEvent.click(
      await screen.findByRole('button', { name: 'Keep what I had' }),
    )

    // Back to the list of things to ask for, nothing written.
    expect(
      await screen.findByRole('button', { name: 'Say it in fewer words' }),
    ).toBeInTheDocument()
    expect(applySectionEdit).not.toHaveBeenCalled()
  })

  it('will not offer to apply a revision that changed nothing', async () => {
    proposeSectionEdit.mockResolvedValue(
      proposal({ revised: '## Where to eat\n\nBoth are good.' }),
    )
    open()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Make the recommendation clearer' }),
    )

    expect(await screen.findByRole('button', { name: 'Use this' })).toBeDisabled()
  })
})

describe('what it refuses to hide', () => {
  it('reads a refusal as an answer', async () => {
    // Asking for a clearer recommendation from evidence that supports none is a
    // reasonable thing to have asked and an unreasonable thing to be given.
    proposeSectionEdit.mockResolvedValue(
      proposal({
        revised: '## Where to eat\n\nBoth are good.',
        could_not_do: 'Nothing on the desk says which suits whom.',
      }),
    )
    open()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Make the recommendation clearer' }),
    )

    expect(
      await screen.findByText('Nothing on the desk says which suits whom.'),
    ).toBeInTheDocument()
  })

  it('does not offer to apply a refusal', async () => {
    // The server normalises a refused answer back to the original, so there is
    // nothing to apply. Offering "Use this" beside a refusal was how a model
    // saying "cannot support this" still got its changed text accepted.
    proposeSectionEdit.mockResolvedValue(
      proposal({
        revised: '## Where to eat\n\nBoth are good.',
        could_not_do: 'Nothing on the desk says which suits whom.',
      }),
    )
    open()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Make the recommendation clearer' }),
    )

    await screen.findByText('Nothing on the desk says which suits whom.')
    expect(screen.queryByRole('button', { name: 'Use this' })).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Ask for something else' }),
    ).toBeInTheDocument()
    expect(applySectionEdit).not.toHaveBeenCalled()
  })

  it('calls out a figure that came from nowhere', async () => {
    proposeSectionEdit.mockResolvedValue(
      proposal({ introduced_figures: ['12 minutes'] }),
    )
    open()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Make the recommendation clearer' }),
    )

    expect(
      await screen.findByText(/introduces 12 minutes, which is in neither/),
    ).toBeInTheDocument()
  })

  it('surfaces a stale-section refusal instead of silently doing nothing', async () => {
    proposeSectionEdit.mockResolvedValue(proposal())
    applySectionEdit.mockRejectedValue(
      new Error('That section has changed since this edit was proposed.'),
    )
    open()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Make the recommendation clearer' }),
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Use this' }))

    expect(
      await screen.findByText(/has changed since this edit was proposed/),
    ).toBeInTheDocument()
  })
})

describe('taking it back', () => {
  it('restores the draft when there is something to undo', async () => {
    const applied = vi.fn()
    undoSectionEdit.mockResolvedValue({
      markdown: '# original',
      edits: 0,
      undone: true,
      revision: 6,
    })
    render(
      <SectionEditor
        runId="run-1"
        sectionId="s1"
        heading="Where to eat"
        onApplied={applied}
        onClose={() => {}}
      />,
    )

    await userEvent.click(
      await screen.findByRole('button', { name: 'Undo the last change' }),
    )

    await waitFor(() => expect(applied).toHaveBeenCalledWith('# original'))
  })

  it('changes nothing when there is nothing to undo', async () => {
    const applied = vi.fn()
    undoSectionEdit.mockResolvedValue({
      markdown: '# original',
      edits: 0,
      undone: false,
      revision: 4,
    })
    render(
      <SectionEditor
        runId="run-1"
        sectionId="s1"
        heading="Where to eat"
        onApplied={applied}
        onClose={() => {}}
      />,
    )

    await userEvent.click(
      await screen.findByRole('button', { name: 'Undo the last change' }),
    )

    await waitFor(() => expect(undoSectionEdit).toHaveBeenCalled())
    expect(applied).not.toHaveBeenCalled()
  })
})


describe('what the checker found', () => {
  it('shows the findings and asks for a decision', async () => {
    // The figure warning compares sets of numbers, so a swap of two prices the
    // research already carries is invisible to it. This is the reading of what
    // the new text asserts.
    proposeSectionEdit.mockResolvedValue(
      proposal({
        revised: '## Where to eat\n\nThe stalls cost $40.',
        review: {
          status: 'unsupported',
          checked: true,
          assessment: 'The prices are attached to the wrong things.',
          unsupported_claims: [
            {
              claim: 'The stalls cost $40',
              reason: 'The record says the stalls cost $8.',
              severity: 'high',
            },
          ],
        },
      }),
    )
    open()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Make the recommendation clearer' }),
    )

    expect(
      await screen.findByText('The prices are attached to the wrong things.'),
    ).toBeInTheDocument()
    expect(screen.getByText('The stalls cost $40')).toBeInTheDocument()
    // A different press from the one on an edit that passed, and the server
    // records it as one.
    expect(
      screen.getByRole('button', { name: 'Use it anyway' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Use this' })).toBeNull()
  })

  it('does not show an unchecked edit as a checked one', async () => {
    proposeSectionEdit.mockResolvedValue(
      proposal({
        review: {
          status: 'unchecked',
          checked: false,
          assessment: 'Grounding could not be completed: the checker is down.',
          unsupported_claims: [],
        },
      }),
    )
    open()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Say it in fewer words' }),
    )

    expect(
      await screen.findByText(/has not been checked against the research/),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Use it anyway' }),
    ).toBeInTheDocument()
  })

  it('applies a passed edit without asking for an override', async () => {
    proposeSectionEdit.mockResolvedValue(proposal())
    applySectionEdit.mockResolvedValue({
      markdown: '# edited',
      edits: 1,
      revision: 5,
      review_status: 'supported',
      already_applied: false,
    })
    open()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Say it in fewer words' }),
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Use this' }))

    await waitFor(() =>
      expect(applySectionEdit).toHaveBeenCalledWith(
        'run-1',
        expect.anything(),
        '',
        false,
      ),
    )
  })
})
