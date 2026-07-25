/* @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BuilderItemsPanel } from './BuilderItemsPanel'
import type { RelatedItemOption, SingleTypeListicleDraft } from '../../types'

afterEach(() => {
  cleanup()
})

vi.mock('../../../../shared/markdown-editor', () => ({
  MarkdownBlockEditor: ({
    blockId,
    value,
    onChange,
    placeholder,
    ariaLabel,
  }: {
    blockId: string
    value: string
    onChange: (nextValue: string) => void
    placeholder?: string
    ariaLabel?: string
  }) => (
    <textarea
      aria-label={ariaLabel || blockId}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
    />
  ),
}))

function buildDraft(listicleType: SingleTypeListicleDraft['listicleType']): SingleTypeListicleDraft {
  const blockTypeByListicleType = {
    dining: 'data-dining',
    accommodations: 'data-accommodations',
    attractions: 'data-attractions',
    nightlife: 'data-nightlife',
    '': 'data-dining',
  } as const

  return {
    draftId: 'draft-1',
    editorModelName: 'claude-opus-4-8',
    listTone: 'elevated',
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
        blockType: blockTypeByListicleType[listicleType],
        item: 101,
        tours: [],
        mediaMode: 'photos',
        selectedPhotos: [],
        selectedInstagramPost: null,
        blurbMarkdown: '',
        angle: listicleType === 'dining' ? 'signature-dish' : null,
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

function renderPanel(
  draft: SingleTypeListicleDraft,
  relatedItems: RelatedItemOption[],
  options?: {
    activeAiItemId?: string | null
    queuedAiItemIds?: string[]
    onItemBlurbAiAutoWrite?: (itemId: string) => Promise<void>
  },
) {
  return render(
    <BuilderItemsPanel
      draft={draft}
      relatedItems={relatedItems}
      isLoadingRelated={false}
      moveItem={vi.fn()}
      removeItem={vi.fn()}
      updateItem={vi.fn()}
      onItemBlurbAiAutoWrite={options?.onItemBlurbAiAutoWrite ?? vi.fn(async () => {})}
      onItemBlurbInspect={vi.fn()}
      hasInspectableStepsByItemId={{}}
      activeAiItemId={options?.activeAiItemId ?? null}
      queuedAiItemIds={options?.queuedAiItemIds ?? []}
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

  it('shows attraction angle options for attractions listicles', () => {
    renderPanel(buildDraft('attractions'), [buildRelatedItem()])

    const angleSelect = screen.getByRole('combobox', { name: /blurb angle for item 1/i })
    expect(angleSelect).toHaveTextContent('Signature Feature')
    expect(angleSelect).toHaveTextContent('Visit-Time Tip')
    expect(angleSelect).toHaveTextContent('Best For Visit Type')
  })

  it('shows auto-write as the primary AI action for empty blurbs', () => {
    renderPanel(buildDraft('dining'), [buildRelatedItem()])

    expect(screen.getByText('Auto Write')).toBeInTheDocument()
  })

  it('does not auto-write when the blurb editor is clicked', () => {
    const onItemBlurbAiAutoWrite = vi.fn(async () => {})
    renderPanel(buildDraft('dining'), [buildRelatedItem()], { onItemBlurbAiAutoWrite })

    fireEvent.click(screen.getByRole('textbox', { name: /blurb for item 1/i }))

    expect(onItemBlurbAiAutoWrite).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /auto write/i }))

    expect(onItemBlurbAiAutoWrite).toHaveBeenCalledTimes(1)
    expect(onItemBlurbAiAutoWrite).toHaveBeenCalledWith('item-1')
  })

  it('shows an inline waiting status while an item blurb is generating', () => {
    renderPanel(buildDraft('dining'), [buildRelatedItem()], {
      activeAiItemId: 'item-1',
    })

    expect(screen.getByText('Waiting for AI response...')).toBeInTheDocument()
  })
})
