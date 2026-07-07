import { useEffect, useMemo, useState } from 'react'
import type { MediaSet } from '../../api/payload/payload.types'
import { ImagePicker } from '../picker'
import { formatMediaSetLabel, resolveMediaSetPreviewUrl } from '../picker/mediaSet.utils'
import {
  createCompositeImage,
  previewCompositeImage,
  type CompositeImageCreateResponse,
  type CompositeImageLayout,
} from '../api/composites/composite-image.api'
import './composite-image.css'

type CompositeImageModalProps = {
  isOpen: boolean
  token: string
  locationRef: number | null
  defaultTitle?: string
  onCreated?: (response: CompositeImageCreateResponse) => void
  onClose: () => void
}

const CREDIT = 'Questurian Composite'

function requiredCount(layout: CompositeImageLayout): number {
  return layout === 'two-up' ? 2 : 4
}

function slotLabels(layout: CompositeImageLayout): string[] {
  return layout === 'two-up'
    ? ['Left', 'Right']
    : ['Top left', 'Top right', 'Bottom left', 'Bottom right']
}

export function CompositeImageModal({
  isOpen,
  token,
  locationRef,
  defaultTitle = 'Composite image',
  onCreated,
  onClose,
}: CompositeImageModalProps) {
  const [layout, setLayout] = useState<CompositeImageLayout>('four-up')
  const [sources, setSources] = useState<MediaSet[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [title, setTitle] = useState(defaultTitle)
  const [altText, setAltText] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const count = requiredCount(layout)
  const labels = slotLabels(layout)

  useEffect(() => {
    if (!isOpen) return
    setLayout('four-up')
    setSources([])
    setTitle(defaultTitle)
    setAltText('')
    setPreviewUrl(null)
    setWarnings([])
    setError(null)
  }, [defaultTitle, isOpen])

  useEffect(() => {
    if (sources.length > count) setSources((current) => current.slice(0, count))
  }, [count, sources.length])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const request = useMemo(() => ({
    layout,
    sources: sources.map((source) => ({ mediaSetId: source.id })),
    title: title.trim(),
    altText: altText.trim(),
    photographerCredit: CREDIT,
    locationRef: locationRef ?? 0,
  }), [altText, layout, locationRef, sources, title])

  if (!isOpen) return null

  const resetPreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setWarnings([])
    setError(null)
  }

  const moveSource = (index: number, direction: -1 | 1) => {
    resetPreview()
    setSources((current) => {
      const next = [...current]
      const target = index + direction
      if (target < 0 || target >= next.length) return current
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const handlePreview = async () => {
    resetPreview()
    setIsPreviewing(true)
    try {
      const result = await previewCompositeImage(request, token)
      setPreviewUrl(URL.createObjectURL(result.blob))
      setWarnings(result.warnings)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed')
    } finally {
      setIsPreviewing(false)
    }
  }

  const handleCreate = async () => {
    setIsCreating(true)
    setError(null)
    try {
      const response = await createCompositeImage(request, token)
      onCreated?.(response)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setIsCreating(false)
    }
  }

  const canPreview = sources.length === count && request.title && request.altText && !isPreviewing && !isCreating
  const canCreate = canPreview && Boolean(previewUrl)

  return (
    <div className="ci-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <div className="ci-modal" role="dialog" aria-modal="true" aria-label="Composite image">
        <div className="ci-header">
          <h3>Create composite image</h3>
          <button type="button" className="ci-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="ci-body">
          <div className="ci-controls">
            <label className="ci-field">
              <span>Layout</span>
              <select
                value={layout}
                onChange={(event) => {
                  resetPreview()
                  setLayout(event.target.value as CompositeImageLayout)
                }}
              >
                <option value="four-up">4 corners</option>
                <option value="two-up">Left / right</option>
              </select>
            </label>

            <label className="ci-field">
              <span>Title</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>

            <label className="ci-field">
              <span>Alt text</span>
              <textarea value={altText} onChange={(event) => setAltText(event.target.value)} rows={3} />
            </label>

            <div className="ci-source-header">
              <span>Sources</span>
              <button type="button" className="ci-secondary" onClick={() => setPickerOpen(true)}>
                Pick {count}
              </button>
            </div>

            <div className="ci-slots">
              {labels.map((label, index) => {
                const source = sources[index]
                const url = source ? resolveMediaSetPreviewUrl(source) : undefined
                return (
                  <div key={label} className="ci-slot">
                    <div className="ci-slot-media">
                      {url ? <img src={url} alt="" /> : <span>{label}</span>}
                    </div>
                    <div className="ci-slot-copy">
                      <strong>{label}</strong>
                      <span>{source ? formatMediaSetLabel(source) : 'Empty'}</span>
                    </div>
                    <div className="ci-slot-actions">
                      <button type="button" onClick={() => moveSource(index, -1)} disabled={index === 0 || !source}>↑</button>
                      <button type="button" onClick={() => moveSource(index, 1)} disabled={index >= sources.length - 1 || !source}>↓</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="ci-preview">
            {previewUrl ? (
              <img src={previewUrl} alt="" />
            ) : (
              <div className="ci-preview-empty">Preview appears here</div>
            )}
            {warnings.length > 0 && (
              <div className="ci-warnings">
                {warnings.map((warning) => <p key={warning}>{warning}</p>)}
              </div>
            )}
            {error && <p className="ci-error">{error}</p>}
          </div>
        </div>

        <div className="ci-footer">
          <button type="button" className="ci-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="ci-secondary" onClick={handlePreview} disabled={!canPreview}>
            {isPreviewing ? 'Previewing...' : 'Preview'}
          </button>
          <button type="button" className="ci-primary" onClick={handleCreate} disabled={!canCreate}>
            {isCreating ? 'Creating...' : 'Create MediaSet'}
          </button>
        </div>

        <ImagePicker
          isOpen={pickerOpen}
          token={token}
          locationRef={locationRef}
          query={{
            browseUnit: 'mediaSets',
            requirementLabel: `${count} source MediaSets`,
          }}
          selection={{ mode: 'multiple', count }}
          payloadOnly
          confirmLabel="Use selected"
          onSelect={(result) => {
            if (result.kind === 'mediaSets') {
              resetPreview()
              setSources(result.mediaSets.slice(0, count))
            }
            setPickerOpen(false)
          }}
          onClose={() => setPickerOpen(false)}
        />
      </div>
    </div>
  )
}
