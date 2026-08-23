import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import ArticleListLayout from './ArticleListLayout'
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
    excerpt: `Summary for ${title}`,
    authorLabel: 'Questura editor'
  }
}

describe('ArticleListLayout', () => {
  it('renders article slots as rows inside one scroll viewport', () => {
    const { container } = render(
      <ArticleListLayout
        slots={Array.from({ length: 10 }, (_, index) =>
          article(index + 1, `Article ${index + 1}`)
        )}
        invalidItemsBySlot={new Map()}
        onSlotClick={vi.fn()}
        onReorder={vi.fn()}
      />
    )

    expect(
      screen.getByRole('list', {
        name: 'Article list slots — scroll to view all'
      })
    ).toHaveClass('hf-article-list-editor')
    expect(screen.getAllByRole('listitem')).toHaveLength(10)
    expect(container.querySelector('.hf-slot-grid')).not.toBeInTheDocument()
  })

  it('preserves replacement clicks, empty rows, and filled-row drag handles', () => {
    const onSlotClick = vi.fn()
    const { container } = render(
      <ArticleListLayout
        slots={[article(1, 'First article'), null, article(3, 'Third article')]}
        invalidItemsBySlot={new Map()}
        onSlotClick={onSlotClick}
        onReorder={vi.fn()}
      />
    )

    expect(
      container.querySelectorAll('.hf-curated-article-slot-drag-handle')
    ).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: /First article/i }))
    fireEvent.click(screen.getByRole('button', { name: /Add article/i }))

    expect(onSlotClick).toHaveBeenNthCalledWith(1, 0)
    expect(onSlotClick).toHaveBeenNthCalledWith(2, 1)
  })
})
