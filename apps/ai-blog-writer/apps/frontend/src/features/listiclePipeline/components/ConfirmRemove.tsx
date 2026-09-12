import { useEffect, useRef } from 'react'
import type { ListicleCandidate } from '../types'

/**
 * "Are you sure?" before taking a place off the list by hand.
 *
 * Removing is reversible -- the place waits under Removed places with Put
 * back -- so this is not guarding against loss. It is a pause in the flow, at
 * the owner's request: a place removed for a personal reason is a judgement,
 * and a judgement gets one beat to be reconsidered. The obvious removals (not
 * a restaurant or bar, permanently closed) do not ask.
 */
export function ConfirmRemove({
  candidate,
  saving,
  onConfirm,
  onClose,
}: {
  candidate: ListicleCandidate
  saving: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const cancel = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancel.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="lp-modal-overlay"
      onClick={event => event.target === event.currentTarget && onClose()}
    >
      <div
        className="lp-modal lp-confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-label={`Remove ${candidate.name}?`}
      >
        <h3 className="lp-modal-title">Remove {candidate.name}?</h3>
        <p className="lp-confirm-body">
          It comes off the list and waits under Removed places at the bottom. You can
          put it back from there.
        </p>
        <div className="lp-actions lp-confirm-actions">
          <button ref={cancel} type="button" className="lp-secondary" onClick={onClose} disabled={saving}>
            Keep it
          </button>
          <button type="button" className="lp-danger" onClick={onConfirm} disabled={saving}>
            {saving ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  )
}
