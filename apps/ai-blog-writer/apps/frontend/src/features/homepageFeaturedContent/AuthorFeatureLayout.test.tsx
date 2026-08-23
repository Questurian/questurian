import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { AuthorFeatureBlockResponse } from './pageBlocks'
import AuthorFeatureLayout from './AuthorFeatureLayout'
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
    collectionLabel: 'Guide',
    imageUrl: `/article-${id}.webp`,
    imageUrlSquare: `/article-${id}-square.webp`,
    excerpt: null,
    authorLabel: 'Alan Malpartida'
  }
}

const image = {
  url: '/author.webp',
  alt: 'Author portrait',
  width: 1080,
  height: 1080,
  variant: 'square',
  status: 'ready'
}

const block: AuthorFeatureBlockResponse = {
  id: 'author-1',
  blockType: 'author-feature',
  selection: {
    totalSlots: 3,
    items: [],
    invalidItems: [],
    isComplete: true,
    allowDrafts: false
  },
  sectionHeading: null,
  sectionSubheading: null,
  imageStyle: 'square',
  motionStyle: 'subtle',
  descriptionMode: 'custom',
  expertiseMode: 'selected',
  selectedExpertise: ['Digital Nomad'],
  authorCard: {
    author: {
      id: 1,
      name: 'Alan Malpartida',
      slug: 'alan-malpartida',
      href: '/authors/alan-malpartida',
      bio: 'Local guide.',
      expertise: ['Lima', 'Restaurants']
    },
    displayDescription: 'Custom homepage description.',
    displayExpertise: ['Digital Nomad'],
    imageMediaSetId: 11,
    image,
    imageSquare: image,
    imageWide: image,
    imageAltReady: true,
    spotlightNote: 'Local expat'
  }
}

describe('AuthorFeatureLayout', () => {
  it('previews Author copy and article rail in Editorial Feature proportions', () => {
    const onSlotClick = vi.fn()
    const { container } = render(
      <AuthorFeatureLayout
        block={block}
        slots={[
          article(1, 'First guide'),
          article(2, 'Second guide'),
          article(3, 'Third guide')
        ]}
        invalidItemsBySlot={new Map()}
        onSlotClick={onSlotClick}
        onReorder={vi.fn()}
      />
    )

    expect(container.firstChild).toHaveClass('hf-editorial-feature-preview')
    expect(container.firstChild).toHaveClass('hf-author-feature-preview')
    expect(screen.getByText('Author spotlight')).toBeInTheDocument()
    expect(screen.getByText('Alan Malpartida')).toBeInTheDocument()
    expect(screen.getByText('Custom homepage description.')).toBeInTheDocument()
    expect(screen.getByText('Digital Nomad')).toBeInTheDocument()
    expect(screen.queryByText('Lima / Restaurants')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Second guide/i }))
    expect(onSlotClick).toHaveBeenCalledWith(1)
  })
})
