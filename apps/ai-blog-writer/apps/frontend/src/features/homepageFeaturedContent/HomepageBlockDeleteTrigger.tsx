import { useEffect, useState } from 'react'

type Props = {
  blockId: string
  blockIndex: number
  blockLabel: string
  onDeleteBlock: (blockId: string) => void
  isDeletingBlock: boolean
  deleteError: string | null
}

export default function HomepageBlockDeleteTrigger({
  blockId,
  blockIndex,
  blockLabel,
  onDeleteBlock,
  isDeletingBlock,
  deleteError,
}: Props) {
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  useEffect(() => {
    if (!showDeleteModal) return undefined

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isDeletingBlock) {
        setShowDeleteModal(false)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [showDeleteModal, isDeletingBlock])

  return (
    <>
      <button
        type="button"
        className="hf-btn-ghost danger"
        onClick={() => setShowDeleteModal(true)}
        disabled={isDeletingBlock}
      >
        Delete block
      </button>

      {showDeleteModal && (
        <div
          className="hf-modal-backdrop"
          onClick={!isDeletingBlock ? () => setShowDeleteModal(false) : undefined}
        >
          <div
            className="hf-modal hf-delete-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`hf-delete-block-title-${blockId}`}
          >
            <div className="hf-delete-modal-body">
              <div className="hf-delete-modal-icon">⚠</div>
              <h3 id={`hf-delete-block-title-${blockId}`}>Delete this block?</h3>
              <p>
                This will permanently remove Block {blockIndex + 1} ({blockLabel}) and all of its
                curated slots. This action cannot be undone.
              </p>
              {deleteError && <p className="hf-modal-error">{deleteError}</p>}
            </div>
            <div className="hf-delete-modal-actions">
              <button
                type="button"
                className="hf-btn-ghost"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeletingBlock}
              >
                Cancel
              </button>
              <button
                type="button"
                className="hf-btn-primary hf-btn-danger"
                onClick={() => onDeleteBlock(blockId)}
                disabled={isDeletingBlock}
              >
                {isDeletingBlock ? 'Deleting…' : 'Delete block'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
