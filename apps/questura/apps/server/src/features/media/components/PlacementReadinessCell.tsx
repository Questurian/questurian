'use client'

import type { CSSProperties } from 'react'

import {
  resolveMediaSetForPlacement,
  type MediaPlacement,
  type PublicImageStatus,
} from '@/features/media/lib/resolve-public-image'

type PlacementReadinessCellProps = {
  rowData?: unknown
}

const PLACEMENTS: MediaPlacement[] = [
  'card',
  'square-card',
  'wide-card',
  'hero',
  'article-header',
  'open-graph',
]

const STATUS_COLORS: Record<PublicImageStatus, { bg: string; fg: string; label: string }> = {
  ready: { bg: '#1f7a3a', fg: 'white', label: 'ready' },
  legacy_fallback: { bg: '#a86b00', fg: 'white', label: 'fallback' },
  missing: { bg: '#5a5a5a', fg: 'white', label: 'missing' },
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const PlacementReadinessCell = ({ rowData }: PlacementReadinessCellProps) => {
  const mediaSet = isRecord(rowData) ? rowData : null

  const chipBase: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    padding: '0.125rem 0.4rem',
    borderRadius: '4px',
    fontSize: '0.7rem',
    fontWeight: 500,
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
  }

  if (!mediaSet) {
    return (
      <span style={{ color: 'var(--theme-elevation-500)', fontSize: '0.8rem' }}>—</span>
    )
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
      {PLACEMENTS.map((placement) => {
        const resolved = resolveMediaSetForPlacement(mediaSet, placement, {
          allowMigrationFallback: true,
        })
        const colors = STATUS_COLORS[resolved.status]
        const title = `${placement}: ${colors.label}${
          resolved.variant ? ` (variant: ${resolved.variant})` : ''
        }`

        return (
          <span
            key={placement}
            title={title}
            style={{
              ...chipBase,
              background: colors.bg,
              color: colors.fg,
            }}
          >
            {placement}
          </span>
        )
      })}
    </div>
  )
}

export default PlacementReadinessCell
