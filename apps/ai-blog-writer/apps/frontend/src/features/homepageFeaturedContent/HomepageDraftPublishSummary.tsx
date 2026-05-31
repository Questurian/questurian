import type { CSSProperties } from 'react'

import HomepageBlockPublishStatusBadge from './HomepageBlockPublishStatusBadge'
import type { PageBlockResponse } from './pageBlocks'

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.25rem 0',
}

/**
 * Collapsible per-block draft-vs-published status panel. Gives an at-a-glance view of which
 * blocks are Live / Modified / Not published yet, and which are currently blocking Publish —
 * without having to attempt a publish first.
 */
export default function HomepageDraftPublishSummary({ blocks }: { blocks: PageBlockResponse[] }) {
  if (!blocks || blocks.length === 0) return null

  const blocked = blocks.filter((block) => block.validationStatus === 'blocked').length
  const modified = blocks.filter((block) => block.publishStatus === 'modified').length
  const unpublished = blocks.filter((block) => block.publishStatus === 'unpublished').length

  const summaryBits: string[] = []
  if (blocked > 0) summaryBits.push(`${blocked} can’t publish`)
  if (modified > 0) summaryBits.push(`${modified} modified`)
  if (unpublished > 0) summaryBits.push(`${unpublished} not published yet`)
  const summaryLabel = summaryBits.length > 0 ? summaryBits.join(' · ') : 'all live'

  return (
    <details
      className="hf-detail-meta"
      open={blocked > 0}
      style={{ marginBottom: '0.85rem', padding: '0.5rem 0.75rem', borderRadius: '8px' }}
    >
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
        Publish status — {summaryLabel}
      </summary>
      <div style={{ marginTop: '0.5rem' }}>
        {blocks.map((block, index) => (
          <div key={block.id ?? index} style={rowStyle}>
            <span style={{ minWidth: '2.5rem' }}>#{index + 1}</span>
            <span className="hf-block-type-tag">{block.blockType}</span>
            <HomepageBlockPublishStatusBadge
              publishStatus={block.publishStatus}
              validationStatus={block.validationStatus}
              publishBlockers={block.publishBlockers}
            />
            {block.validationStatus === 'blocked' && block.publishBlockers?.[0] && (
              <span style={{ color: '#991b1b', fontSize: '0.78rem' }}>{block.publishBlockers[0]}</span>
            )}
          </div>
        ))}
      </div>
    </details>
  )
}
