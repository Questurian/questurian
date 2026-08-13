'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { useField, useDocumentInfo } from '@payloadcms/ui'

type FocalPointFieldProps = {
  path?: string
}

type SourceAssetSummary = {
  id: number
  url: string | null
  width: number | null
  height: number | null
  filename: string | null
}

const clamp = (value: number) => Math.max(0, Math.min(1, value))

async function fetchSourceAsset(id: number): Promise<SourceAssetSummary | null> {
  try {
    const response = await fetch(`/api/media-assets/${id}?depth=0`, {
      credentials: 'include',
    })
    if (!response.ok) return null
    const json = (await response.json()) as Record<string, unknown>
    const url = typeof json.url === 'string' ? json.url : null
    const width = typeof json.width === 'number' ? json.width : null
    const height = typeof json.height === 'number' ? json.height : null
    const filename = typeof json.filename === 'string' ? json.filename : null
    return { id, url, width, height, filename }
  } catch {
    return null
  }
}

const FocalPointPickerField = (_props: FocalPointFieldProps) => {
  // This is a sibling UI field on the MediaSet document. The actual data
  // lives at top-level paths `focal_point.x`, `focal_point.y`, and `source`.
  const { value: xValue, setValue: setX } = useField<number>({ path: 'focal_point.x' })
  const { value: yValue, setValue: setY } = useField<number>({ path: 'focal_point.y' })
  const { value: sourceValueRaw } = useField<number | { id?: number } | null>({ path: 'source' })

  const docInfo = useDocumentInfo()
  const mediaSetId = useMemo(() => {
    const id = docInfo?.id
    if (typeof id === 'number') return id
    if (typeof id === 'string') {
      const parsed = Number.parseInt(id, 10)
      return Number.isFinite(parsed) ? parsed : null
    }
    return null
  }, [docInfo?.id])

  const sourceId = useMemo(() => {
    if (typeof sourceValueRaw === 'number') return sourceValueRaw
    if (sourceValueRaw && typeof sourceValueRaw === 'object' && 'id' in sourceValueRaw) {
      const id = (sourceValueRaw as { id?: unknown }).id
      if (typeof id === 'number') return id
    }
    return null
  }, [sourceValueRaw])

  const [source, setSource] = useState<SourceAssetSummary | null>(null)
  const [loadingSource, setLoadingSource] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!sourceId) {
      setSource(null)
      return
    }
    setLoadingSource(true)
    fetchSourceAsset(sourceId).then((asset) => {
      if (cancelled) return
      setSource(asset)
      setLoadingSource(false)
    })
    return () => {
      cancelled = true
    }
  }, [sourceId])

  const imageRef = useRef<HTMLImageElement | null>(null)

  const handleImageClick = useCallback(
    (event: MouseEvent<HTMLImageElement>) => {
      const img = imageRef.current
      if (!img) return
      const rect = img.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const nextX = clamp((event.clientX - rect.left) / rect.width)
      const nextY = clamp((event.clientY - rect.top) / rect.height)
      setX(Number(nextX.toFixed(4)))
      setY(Number(nextY.toFixed(4)))
      setStatusMessage('Focal point updated. Save the document, then click "Regenerate variants".')
    },
    [setX, setY],
  )

  const xDisplay = typeof xValue === 'number' ? xValue : 0.5
  const yDisplay = typeof yValue === 'number' ? yValue : 0.5

  const handleRegenerate = useCallback(async () => {
    if (!mediaSetId) {
      setStatusMessage('Save the document before regenerating variants.')
      return
    }
    setRegenerating(true)
    setStatusMessage('Regenerating variants…')
    try {
      const response = await fetch(`/api/media-sets/${mediaSetId}/regenerate`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) {
        const json = (await response.json().catch(() => null)) as
          | { message?: string }
          | null
        throw new Error(json?.message ?? `Regeneration failed (${response.status})`)
      }
      setStatusMessage('Variants regenerated. Reload the page to see the new files.')
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : 'Variants could not be regenerated.',
      )
    } finally {
      setRegenerating(false)
    }
  }, [mediaSetId])

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <label
        htmlFor="focal-point-picker-image"
        style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}
      >
        Focal point
      </label>
      <p style={{ fontSize: '0.85rem', color: 'var(--theme-elevation-500)', marginBottom: '0.5rem' }}>
        Click on the source image to set the focal point. Variants regenerated from this MediaSet
        will bias their crops toward this point.
      </p>

      {!sourceId ? (
        <div
          style={{
            padding: '1rem',
            border: '1px dashed var(--theme-elevation-200)',
            borderRadius: '4px',
            color: 'var(--theme-elevation-500)',
          }}
        >
          Attach a source image above to enable focal-point selection.
        </div>
      ) : loadingSource ? (
        <div style={{ padding: '1rem', color: 'var(--theme-elevation-500)' }}>
          Loading source image…
        </div>
      ) : !source?.url ? (
        <div
          style={{
            padding: '1rem',
            border: '1px dashed var(--theme-elevation-200)',
            borderRadius: '4px',
            color: 'var(--theme-elevation-500)',
          }}
        >
          Source asset has no URL. Make sure the source upload finished.
        </div>
      ) : (
        <div
          style={{
            position: 'relative',
            display: 'inline-block',
            maxWidth: '100%',
            border: '1px solid var(--theme-elevation-200)',
            borderRadius: '4px',
            overflow: 'hidden',
          }}
        >
          <img
            id="focal-point-picker-image"
            ref={imageRef}
            src={source.url}
            alt={source.filename ?? 'Source image'}
            onClick={handleImageClick}
            style={{
              display: 'block',
              maxWidth: '100%',
              maxHeight: '480px',
              cursor: 'crosshair',
              userSelect: 'none',
            }}
          />
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: `calc(${xDisplay * 100}% - 10px)`,
              top: `calc(${yDisplay * 100}% - 10px)`,
              width: 20,
              height: 20,
              borderRadius: '50%',
              border: '2px solid white',
              boxShadow: '0 0 0 2px rgba(0, 0, 0, 0.6), 0 0 8px rgba(0, 0, 0, 0.5)',
              pointerEvents: 'none',
            }}
          />
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: '1rem',
          alignItems: 'center',
          marginTop: '0.75rem',
          fontSize: '0.85rem',
          color: 'var(--theme-elevation-600)',
        }}
      >
        <span>
          x: <strong>{xDisplay.toFixed(3)}</strong>
        </span>
        <span>
          y: <strong>{yDisplay.toFixed(3)}</strong>
        </span>
      </div>

      <div style={{ marginTop: '0.75rem' }}>
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={!mediaSetId || !sourceId || regenerating}
          style={{
            padding: '0.5rem 1rem',
            background: 'var(--theme-elevation-150)',
            border: '1px solid var(--theme-elevation-200)',
            borderRadius: '4px',
            cursor: !mediaSetId || !sourceId || regenerating ? 'not-allowed' : 'pointer',
            fontWeight: 500,
            opacity: !mediaSetId || !sourceId || regenerating ? 0.6 : 1,
          }}
        >
          {regenerating ? 'Regenerating…' : 'Regenerate variants'}
        </button>
      </div>

      {statusMessage ? (
        <p
          style={{
            marginTop: '0.5rem',
            fontSize: '0.85rem',
            color: 'var(--theme-elevation-700)',
          }}
        >
          {statusMessage}
        </p>
      ) : null}
    </div>
  )
}

export default FocalPointPickerField
