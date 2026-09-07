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
    section_id: 's1',
    heading: 'Where to eat',
    action_id: 'clarify_recommendation',
    text_hash: 'abc123',
    original: '## Where to eat\n\nBoth are good.',
    revised: '## Where to eat\n\nGo to the stalls at $8.',
    what_changed: 'Named the choice instead of listing both.',
    could_not_do: '',
    introduced_figures: [],
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
    applySectionEdit.mockResolvedValue({ markdown: '# edited', edits: 1 })
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
