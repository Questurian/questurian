import { useEffect } from 'react'

import type { LocationHomepageListItem } from '../locationHomepages'
import { getLocationHomepageLabel } from '../locationHomepageList.utils'

type DeleteLocationHomepageModalProps = {
  item: LocationHomepageListItem
  onConfirm: () => void
  onCancel: () => void
  isDeleting: boolean
  error: string | null
}

export function DeleteLocationHomepageModal({
  item,
  onConfirm,
  onCancel,
  isDeleting,
  error,
}: DeleteLocationHomepageModalProps) {
  const label = getLocationHomepageLabel(item)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isDeleting) onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel, isDeleting])

  return (
    <div className="hf-modal-backdrop" onClick={!isDeleting ? onCancel : undefined}>
      <div
        className="hf-modal hf-delete-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hf-delete-title"
      >
        <div className="hf-delete-modal-body">
          <div className="hf-delete-modal-icon">⚠</div>
          <h3 id="hf-delete-title">Delete location homepage?</h3>
          <p>
            You're about to permanently delete the homepage for{' '}
            <strong>{label}</strong>. This will remove all associated content
            blocks and cannot be undone.
          </p>
          {error && <p className="hf-modal-error">{error}</p>}
        </div>
        <div className="hf-delete-modal-actions">
          <button
            type="button"
            className="hf-btn-ghost"
            onClick={onCancel}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="hf-btn-primary hf-btn-danger"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting…' : 'Delete homepage'}
          </button>
        </div>
      </div>
    </div>
  )
}
