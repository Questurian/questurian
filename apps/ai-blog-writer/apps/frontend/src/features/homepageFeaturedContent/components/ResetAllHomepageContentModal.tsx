import { useEffect } from 'react'

type ResetAllHomepageContentModalProps = {
  onConfirm: () => void
  onCancel: () => void
  isResetting: boolean
  error: string | null
}

export function ResetAllHomepageContentModal({
  onConfirm,
  onCancel,
  isResetting,
  error,
}: ResetAllHomepageContentModalProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isResetting) onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel, isResetting])

  return (
    <div className="hf-modal-backdrop" onClick={!isResetting ? onCancel : undefined}>
      <div
        className="hf-modal hf-delete-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hf-reset-all-title"
      >
        <div className="hf-delete-modal-body">
          <div className="hf-delete-modal-icon">!</div>
          <h3 id="hf-reset-all-title">Clear all homepage content?</h3>
          <p>
            This permanently removes every draft and published block from the main homepage and
            all location homepages. Location homepage records will remain, but they will be
            disabled. This cannot be undone.
          </p>
          {error && <p className="hf-modal-error">{error}</p>}
        </div>
        <div className="hf-delete-modal-actions">
          <button
            type="button"
            className="hf-btn-ghost"
            onClick={onCancel}
            disabled={isResetting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="hf-btn-primary hf-btn-danger"
            onClick={onConfirm}
            disabled={isResetting}
          >
            {isResetting ? 'Clearing...' : 'Clear all content'}
          </button>
        </div>
      </div>
    </div>
  )
}
