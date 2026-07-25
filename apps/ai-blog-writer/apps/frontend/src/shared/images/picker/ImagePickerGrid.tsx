import { useEffect, useRef } from 'react'
import type { MediaAsset } from '../../api/payload/payload.types'
import type { ImagePickerQuery } from './imagePicker.types'
import {
  formatMediaSetLabel,
  getMediaAssetAltText,
  isMediaSetSelected,
  resolveAssetUrl,
  resolveMediaSetPreviewAssetId,
  resolveMediaSetPreviewUrl,
} from './mediaSet.utils'
import type { useImagePickerData } from './useImagePickerData'

type ImagePickerGridProps = {
  data: ReturnType<typeof useImagePickerData>
  browseUnit: ImagePickerQuery['browseUnit']
  selectedId: number | null
  bufferIds: number[] | null
  onAssetClick: (asset: MediaAsset) => void
  onMediaSetClick: (mediaSet: ReturnType<typeof useImagePickerData>['mediaSets'][number]) => void
}

export function ImagePickerGrid({
  data,
  browseUnit,
  selectedId,
  bufferIds,
  onAssetClick,
  onMediaSetClick,
}: ImagePickerGridProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (data.error || !data.hasMore || data.isLoading) return
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) data.loadMore()
      },
      { root: gridRef.current, rootMargin: '0px 0px 320px 0px', threshold: 0 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [data])

  const isEmpty = browseUnit === 'mediaSets' ? data.mediaSets.length === 0 : data.assets.length === 0

  return (
    <div ref={gridRef} className="ip-grid">
      {browseUnit === 'mediaSets'
        ? data.mediaSets.map((mediaSet) => {
            const previewUrl = resolveMediaSetPreviewUrl(mediaSet)
            const previewAssetId = resolveMediaSetPreviewAssetId(mediaSet)
            const label = formatMediaSetLabel(mediaSet)
            const bufferIndex = bufferIds ? bufferIds.indexOf(mediaSet.id) : -1
            const isSelected = bufferIds ? bufferIndex !== -1 : isMediaSetSelected(mediaSet, selectedId)
            return (
              <button
                key={mediaSet.id}
                type="button"
                className={`ip-card${isSelected ? ' ip-card--selected' : ''}`}
                onClick={() => onMediaSetClick(mediaSet)}
                disabled={previewAssetId === null && !previewUrl}
              >
                {previewUrl ? (
                  <img className="ip-card__thumb" src={previewUrl} alt={mediaSet.alt_text ?? label} loading="lazy" />
                ) : (
                  <div className="ip-card__thumb ip-card__thumb--empty">No preview</div>
                )}
                <div className="ip-card__info">
                  <span className="ip-card__name">{label}</span>
                </div>
                {isSelected && <div className="ip-card__badge">{bufferIds ? bufferIndex + 1 : '✓'}</div>}
              </button>
            )
          })
        : data.assets.map((asset) => {
            const bufferIndex = bufferIds ? bufferIds.indexOf(asset.id) : -1
            const isSelected = bufferIds ? bufferIndex !== -1 : selectedId === asset.id
            return (
              <button
                key={asset.id}
                type="button"
                className={`ip-card${isSelected ? ' ip-card--selected' : ''}`}
                onClick={() => onAssetClick(asset)}
              >
                <img
                  className="ip-card__thumb"
                  src={resolveAssetUrl(asset)}
                  alt={getMediaAssetAltText(asset) || asset.filename}
                  loading="lazy"
                />
                <div className="ip-card__info">
                  <span className="ip-card__name">{asset.filename}</span>
                </div>
                {isSelected && <div className="ip-card__badge">{bufferIds ? bufferIndex + 1 : '✓'}</div>}
              </button>
            )
          })}

      {data.hasMore && <div ref={sentinelRef} style={{ height: 2, gridColumn: '1 / -1' }} />}

      {isEmpty && !data.isLoading && <p className="ip-empty">No images found.</p>}
      {data.isLoading && !data.isBootstrapping && <p className="ip-empty">Loading more...</p>}
    </div>
  )
}
