import { beforeEach, describe, expect, it } from 'vitest'
import { createEmptyLocationDraft } from './schema'
import { listDrafts, saveDraft } from './storage'

describe('location draft storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('keeps only one draft per payload-backed location', () => {
    const firstDraft = createEmptyLocationDraft()
    firstDraft.draftId = 'draft-a'
    firstDraft.payloadId = 91
    firstDraft.countryName = 'Peru'
    firstDraft.cityName = 'Lima'
    saveDraft(firstDraft)

    const secondDraft = createEmptyLocationDraft()
    secondDraft.draftId = 'draft-b'
    secondDraft.payloadId = 91
    secondDraft.countryName = 'Peru'
    secondDraft.cityName = 'Lima Updated'
    saveDraft(secondDraft)

    const drafts = listDrafts()
    expect(drafts).toHaveLength(1)
    expect(drafts[0]?.draftId).toBe('draft-b')
    expect(drafts[0]?.cityName).toBe('Lima Updated')
  })

  it('migrates legacy guide media from stored drafts and drops guide content', () => {
    localStorage.setItem('location_documents_staged_v1', JSON.stringify([
      {
        draftId: 'legacy',
        payloadId: 91,
        level: 'city',
        country: 'peru',
        city: 'lima',
        guide: {
          media: {
            coverImage: 44,
          },
          core: {
            headline: 'Old guide copy',
          },
        },
      },
    ]))

    const drafts = listDrafts()

    expect(drafts[0]?.coverImage).toBe(44)
    expect('guide' in (drafts[0] || {})).toBe(false)
  })
})
