import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import HotelGridLayout from './HotelGridLayout'
import type { HotelGridSlotValue } from './useHomepageHotelGridSlots'

function hotel(id: number): NonNullable<HotelGridSlotValue> {
  return {
    id,
    slot: id,
    title: `Hotel ${id}`,
    slug: `hotel-${id}`,
    type: 'hotel',
    priceLevel: '2',
    status: 'published',
    updatedAt: null,
    imageUrl: null,
    location: 'Lima'
  }
}

describe('HotelGridLayout growth controls', () => {
  it('shows four cards per carousel page and advances with arrows', () => {
    const scrollTo = vi.fn()

    render(
      <HotelGridLayout
        slots={[hotel(1), hotel(2), hotel(3), hotel(4), hotel(5)]}
        invalidItemsBySlot={new Map()}
        onSlotClick={vi.fn()}
        onReorder={vi.fn()}
        maxItems={20}
      />
    )

    const carousel = screen.getByRole('region', { name: 'hotel carousel' })
    const viewport = carousel.querySelector('.hf-location-carousel-viewport')
    expect(viewport).not.toBeNull()
    Object.defineProperty(viewport, 'clientWidth', { value: 800 })
    Object.defineProperty(viewport, 'scrollWidth', { value: 1000 })
    Object.defineProperty(viewport, 'scrollTo', { value: scrollTo })

    expect(screen.getByText('5 cards · page 1 of 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next hotels' }))

    expect(scrollTo).toHaveBeenCalledWith({ left: 200, behavior: 'smooth' })
    expect(screen.getByText('5 cards · page 2 of 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next hotels' })).toBeDisabled()
  })

  it('offers one append card after all current slots are filled', () => {
    const onAppend = vi.fn()

    render(
      <HotelGridLayout
        slots={[hotel(1), hotel(2), hotel(3), hotel(4)]}
        invalidItemsBySlot={new Map()}
        onSlotClick={vi.fn()}
        onReorder={vi.fn()}
        onAppend={onAppend}
        onRemove={vi.fn()}
        maxItems={20}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Add another hotel/ }))
    expect(onAppend).toHaveBeenCalledOnce()
    expect(screen.getByText('4 / 20 cards')).toBeInTheDocument()
  })

  it('hides append control when an empty slot exists or cap is reached', () => {
    const { rerender } = render(
      <HotelGridLayout
        slots={[hotel(1), hotel(2), hotel(3), null]}
        invalidItemsBySlot={new Map()}
        onSlotClick={vi.fn()}
        onReorder={vi.fn()}
        onAppend={vi.fn()}
        maxItems={20}
      />
    )

    expect(
      screen.queryByRole('button', { name: /Add another hotel/ })
    ).not.toBeInTheDocument()

    rerender(
      <HotelGridLayout
        slots={Array.from({ length: 20 }, (_, index) => hotel(index + 1))}
        invalidItemsBySlot={new Map()}
        onSlotClick={vi.fn()}
        onReorder={vi.fn()}
        onAppend={vi.fn()}
        maxItems={20}
      />
    )

    expect(
      screen.queryByRole('button', { name: /Add another hotel/ })
    ).not.toBeInTheDocument()
  })

  it('exposes removal for filled cards', () => {
    const onRemove = vi.fn()

    render(
      <HotelGridLayout
        slots={[hotel(1), hotel(2), hotel(3), hotel(4), hotel(5)]}
        invalidItemsBySlot={new Map()}
        onSlotClick={vi.fn()}
        onReorder={vi.fn()}
        onRemove={onRemove}
        maxItems={20}
      />
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove hotel Hotel 3' })
    )
    expect(onRemove).toHaveBeenCalledWith(2)
  })
})
