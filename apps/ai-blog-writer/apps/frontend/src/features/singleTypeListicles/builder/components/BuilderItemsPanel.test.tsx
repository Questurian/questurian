/* @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BuilderItemsPanel } from './BuilderItemsPanel'
import type { RelatedItemOption, SingleTypeListicleDraft } from '../../types'

afterEach(() => {
  cleanup()
})

vi.mock('../../../staging/features/markdown-editor', () => ({
  MarkdownBlockEditor: ({
    blockId,
    value,
    onChange,
    placeholder,
  }: {
    blockId: string
    value: string
    onChange: (nextValue: string) => void
    placeholder?: string
  }) => (
    <textarea
      aria-label={blockId}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
    />
  ),
}))

function buildDraft(listicleType: SingleTypeListicleDraft['listicleType']): SingleTypeListicleDraft {
  return {
    draftId: 'draft-1',
    editorModelName: 'gemini-2.5-flash',
    title: 'Best Restaurants',
    location: 'lima-peru',
    locationRef: 1,
    sharedNeighborhoods: [],
    listicleType,
    targetItemCount: 1,
    step1_complete: true,
    in_update_mode: false,
    step2_complete: true,
    step2_in_update_mode: false,
    step3_complete: false,
    step3_in_update_mode: false,
    header: {
      introMarkdown: '',
      featuredImage: null,
    },
    items: [
      {
        id: 'item-1',
        blockType: listicleType === 'dining' ? 'data-dining' : 'data-accommodations',
        item: 101,
        mediaMode: 'photos',
        selectedPhotos: [],
        selectedInstagramPost: null,
        blurbMarkdown: '',
      },
    ],
    seoSection: {
      seoTitle: '',
      metaDescription: '',
      openGraph: {
        title: '',
        description: '',
        imageUrl: '',
        url: '',
      },
      twitterCard: {
        card: 'summary_large_image',
        title: '',
        description: '',
        imageUrl: '',
      },
      structuredData: '',
      robots: {
        index: 'index',
        follow: 'follow',
      },
    },
    status: 'draft',
    articleType: 'single-type-listicle',
    updatedAt: '2026-03-28T12:00:00.000Z',
  }
}

function buildRelatedItem(): RelatedItemOption {
  return {
    id: 101,
    title: 'La Mar',
    location: 'Miraflores, Lima',
    status: 'published',
    idealFor: ['date night', 'seafood lovers'],
    gallery: [],
    instagramGallery: [],
  }
}

function renderPanel(draft: SingleTypeListicleDraft, relatedItems: RelatedItemOption[]) {
  return render(
    <BuilderItemsPanel
      draft={draft}
      relatedItems={relatedItems}
      isLoadingRelated={false}
      moveItem={vi.fn()}
      removeItem={vi.fn()}
      updateItem={vi.fn()}
      onItemBlurbAiAutoWrite={vi.fn(async () => {})}
      onItemBlurbAiRewrite={vi.fn(async (_itemId: string, input: { currentContent: string }) => input.currentContent)}
      activeAiItemId={null}
      isLocked={false}
      onContinueStep3={vi.fn()}
      onUpdateStep3={vi.fn()}
      onSaveStep3={vi.fn()}
      onCancelStep3Update={vi.fn()}
    />,
  )
}

describe('BuilderItemsPanel', () => {
  it('shows the dining ideal-for field as read-only when a related restaurant is selected', () => {
    renderPanel(buildDraft('dining'), [buildRelatedItem()])

    expect(screen.getByRole('textbox', { name: /ideal for/i })).toHaveValue('date night, seafood lovers')
    expect(screen.getByText('View only. Update the related dining entry to change this.')).toBeInTheDocument()
  })

  it('does not show the ideal-for field for non-dining listicles', () => {
    renderPanel(buildDraft('accommodations'), [buildRelatedItem()])

    expect(screen.queryByRole('textbox', { name: /ideal for/i })).not.toBeInTheDocument()
  })

  it('shows auto-write as the primary AI action for empty blurbs', () => {
    renderPanel(buildDraft('dining'), [buildRelatedItem()])

    expect(screen.getByText('Auto Write')).toBeInTheDocument()
  })
})
