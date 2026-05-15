import type { MediaSet } from '../../../shared/api/payload/payload.types'
import type { MediaSetHealth } from '../types'
import { HealthScore } from './HealthScore'

type Props = {
  mediaSet: MediaSet
  health: MediaSetHealth
  selected: boolean
  onClick: () => void
}

function getPreviewUrl(ms: MediaSet): string | null {
  const source = ms.source
  if (source && typeof source === 'object' && source.url) return source.url

  const variants = ms.variants
  if (!variants) return null

  for (const key of ['wide', 'hero', 'square', 'thumbnail', 'portrait', 'editorial', 'open_graph'] as const) {
    const v = variants[key]
    if (v && typeof v === 'object' && v.url) return v.url
  }
  return null
}

const STATUS_COLORS: Record<string, string> = {
  usable: '#22c55e',
  partial: '#f59e0b',
  empty: '#ef4444',
  complete: '#6366f1',
}

export function MediaSetCard({ mediaSet, health, selected, onClick }: Props) {
  const previewUrl = getPreviewUrl(mediaSet)
  const statusColor = STATUS_COLORS[mediaSet.status ?? 'empty'] ?? '#9ca3af'

  return (
    <button
      type="button"
      className={`ml-card ${selected ? 'selected' : ''}`}
      onClick={onClick}
    >
      <div className="ml-card-image">
        {previewUrl ? (
          <img src={previewUrl} alt={mediaSet.alt_text ?? mediaSet.title ?? 'Media'} loading="lazy" />
        ) : (
          <div className="ml-card-no-image">No image</div>
        )}
        <div className="ml-card-health">
          <HealthScore health={health} size="sm" />
        </div>
      </div>

      <div className="ml-card-body">
        <p className="ml-card-title" title={mediaSet.title ?? undefined}>
          {mediaSet.title || <span className="ml-missing">Untitled</span>}
        </p>
        <div className="ml-card-meta">
          <span
            className="ml-status-dot"
            style={{ backgroundColor: statusColor }}
            title={mediaSet.status ?? 'empty'}
          />
          <span className="ml-card-variant-count">
            {health.presentVariants.length}/{7} variants
          </span>
        </div>
      </div>
    </button>
  )
}
