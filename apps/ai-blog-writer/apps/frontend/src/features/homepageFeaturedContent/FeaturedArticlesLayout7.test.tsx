import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import FeaturedArticlesLayout7 from './FeaturedArticlesLayout7'
import { buildSaveItems, type SlotValue } from './useHomepageFeaturedSlots'

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
    excerpt: `Excerpt ${id}`,
    authorLabel: 'Editor'
  }
}

describe('FeaturedArticlesLayout7', () => {
  it('uses slot 1 as the center lead and keeps slots 2-3 on the left', () => {
    const slots = [
      article(1, 'Lead story'),
      article(2, 'Left story two'),
      article(3, 'Left story three'),
      article(4, 'Right story four'),
      article(5, 'Right story five'),
      article(6, 'Right story six'),
      article(7, 'Right story seven')
    ]
    const onSlotClick = vi.fn()

    const { container } = render(
      <FeaturedArticlesLayout7
        slots={slots}
        invalidItemsBySlot={new Map()}
        onSlotClick={onSlotClick}
        onReorder={vi.fn()}
      />
    )

    const center = container.querySelector('.hf-l7-col--center')
    const left = container.querySelector('.hf-l7-col--left')
    expect(center).not.toBeNull()
    expect(left).not.toBeNull()

    expect(
      within(center as HTMLElement).getByText('Lead story')
    ).toBeInTheDocument()
    expect(
      within(left as HTMLElement).getByText('Left story two')
    ).toBeInTheDocument()
    expect(
      within(left as HTMLElement).getByText('Left story three')
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Lead story/i }))
    fireEvent.click(screen.getByRole('button', { name: /Left story two/i }))
    fireEvent.click(screen.getByRole('button', { name: /Left story three/i }))

    expect(onSlotClick).toHaveBeenNthCalledWith(1, 0)
    expect(onSlotClick).toHaveBeenNthCalledWith(2, 1)
    expect(onSlotClick).toHaveBeenNthCalledWith(3, 2)
  })

  it('sends the center lead first when saving slot refs', () => {
    const lead = article(10, 'Center lead')
    const second = article(20, 'Left second')
    const third = article(30, 'Left third')

    expect(buildSaveItems([lead, second, third])).toEqual([
      { relationTo: 'articles', id: 10 },
      { relationTo: 'articles', id: 20 },
      { relationTo: 'articles', id: 30 }
    ])
  })
})
