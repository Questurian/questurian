import { describe, expect, it } from 'vitest'

import {
  buildDraftFromPayloadDoc,
  buildLocationHierarchyTitle,
  buildPayloadLocationBody,
  createEmptyLocationDraft,
  markDraftAsPayloadSynced,
  refreshDraftPayloadSyncState,
  sanitizeLocationDraftShape,
  validateDraft,
} from './schema'
import type { PayloadLocationDoc } from './types'

describe('location image schema helpers', () => {
  it('migrates legacy guide media cover image into top-level coverImage', () => {
    const draft = sanitizeLocationDraftShape({
      draftId: 'legacy',
      payloadId: 91,
      level: 'city',
      country: 'peru',
      city: 'lima',
      guide: {
        media: {
          coverImage: { id: 44 },
        },
        core: {
          headline: 'Old guide copy',
        },
      },
    })

    expect(draft.coverImage).toBe(44)
    expect('guide' in draft).toBe(false)
  })

  it('keeps an explicit top-level cleared image instead of falling back to legacy guide data', () => {
    const draft = sanitizeLocationDraftShape({
      coverImage: null,
      guide: {
        media: {
          coverImage: 44,
        },
      },
    })

    expect(draft.coverImage).toBeNull()
  })

  it('builds a Payload update body with only top-level coverImage', () => {
    const draft = createEmptyLocationDraft()
    draft.payloadId = 12
    draft.coverImage = 91

    expect(buildPayloadLocationBody(draft)).toEqual({ coverImage: 91 })
    expect(JSON.stringify(buildPayloadLocationBody(draft))).not.toContain('guide')
  })

  it('sends null when the cover image is cleared', () => {
    const draft = createEmptyLocationDraft()
    draft.payloadId = 12
    draft.coverImage = null

    expect(buildPayloadLocationBody(draft)).toEqual({ coverImage: null })
  })

  it('maps Payload locations from top-level coverImage and keeps hierarchy fields', () => {
    const doc: PayloadLocationDoc = {
      id: 12,
      level: 'neighborhood',
      country: 'peru',
      city: 'lima',
      neighborhood: 'barranco',
      countryName: 'Peru',
      cityName: 'Lima',
      neighborhoodName: 'Barranco',
      locationKey: 'peru|lima|barranco',
      parentKey: 'peru|lima',
      coverImage: { id: 91 },
      updatedAt: '2026-03-09T00:00:00.000Z',
    }

    const draft = buildDraftFromPayloadDoc(doc)

    expect(draft.payloadId).toBe(12)
    expect(draft.coverImage).toBe(91)
    expect(draft.locationKey).toBe('peru|lima|barranco')
    expect(draft.parentKey).toBe('peru|lima')
    expect(draft.hasUnsyncedPayloadChanges).toBe(false)
  })

  it('falls back to legacy Payload guide media only when top-level coverImage is absent', () => {
    const draft = buildDraftFromPayloadDoc({
      id: 12,
      level: 'city',
      country: 'peru',
      city: 'lima',
      locationKey: 'peru|lima',
      guide: {
        media: {
          coverImage: 91,
        },
      },
    })

    expect(draft.coverImage).toBe(91)
  })

  it('tracks Payload sync state from the image-only body', () => {
    const draft = createEmptyLocationDraft()
    draft.payloadId = 12
    draft.coverImage = 91

    const synced = markDraftAsPayloadSynced(draft, '2026-03-09T00:00:00.000Z')
    expect(synced.hasUnsyncedPayloadChanges).toBe(false)
    expect(synced.currentPayloadSignature).toBe(synced.lastPayloadSyncSignature)
    expect(synced.lastPayloadSyncSignature).toBeTruthy()

    const edited = refreshDraftPayloadSyncState({
      ...synced,
      coverImage: 92,
    })
    expect(edited.hasUnsyncedPayloadChanges).toBe(true)
  })

  it('requires an existing Payload location before syncing', () => {
    expect(validateDraft(createEmptyLocationDraft())).toBe('Open an existing Payload location before syncing.')
  })

  it('builds readable hierarchy titles', () => {
    const draft = createEmptyLocationDraft()
    draft.level = 'neighborhood'
    draft.country = 'peru'
    draft.city = 'lima'
    draft.neighborhood = 'barranco'
    draft.countryName = 'Peru'
    draft.cityName = 'Lima'
    draft.neighborhoodName = 'Barranco'

    expect(buildLocationHierarchyTitle(draft)).toBe('Barranco, Lima, Peru')
  })

  it('falls back to normalized hierarchy keys when display names are missing', () => {
    const draft = createEmptyLocationDraft()
    draft.level = 'neighborhood'
    draft.country = '  Côte d Ivoire! '
    draft.city = 'san--pedro'
    draft.neighborhood = 'le   bardot'

    expect(buildLocationHierarchyTitle(draft)).toBe('Le Bardot, San Pedro, Côte D Ivoire')
  })
})
