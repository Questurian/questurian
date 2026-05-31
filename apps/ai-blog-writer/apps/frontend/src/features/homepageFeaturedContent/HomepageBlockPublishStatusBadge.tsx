import type { CSSProperties } from 'react'

import type { BlockPublishMeta } from './pageBlocks'

const badgeBase: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.3rem',
  padding: '0.1rem 0.55rem',
  borderRadius: '999px',
  fontSize: '0.7rem',
  fontWeight: 600,
  lineHeight: 1.6,
  whiteSpace: 'nowrap',
}

function chip(background: string, color: string): CSSProperties {
  return { ...badgeBase, background, color }
}

/**
 * Small status chip for a homepage block in the editor's Draft view:
 * Won't publish (overrides) → Not published yet → Modified → Live.
 */
export default function HomepageBlockPublishStatusBadge({
  publishStatus,
  validationStatus,
  publishBlockers,
}: BlockPublishMeta) {
  if (validationStatus === 'blocked') {
    return (
      <span
        style={chip('#fee2e2', '#991b1b')}
        title={publishBlockers?.[0] ?? 'This block cannot be published yet.'}
      >
        ⚠ Won’t publish
      </span>
    )
  }

  if (!publishStatus) return null

  if (publishStatus === 'live') {
    return (
      <span style={chip('#dcfce7', '#166534')} title="Matches the published page.">
        ● Live
      </span>
    )
  }

  if (publishStatus === 'modified') {
    return (
      <span style={chip('#fef3c7', '#92400e')} title="Draft has changes not yet published.">
        ✎ Modified
      </span>
    )
  }

  return (
    <span style={chip('#f1f5f9', '#475569')} title="This block has never been published.">
      ○ Not published yet
    </span>
  )
}
