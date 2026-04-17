import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { createEmptyDraft } from '../../storage'
import type { LocationOption, SingleTypeListicleDraft } from '../../types'
import { useBuilderDraftActions } from './useBuilderDraftActions'

const locations: LocationOption[] = [
  {
    id: 2,
    locationKey: 'peru|lima',
    country: 'peru',
    city: 'lima',
    level: 'city',
  },
  {
    id: 3,
    locationKey: 'peru|lima|barranco',
    country: 'peru',
    city: 'lima',
    neighborhood: 'barranco',
    parentKey: 'peru|lima',
    level: 'neighborhood',
  },
  {
    id: 4,
    locationKey: 'peru|lima|miraflores',
    country: 'peru',
    city: 'lima',
    neighborhood: 'miraflores',
    parentKey: 'peru|lima',
    level: 'neighborhood',
  },
]

function buildDraft(): SingleTypeListicleDraft {
  const draft = createEmptyDraft()
  draft.title = 'Best brunch in Lima'
  draft.location = 'peru|lima'
  draft.locationRef = 2
  draft.listicleType = 'dining'
  draft.targetItemCount = 2
  draft.step1_complete = true
  draft.step2_complete = true
  draft.step3_complete = true
  draft.header.introMarkdown = 'Keep this intro'
  draft.seoSection.seoTitle = 'Keep this SEO title'
  draft.items = [
    {
      id: 'item-1',
      blockType: 'data-dining',
      item: 101,
      mediaMode: 'photos',
      selectedPhotos: [9001],
      selectedInstagramPost: null,
      blurbMarkdown: 'Selected item one',
      blurbJsonText: '',
    },
    {
      id: 'item-2',
      blockType: 'data-dining',
      item: 102,
      mediaMode: 'photos',
      selectedPhotos: [9002],
      selectedInstagramPost: null,
      blurbMarkdown: 'Selected item two',
      blurbJsonText: '',
    },
  ]
  return draft
}

function useHarness(initialDraft: SingleTypeListicleDraft) {
  const [draft, setDraft] = useState<SingleTypeListicleDraft | null>(initialDraft)
  const actions = useBuilderDraftActions({
    draft,
    setDraft,
    locations,
    relatedItems: [],
    navigate: vi.fn(),
    setSearchParams: vi.fn() as never,
    onError: vi.fn(),
    setResult: vi.fn(),
  })

  return {
    draft,
    ...actions,
  }
}

describe('singleTypeListicles useBuilderDraftActions', () => {
  it('resets item selections but preserves header and SEO when shared neighborhoods change', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { result } = renderHook(() => useHarness(buildDraft()))

    act(() => {
      result.current.handleUpdateSetup()
    })

    act(() => {
      result.current.updateDraft({ sharedNeighborhoods: [3, 4] })
    })

    act(() => {
      result.current.handleSaveSetup()
    })

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(result.current.draft?.sharedNeighborhoods).toEqual([3, 4])
    expect(result.current.draft?.step2_complete).toBe(false)
    expect(result.current.draft?.step3_complete).toBe(false)
    expect(result.current.draft?.header.introMarkdown).toBe('Keep this intro')
    expect(result.current.draft?.seoSection.seoTitle).toBe('Keep this SEO title')
    expect(result.current.draft?.items).toHaveLength(2)
    expect(result.current.draft?.items.every((item) => item.item === null)).toBe(true)
    expect(result.current.draft?.items.every((item) => item.selectedPhotos.length === 0)).toBe(true)
  })
})
