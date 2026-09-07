import { useEffect, useState } from 'react'
import {
  applySectionEdit,
  proposeSectionEdit,
  readEditActions,
  undoSectionEdit,
} from '../intake.api'
import type { SectionEditAction, SectionEditProposal } from '../intake.types'

/**
 * Ask for one improvement to one section, and read it before it lands.
 *
 * An editor can see that a paragraph hedges where it should choose, and until
 * now the options were to rewrite it by hand or re-run the whole article.
 * Repair is not that tool: it is driven by an audit, it fires once per run
 * inside a token budget, and it decides for itself what to change.
 *
 * Three properties this screen exists to hold.
 *
 * Nothing lands unread. The proposal is shown beside the original and applying
 * it is a second, separate press. A model call that produced something worse
 * costs the price of the call and nothing else.
 *
 * A refusal reads as an answer, not an error. Asking for a clearer
 * recommendation from evidence that supports no recommendation is a reasonable
 * thing to have asked and an unreasonable thing to be given, so
 * `could_not_do` is rendered as prominently as a revision would have been.
 *
 * And a figure that came from nowhere is called out above everything else. It
 * is the specific way this feature fails: an editor asks for a stronger
 * recommendation and a model supplies the number that would make one.
 */

interface SectionEditorProps {
  runId: string
  sectionId: string
  heading: string
  onApplied: (markdown: string) => void
  onClose: () => void
}

export function SectionEditor({
  runId,
  sectionId,
  heading,
  onApplied,
  onClose,
}: SectionEditorProps) {
  const [actions, setActions] = useState<SectionEditAction[]>([])
  const [proposal, setProposal] = useState<SectionEditProposal | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Why the editor wanted this, in their words. Optional, and never inferred:
  // one accepted edit is a correction, and only the person making it knows
  // whether they meant "this one was wrong" or "we always want this".
  const [reason, setReason] = useState('')

  useEffect(() => {
    let live = true
    readEditActions()
      .then(payload => live && setActions(payload.actions))
      .catch((failure: Error) => live && setError(failure.message))
    return () => {
      live = false
    }
  }, [])

  const ask = (actionId: string) => {
    setBusy(true)
    setError('')
    proposeSectionEdit(runId, { section_id: sectionId, action_id: actionId })
      .then(setProposal)
      .catch((failure: Error) => setError(failure.message))
      .finally(() => setBusy(false))
  }

  const keep = () => {
    if (!proposal) return
    setBusy(true)
    applySectionEdit(runId, proposal, reason)
      .then(result => {
        setProposal(null)
        setReason('')
        onApplied(result.markdown)
      })
      .catch((failure: Error) => setError(failure.message))
      .finally(() => setBusy(false))
  }

  return (
    <aside className="p2b-editor" aria-label={`Edit ${heading || 'the opening'}`}>
      <p className="p2b-eyebrow">{heading || 'The opening'}</p>

      {error && (
        <p className="p2b-blocked" role="status">
          {error}
        </p>
      )}

      {!proposal && (
        <div className="p2b-editor-actions">
          {actions.map(action => (
            <button
              key={action.action_id}
              type="button"
              className="p2b-secondary"
              disabled={busy}
              onClick={() => ask(action.action_id)}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {busy && !proposal && <p className="p2b-note">Drafting the change…</p>}

      {proposal && (
        <div className="p2b-editor-proposal">
          {/* Above everything, including the prose. A number the evidence never
              carried is the one thing here that must not be skimmed past. */}
          {proposal.introduced_figures.length > 0 && (
            <p className="p2b-editor-invented" role="status">
              This draft introduces {proposal.introduced_figures.join(', ')}, which
              is in neither the original nor the research. Do not keep it without
              checking where it came from.
            </p>
          )}

          {proposal.could_not_do && (
            /* A refusal is an answer. Rendered where a revision would have been,
               because an editor who asked for something the evidence cannot
               support needs to read that rather than hunt for it.

               It is also the end of this proposal. The server normalises a
               refused answer back to the original text, so there is nothing
               below to apply, and "Use this" is not offered. That is different
               from an introduced-figure warning, which is advisory: a person
               may look at a flagged number, decide they know where it came
               from, and keep the edit. Nobody can knowingly accept a change
               the model has just said it did not make. */
            <p className="p2b-editor-refused">{proposal.could_not_do}</p>
          )}

          {proposal.what_changed && (
            <p className="p2b-editor-summary">{proposal.what_changed}</p>
          )}

          <div className="p2b-editor-diff">
            <section aria-label="The section now">
              <p className="p2b-label">Now</p>
              <pre>{proposal.original}</pre>
            </section>
            <section aria-label="The proposed replacement">
              <p className="p2b-label">Proposed</p>
              <pre>{proposal.revised}</pre>
            </section>
          </div>

          {!proposal.could_not_do && (
          <label className="p2b-field">
            <span className="p2b-label">Why you wanted this (optional)</span>
            <input
              type="text"
              value={reason}
              disabled={busy}
              placeholder="e.g. it kept hedging instead of choosing"
              onChange={event => setReason(event.target.value)}
            />
          </label>
          )}

          <div className="p2b-intake-actions">
            {!proposal.could_not_do && (
              <button
                type="button"
                className="p2b-primary"
                disabled={
                  busy || proposal.revised.trim() === proposal.original.trim()
                }
                onClick={keep}
              >
                Use this
              </button>
            )}
            <button
              type="button"
              className="p2b-secondary"
              disabled={busy}
              onClick={() => setProposal(null)}
            >
              {proposal.could_not_do ? 'Ask for something else' : 'Keep what I had'}
            </button>
          </div>
        </div>
      )}

      <div className="p2b-intake-actions">
        <button
          type="button"
          className="p2b-secondary"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            undoSectionEdit(runId)
              .then(result => result.undone && onApplied(result.markdown))
              .catch((failure: Error) => setError(failure.message))
              .finally(() => setBusy(false))
          }}
        >
          Undo the last change
        </button>
        <button type="button" className="p2b-secondary" onClick={onClose}>
          Done
        </button>
      </div>
    </aside>
  )
}
