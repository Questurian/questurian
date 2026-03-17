import { createEmptyDraft, listDrafts, saveDraft } from './storage'

const CURRENT_STORAGE_KEY = 'listicle_itineraries_staged_v4_exact_neighborhoods'
const LEGACY_STORAGE_KEY = 'listicle_itineraries_staged_v3_inline_seo'

describe('listicleItineraries storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('stores and normalizes shared neighborhoods under the v4 key', () => {
    const draft = createEmptyDraft()
    draft.sharedNeighborhoods = [7, 6, 7]

    saveDraft(draft)

    const raw = JSON.parse(localStorage.getItem(CURRENT_STORAGE_KEY) || '[]') as Array<Record<string, unknown>>
    expect(raw).toHaveLength(1)
    expect(raw[0]?.sharedNeighborhoods).toEqual([7, 6, 7])
    expect(listDrafts()[0]?.sharedNeighborhoods).toEqual([7, 6])
  })

  it('ignores legacy staged drafts instead of migrating them', () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify([{
      ...createEmptyDraft(),
      draftId: 'legacy-itinerary',
    }]))

    expect(listDrafts()).toEqual([])
    expect(localStorage.getItem(CURRENT_STORAGE_KEY)).toBeNull()
  })
})
