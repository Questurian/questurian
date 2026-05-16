import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import FeaturedArticleCarouselLayout from './FeaturedArticleCarouselLayout'
import HotelGridLayout from './HotelGridLayout'
import LocationGridLayout from './LocationGridLayout'
import QuesturianMapsArticleLayout from './QuesturianMapsArticleLayout'
import type { HomepageHotelGridCandidate } from './hotelGridTypes'
import type { HomepageLocationGridCandidate } from './locationGridTypes'
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

function location(id: number, title: string): HomepageLocationGridCandidate {
  return {
    id,
    slot: id,
    level: 'city',
    locationKey: `city-${id}`,
    parentKey: null,
    countryName: 'France',
    cityName: title,
    neighborhoodName: null,
    title,
    subtitle: null,
    updatedAt: null,
    coverImageUrl: null,
    coverImageAlt: null
  }
}

function hotel(id: number, title: string): HomepageHotelGridCandidate {
  return {
    id,
    slot: id,
    title,
    slug: `hotel-${id}`,
    type: 'hotel',
    priceLevel: '2',
    status: 'published',
    updatedAt: null,
    imageUrl: null,
    location: 'Paris'
  }
}

describe('remaining curated slot swap layouts', () => {
  it('adds filled-slot handles to the featured article carousel without replacing slide arrows', () => {
    const onRemove = vi.fn()

    const { container } = render(
      <FeaturedArticleCarouselLayout
        slots={[article(1, 'First'), null, article(3, 'Third')]}
        invalidItemsBySlot={new Map()}
        onSlotClick={vi.fn()}
        onRemove={onRemove}
        onReorder={vi.fn()}
      />
    )

    expect(
      container.querySelectorAll('.hf-curated-article-slot-drag-handle')
    ).toHaveLength(2)
    expect(
      screen.getByRole('button', { name: 'Previous slide' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Next slide' })
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onRemove).toHaveBeenCalledWith(0)
  })

  it('uses filled-slot handles for Questurian Maps and keeps empty cells click-to-fill', () => {
    const onSlotClick = vi.fn()
    const onRemove = vi.fn()

    const { container } = render(
      <QuesturianMapsArticleLayout
        slots={[article(1, 'Map one'), null, article(3, 'Map three')]}
        invalidItemsBySlot={new Map()}
        onSlotClick={onSlotClick}
        onRemove={onRemove}
        onReorder={vi.fn()}
      />
    )

    expect(
      container.querySelectorAll('.hf-curated-article-slot-drag-handle')
    ).toHaveLength(2)
    expect(screen.queryByTitle('Move up')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Move down')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Add listicle/i }))
    expect(onSlotClick).toHaveBeenCalledWith(1)

    fireEvent.click(screen.getAllByTitle('Remove')[0])
    expect(onRemove).toHaveBeenCalledWith(0)
  })

  it('uses filled-slot handles for location grids and keeps empty cells click-to-fill', () => {
    const onSlotClick = vi.fn()
    const onRemove = vi.fn()

    const { container } = render(
      <LocationGridLayout
        slots={[location(1, 'Paris'), null, location(3, 'Lyon')]}
        childLevel="city"
        invalidItemsBySlot={new Map()}
        onSlotClick={onSlotClick}
        onRemove={onRemove}
        onReorder={vi.fn()}
      />
    )

    expect(
      container.querySelectorAll('.hf-curated-article-slot-drag-handle')
    ).toHaveLength(2)
    expect(screen.queryByTitle('Move up')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Move down')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Add city/i }))
    expect(onSlotClick).toHaveBeenCalledWith(1)

    fireEvent.click(screen.getAllByTitle('Remove')[0])
    expect(onRemove).toHaveBeenCalledWith(0)
  })

  it('uses filled-slot handles for hotel, tour, and place grids and keeps empty cells click-to-fill', () => {
    const onSlotClick = vi.fn()
    const onRemove = vi.fn()

    const { container } = render(
      <HotelGridLayout
        slots={[hotel(1, 'Hotel one'), null, hotel(3, 'Hotel three')]}
        invalidItemsBySlot={new Map()}
        onSlotClick={onSlotClick}
        onRemove={onRemove}
        onReorder={vi.fn()}
      />
    )

    expect(
      container.querySelectorAll('.hf-curated-article-slot-drag-handle')
    ).toHaveLength(2)
    expect(screen.queryByTitle('Move up')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Move down')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Add hotel/i }))
    expect(onSlotClick).toHaveBeenCalledWith(1)

    fireEvent.click(screen.getAllByTitle('Remove')[0])
    expect(onRemove).toHaveBeenCalledWith(0)
  })
})
