import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'

import {
  fetchMediaSet,
  mediaSetSourceUrl,
  regenerateAuthorMediaSet,
  updateAuthorMediaSetPlacement
} from '../api/staff.api'
import type { AuthorMediaSet } from '../types'

type Props = {
  mediaSet: AuthorMediaSet | number | null | undefined
  disabled?: boolean
  onSaved?: () => Promise<void> | void
}

const clamp = (value: number) => Math.max(0, Math.min(1, value))

function mediaSetId(mediaSet: AuthorMediaSet | number | null | undefined) {
  if (!mediaSet) return null
  return typeof mediaSet === 'number' ? mediaSet : mediaSet.id
}

export default function AuthorImagePlacementEditor({
  mediaSet,
  disabled = false,
  onSaved
}: Props) {
  const id = mediaSetId(mediaSet)
  const initialMediaSet = typeof mediaSet === 'number' ? undefined : mediaSet
  const query = useQuery({
    queryKey: ['author-image-placement', id],
    queryFn: () => fetchMediaSet(id as number),
    enabled: Boolean(id),
    initialData: initialMediaSet
  })
  const doc = query.data
  const sourceUrl = mediaSetSourceUrl(doc)
  const [focalPoint, setFocalPoint] = useState({ x: 0.5, y: 0.5 })
  const [message, setMessage] = useState<string | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    setFocalPoint({
      x:
        typeof doc?.focal_point?.x === 'number'
          ? clamp(doc.focal_point.x)
          : 0.5,
      y:
        typeof doc?.focal_point?.y === 'number' ? clamp(doc.focal_point.y) : 0.5
    })
  }, [doc?.focal_point?.x, doc?.focal_point?.y])

  const dirty = useMemo(() => {
    const x = typeof doc?.focal_point?.x === 'number' ? doc.focal_point.x : 0.5
    const y = typeof doc?.focal_point?.y === 'number' ? doc.focal_point.y : 0.5
    return (
      Math.abs(focalPoint.x - x) > 0.0001 || Math.abs(focalPoint.y - y) > 0.0001
    )
  }, [doc?.focal_point?.x, doc?.focal_point?.y, focalPoint.x, focalPoint.y])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!id) return
      await updateAuthorMediaSetPlacement(id, focalPoint)
      await regenerateAuthorMediaSet(id)
      await onSaved?.()
    },
    onSuccess: async () => {
      await query.refetch()
      setMessage('Placement saved. Crops regenerated.')
    },
    onError: (error: Error) => setMessage(error.message)
  })

  function handleClick(event: MouseEvent<HTMLImageElement>) {
    if (disabled) return
    const img = imageRef.current
    if (!img) return
    const rect = img.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    setFocalPoint({
      x: Number(clamp((event.clientX - rect.left) / rect.width).toFixed(4)),
      y: Number(clamp((event.clientY - rect.top) / rect.height).toFixed(4))
    })
    setMessage('Placement changed. Save to regenerate crops.')
  }

  if (!id) return null

  return (
    <div className="author-image-placement-editor">
      <div>
        <strong>Image placement</strong>
        <span>Click the source image where the face should stay centered.</span>
      </div>
      {!sourceUrl ? (
        <p className="hf-banner error">
          This image has no source file for placement editing.
        </p>
      ) : (
        <div className="author-image-placement-workspace">
          <div className="author-image-placement-canvas">
            <img
              ref={imageRef}
              src={sourceUrl}
              alt="Selected Author source"
              draggable={false}
              onClick={handleClick}
            />
            <span
              aria-hidden="true"
              style={{
                left: `calc(${focalPoint.x * 100}% - 10px)`,
                top: `calc(${focalPoint.y * 100}% - 10px)`
              }}
            />
          </div>
          <div className="author-image-crop-preview" aria-label="Crop preview">
            {[
              { label: 'Portrait', className: 'is-portrait' },
              { label: 'Square', className: 'is-square' },
              { label: 'Wide', className: 'is-wide' }
            ].map((crop) => (
              <figure className={crop.className} key={crop.label}>
                <img
                  src={sourceUrl}
                  alt=""
                  style={{
                    objectPosition: `${focalPoint.x * 100}% ${focalPoint.y * 100}%`
                  }}
                />
                <figcaption>{crop.label}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}
      <button
        type="button"
        className="hf-btn-secondary"
        disabled={disabled || !sourceUrl || !dirty || saveMutation.isPending}
        onClick={() => saveMutation.mutate()}
      >
        {saveMutation.isPending ? 'Saving placement…' : 'Save placement'}
      </button>
      {message ? <p className="staff-muted">{message}</p> : null}
    </div>
  )
}
