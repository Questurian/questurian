import { describe, expect, it } from 'vitest'

import {
  buildDraftFromPayloadDoc,
  buildLocationHierarchyTitle,
  buildPayloadLocationBody,
  buildPayloadSyncSignature,
  createEmptyLocationDraft,
  markDraftAsPayloadSynced,
  payloadLocationToDraft,
  refreshDraftPayloadSyncState,
  resolveLocationDraftRef,
  sanitizeLocationDraftShape,
  validateDraft,
} from './schema'
import type { LocationOption, PayloadLocationDoc } from './types'

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
    const draft = payloadLocationToDraft({
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
    expect(synced.lastPayloadSyncSignature).toBe(buildPayloadSyncSignature(synced))

    const edited = refreshDraftPayloadSyncState({
      ...synced,
      coverImage: 92,
    })
    expect(edited.hasUnsyncedPayloadChanges).toBe(true)
  })

  it('requires an existing Payload location before syncing', () => {
    expect(validateDraft(createEmptyLocationDraft())).toBe(
      'Open an existing Payload location before syncing.',
    )
  })

  it('builds readable hierarchy titles and resolves existing location refs', () => {
    const draft = createEmptyLocationDraft()
    draft.level = 'neighborhood'
    draft.country = 'peru'
    draft.city = 'lima'
    draft.neighborhood = 'barranco'
    draft.countryName = 'Peru'
    draft.cityName = 'Lima'
    draft.neighborhoodName = 'Barranco'

    const options: LocationOption[] = [
      {
        id: 44,
        level: 'neighborhood',
        country: 'peru',
        city: 'lima',
        neighborhood: 'barranco',
        countryName: 'Peru',
        cityName: 'Lima',
        neighborhoodName: 'Barranco',
        locationKey: 'peru|lima|barranco',
      },
    ]

    expect(buildLocationHierarchyTitle(draft)).toBe('Barranco, Lima, Peru')
    expect(resolveLocationDraftRef(draft, options)).toBe(44)
  })
})
