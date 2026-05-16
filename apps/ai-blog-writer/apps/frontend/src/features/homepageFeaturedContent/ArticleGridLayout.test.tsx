import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import ArticleGridLayout from './ArticleGridLayout'
import type { SlotValue } from './useHomepageFeaturedSlots'

function article(id: number, title: string): NonNullable<SlotValue> {
  return {
    relationTo: 'articles',
    id,
    slot: id,
    title,
    slug: `article-${id}`,
    status: 'published',
    updatedAt: null,
    publishedAt: null,
    collectionLabel: 'Article',
    imageUrl: null,
    excerpt: null,
    authorLabel: null
  }
}

describe('ArticleGridLayout', () => {
  it('uses drag handles as the reorder control for 4 slots', () => {
    const { container } = render(
      <ArticleGridLayout
        slots={[
          article(1, 'First'),
          article(2, 'Second'),
          article(3, 'Third'),
          article(4, 'Fourth')
        ]}
        invalidItemsBySlot={new Map()}
        onSlotClick={vi.fn()}
        onReorder={vi.fn()}
      />
    )

    expect(
      container.querySelectorAll('.hf-curated-article-slot-drag-handle')
    ).toHaveLength(4)
    expect(screen.queryByTitle('Move up')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Move down')).not.toBeInTheDocument()
  })

  it('keeps empty slots full-size without drag handles and preserves click-to-pick behavior', () => {
    const onSlotClick = vi.fn()

    const { container } = render(
      <ArticleGridLayout
        slots={[article(1, 'First'), null, article(3, 'Third'), null]}
        invalidItemsBySlot={new Map()}
        onSlotClick={onSlotClick}
        onReorder={vi.fn()}
      />
    )

    expect(
      container.querySelectorAll('.hf-curated-article-slot-drag-handle')
    ).toHaveLength(2)

    fireEvent.click(screen.getAllByRole('button', { name: /Add article/i })[0])
    expect(onSlotClick).toHaveBeenCalledWith(1)
  })

  it('opens replacement picker when a filled card is clicked', () => {
    const onSlotClick = vi.fn()

    render(
      <ArticleGridLayout
        slots={[
          article(1, 'First'),
          article(2, 'Second'),
          article(3, 'Third'),
          article(4, 'Fourth')
        ]}
        invalidItemsBySlot={new Map()}
        onSlotClick={onSlotClick}
        onReorder={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Second/i }))
    expect(onSlotClick).toHaveBeenCalledWith(1)
  })
})
