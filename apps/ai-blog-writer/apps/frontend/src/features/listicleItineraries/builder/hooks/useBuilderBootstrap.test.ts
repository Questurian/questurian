import { describe, expect, it } from 'vitest'
import { createEmptyDraft } from '../../storage'
import { buildItineraryDraftSyncSignature } from '../utils/itinerary-draft-sync-signature'
import { mergeLocalIntoPayloadDraft } from './useBuilderBootstrap'

describe('mergeLocalIntoPayloadDraft', () => {
  it('clears stale local-change marker when local content matches Payload', () => {
    const payloadDraft = createEmptyDraft()
    payloadDraft.draftId = 'payload-draft'
    payloadDraft.payloadId = 15
    payloadDraft.payloadStatus = 'published'
    payloadDraft.title = 'Payload title'
    payloadDraft.location = 'peru|lima'

    const localDraft = {
      ...payloadDraft,
      draftId: 'local-draft',
      hasLocalChanges: true,
    }

    const merged = mergeLocalIntoPayloadDraft(payloadDraft, localDraft)

    expect(merged.draftId).toBe('local-draft')
    expect(merged.hasLocalChanges).toBe(false)
    expect(merged.payloadSyncBaseline).toBe(buildItineraryDraftSyncSignature(payloadDraft))
  })

  it('preserves real local content changes over fresh Payload metadata', () => {
    const payloadDraft = createEmptyDraft()
    payloadDraft.payloadId = 15
    payloadDraft.payloadStatus = 'published'
    payloadDraft.title = 'Payload title'
    payloadDraft.location = 'peru|lima'

    const localDraft = {
      ...payloadDraft,
      draftId: 'local-draft',
      title: 'Local edited title',
      hasLocalChanges: true,
    }

    const merged = mergeLocalIntoPayloadDraft(payloadDraft, localDraft)

    expect(merged.title).toBe('Local edited title')
    expect(merged.payloadStatus).toBe('published')
    expect(merged.hasLocalChanges).toBe(true)
    expect(merged.payloadSyncBaseline).toBe(buildItineraryDraftSyncSignature(payloadDraft))
  })
})
