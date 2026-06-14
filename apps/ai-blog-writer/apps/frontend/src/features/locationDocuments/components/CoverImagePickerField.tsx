import { useEffect, useMemo, useState } from 'react'
import { ImagePicker, type ImagePickerResult } from '../../../shared/images/picker'
import { fetchMediaSetLibrary } from '../api'
import type { MediaSetOption, RelationshipFieldDefinition } from '../types'
import { formatMediaSetLabel, resolveMediaSetPreviewUrl } from '../utils'

type CoverImagePickerFieldProps = {
  field: RelationshipFieldDefinition
  value: number | null
  token: string | null
  locationRef: number | null
  mediaSets: MediaSetOption[]
  onValueChange: (value: number | null) => void
}

/**
 * Location-document cover image field. Renders the unified {@link ImagePicker} in
 * media-set browse mode and persists a media-set id: a Payload selection emits the
 * set id; an upload/import emits the new set's id from the response (ADR 0020).
 */
export function CoverImagePickerField({
  field,
  value,
  token,
  locationRef,
  mediaSets,
  onValueChange,
}: CoverImagePickerFieldProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [selectedMediaSet, setSelectedMediaSet] = useState<MediaSetOption | null>(null)
  const [isLoadingSelected, setIsLoadingSelected] = useState(false)

  const selectedOption = useMemo(
    () => mediaSets.find((mediaSet) => mediaSet.id === value) || null,
    [mediaSets, value],
  )

  useEffect(() => {
    if (!value || !token) {
      setSelectedMediaSet(null)
      setIsLoadingSelected(false)
      return
    }

    let cancelled = false
    setIsLoadingSelected(true)

    const loadSelectedMediaSet = async () => {
      try {
        const docs = await fetchMediaSetLibrary(token, { id: value })
        if (!cancelled) {
          setSelectedMediaSet(docs[0] || null)
        }
      } catch {
        if (!cancelled) {
          setSelectedMediaSet(null)
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSelected(false)
        }
      }
    }

    void loadSelectedMediaSet()

    return () => {
      cancelled = true
    }
  }, [token, value])

  const handlePickerSelect = (result: ImagePickerResult) => {
    const rawId =
      result.kind === 'mediaSets'
        ? result.mediaSets[0]?.id
        : result.kind === 'upload'
          ? result.response.mediaSetId
          : null
    const mediaSetId = Number(rawId)
    if (rawId == null || Number.isNaN(mediaSetId)) return
    onValueChange(mediaSetId)
    setSelectedMediaSet(null)
  }

  const selectedLabel = selectedMediaSet
    ? formatMediaSetLabel(selectedMediaSet)
    : selectedOption
      ? formatMediaSetLabel(selectedOption)
      : value
        ? `Media Set #${value}`
        : 'Select cover image'

  const selectedPreviewUrl = resolveMediaSetPreviewUrl(selectedMediaSet)

  return (
    <div className="ldb-field-control-stack">
      {value ? (
        <div className="ldb-cover-image-preview">
          <button
            type="button"
            className="ldb-cover-image-preview__button"
            onClick={() => setIsPickerOpen(true)}
            disabled={!token}
          >
            {selectedPreviewUrl ? (
              <img
                className="ldb-cover-image-preview__thumb"
                src={selectedPreviewUrl}
                alt={selectedMediaSet?.alt_text || selectedLabel}
              />
            ) : (
              <div className="ldb-cover-image-preview__thumb ldb-cover-image-preview__thumb--empty">
                {isLoadingSelected ? 'Loading...' : 'No preview'}
              </div>
            )}
            <div className="ldb-cover-image-preview__meta">
              <strong>{selectedLabel}</strong>
              <span>{selectedMediaSet?.alt_text || 'Media set selected for this cover image.'}</span>
            </div>
          </button>

          <div className="ldb-cover-image-actions">
            <button type="button" className="ldb-ghost-btn" onClick={() => setIsPickerOpen(true)} disabled={!token}>
              Change Cover Image
            </button>
            <button type="button" className="ldb-danger-link" onClick={() => onValueChange(null)}>
              Clear
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="ldb-picker-trigger"
          onClick={() => setIsPickerOpen(true)}
          disabled={!token}
        >
          <span className="ldb-picker-trigger__preview">
            <span className="ldb-picker-trigger__label ldb-picker-trigger__label--placeholder">
              {field.label}
            </span>
          </span>
          <span className="ldb-picker-trigger__caret">▼</span>
        </button>
      )}

      {token ? (
        <ImagePicker
          isOpen={isPickerOpen}
          token={token}
          locationRef={locationRef}
          selectedId={value}
          query={{ browseUnit: 'mediaSets', requirementLabel: field.label }}
          uploadExternalRefBase="location-cover-upload"
          uploadFileNameTitle="location-cover"
          importExternalRefBase="location-cover-picker"
          importFileNameTitle="location-cover"
          importAltContextLabel="Location cover image"
          onSelect={handlePickerSelect}
          onClose={() => setIsPickerOpen(false)}
        />
      ) : null}
    </div>
  )
}
