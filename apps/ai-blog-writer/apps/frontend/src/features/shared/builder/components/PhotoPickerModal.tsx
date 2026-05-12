import { useEffect, useState } from 'react'
import type { GalleryImageObject } from '../types'
import { resolveImageUrl } from '../utils/item-media.utils'

const MAX_PHOTOS = 6

type Props = {
  isOpen: boolean
  photoObjects: GalleryImageObject[]
  selectedPhotoIds: number[]
  onConfirm: (ids: number[]) => void
  onClose: () => void
}

export function PhotoPickerModal({ isOpen, photoObjects, selectedPhotoIds, onConfirm, onClose }: Props) {
  const [localSelection, setLocalSelection] = useState<number[]>([])

  useEffect(() => {
    if (isOpen) {
      setLocalSelection([...selectedPhotoIds])
    }
  }, [isOpen]) // intentionally omitting selectedPhotoIds — reset only on open

  useEffect(() => {
    if (!isOpen) return
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  function handleOverlayClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose()
  }

  function togglePhoto(id: number) {
    setLocalSelection((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id)
      }
      if (prev.length >= MAX_PHOTOS) return prev
      return [...prev, id]
    })
  }

  function handleConfirm() {
    onConfirm(localSelection)
    onClose()
  }

  const atLimit = localSelection.length >= MAX_PHOTOS

  return (
    <div className="stl-modal-overlay" onClick={handleOverlayClick}>
      <div
        className="stl-picker-modal stl-picker-modal--photos"
        role="dialog"
        aria-modal="true"
        aria-label="Select photos"
      >
        <div className="stl-picker-modal__header">
          <h3>Select Photos</h3>
          <button type="button" className="stl-picker-modal__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {atLimit && (
          <p className="stl-picker-limit-note">Maximum {MAX_PHOTOS} photos selected</p>
        )}

        <div className="stl-picker-grid stl-picker-grid--photos">
          {photoObjects.length === 0 && (
            <p className="stl-picker-empty">No gallery photos available for this item.</p>
          )}

          {photoObjects.map((photo) => {
            const thumbUrl = resolveImageUrl(photo)
            const selectionIndex = localSelection.indexOf(photo.id)
            const isSelected = selectionIndex !== -1
            const isDisabled = atLimit && !isSelected

            return (
              <button
                key={photo.id}
                type="button"
                className={[
                  'stl-picker-card',
                  isSelected ? 'stl-picker-card--selected' : '',
                  isDisabled ? 'stl-picker-card--disabled' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => !isDisabled && togglePhoto(photo.id)}
                disabled={isDisabled}
              >
                {thumbUrl ? (
                  <img
                    src={thumbUrl}
                    alt={photo.alt_text ?? `Photo ${photo.id}`}
                    className="stl-picker-card__thumb stl-picker-card__thumb--photo"
                    loading="lazy"
                  />
                ) : (
                  <div className="stl-picker-card__thumb--empty stl-picker-card__thumb--photo">🖼</div>
                )}
                {isSelected && (
                  <span className="stl-picker-card__badge">{selectionIndex + 1}</span>
                )}
              </button>
            )
          })}
        </div>

        <div className="stl-picker-modal__footer">
          <button type="button" className="stl-btn stl-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="stl-btn stl-btn-success" onClick={handleConfirm}>
            Confirm ({localSelection.length}/{MAX_PHOTOS})
          </button>
        </div>
      </div>
    </div>
  )
}
