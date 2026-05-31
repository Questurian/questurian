import type { CSSProperties } from 'react'

import type { PageBlockResponse } from './pageBlocks'

type PreviewItem = { key: string; title: string; status?: string }

function previewItems(block: PageBlockResponse): PreviewItem[] {
  const selection = (block as { selection?: { items?: unknown[] } }).selection
  const items = Array.isArray(selection?.items) ? selection!.items! : []
  return items.map((raw, index) => {
    const record = (raw ?? {}) as Record<string, unknown>
    const title =
      (typeof record.title === 'string' && record.title)
      || (typeof record.name === 'string' && record.name)
      || (typeof record.label === 'string' && record.label)
      || (typeof record.cityName === 'string' && record.cityName)
      || (typeof record.neighborhoodName === 'string' && record.neighborhoodName)
      || `Item ${index + 1}`
    const status = typeof record.status === 'string' ? record.status : undefined
    return { key: String(index), title: String(title), status }
  })
}

function sectionText(block: PageBlockResponse, key: 'sectionHeading' | 'sectionSubheading'): string | null {
  const value = (block as Record<string, unknown>)[key]
  return typeof value === 'string' && value.trim() ? value : null
}

const cardStyle: CSSProperties = {
  border: '1px solid var(--border, #e2e8f0)',
  borderRadius: '10px',
  padding: '1rem 1.1rem',
  marginBottom: '0.85rem',
  background: 'var(--card, #fff)',
}

/**
 * Read-only render of the blocks that are currently published (live on the public site).
 * Shows block order, type, section text, and the items in each slot — not the full public
 * layout, but enough to compare "what's live" against the draft editor at a glance.
 */
export default function PublishedHomepagePreview({ blocks }: { blocks: PageBlockResponse[] }) {
  if (!blocks || blocks.length === 0) {
    return (
      <div className="hf-state-screen">
        <h2>Nothing published yet</h2>
        <p>This homepage has never been published. Publish the draft to make it live.</p>
      </div>
    )
  }

  return (
    <div>
      <div
        className="hf-detail-meta"
        style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
      >
        <span aria-hidden>👁</span>
        <span>Read-only preview of the published page. Switch to Draft to edit.</span>
      </div>
      {blocks.map((block, index) => {
        const heading = sectionText(block, 'sectionHeading')
        const subheading = sectionText(block, 'sectionSubheading')
        const items = previewItems(block)
        return (
          <div key={block.id ?? index} style={cardStyle}>
            <div
              className="hf-block-label"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}
            >
              <span>Block {index + 1}</span>
              <span className="hf-block-type-tag">{block.blockType}</span>
            </div>
            {heading && <div style={{ fontWeight: 600 }}>{heading}</div>}
            {subheading && (
              <div style={{ color: 'var(--muted, #64748b)', fontSize: '0.85rem' }}>{subheading}</div>
            )}
            {items.length > 0 ? (
              <ol style={{ margin: '0.6rem 0 0', paddingLeft: '1.2rem' }}>
                {items.map((item) => (
                  <li key={item.key} style={{ fontSize: '0.85rem', padding: '0.1rem 0' }}>
                    {item.title}
                    {item.status && item.status !== 'published' && (
                      <span style={{ color: '#92400e', marginLeft: '0.4rem' }}>({item.status})</span>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <div style={{ color: 'var(--muted, #64748b)', fontSize: '0.85rem', marginTop: '0.4rem' }}>
                No items.
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
