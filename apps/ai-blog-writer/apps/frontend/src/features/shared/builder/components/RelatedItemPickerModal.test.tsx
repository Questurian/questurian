/* @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RelatedItemPickerModal } from './RelatedItemPickerModal'
import type { RelatedItemMediaSource } from '../types'

afterEach(() => {
  cleanup()
})

function buildRelatedItem(overrides: Partial<RelatedItemMediaSource> = {}): RelatedItemMediaSource {
  return {
    id: 7,
    title: '',
    location: '',
    status: 'published',
    gallery: [],
    instagramGallery: [],
    ...overrides,
  }
}

describe('RelatedItemPickerModal', () => {
  it('keeps fallback display labels searchable and exposed on the tile', () => {
    render(
      <RelatedItemPickerModal
        isOpen
        items={[buildRelatedItem()]}
        selectedItemId={null}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    const itemButton = screen.getByRole('button', { name: 'Item #7' })
    expect(itemButton).toHaveAttribute('title', 'Item #7')
    expect(screen.getByText('Item #7')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Search by name or location...'), {
      target: { value: 'item #7' },
    })

    expect(screen.getByRole('button', { name: 'Item #7' })).toBeInTheDocument()
    expect(screen.queryByText('No items match your search.')).not.toBeInTheDocument()
  })
})
