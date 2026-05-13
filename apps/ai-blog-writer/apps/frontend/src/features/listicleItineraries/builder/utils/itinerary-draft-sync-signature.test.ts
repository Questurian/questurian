import { describe, expect, it } from 'vitest'
import { createEmptyDraft } from '../../storage'
import { buildItineraryDraftSyncSignature } from './itinerary-draft-sync-signature'

describe('buildItineraryDraftSyncSignature', () => {
  it('ignores local-only workflow fields', () => {
    const draft = createEmptyDraft()
    draft.payloadId = 15
    draft.title = 'Lima itinerary'
    draft.location = 'peru|lima'
    draft.locationRef = 251
    draft.sharedNeighborhoods = [254, 253]
    draft.header.introMarkdown = 'Intro copy'

    const changedWorkflowOnly: typeof draft = {
      ...draft,
      hasLocalChanges: true,
      in_update_mode: true,
      step2_in_update_mode: true,
      editorModelName: 'gemini-2.5-pro',
      locationRef: null,
      sharedNeighborhoods: [253, 254],
      updatedAt: '2026-05-12T10:00:00.000Z',
    }

    expect(buildItineraryDraftSyncSignature(changedWorkflowOnly))
      .toBe(buildItineraryDraftSyncSignature(draft))
  })

  it('changes when live Payload content changes', () => {
    const draft = createEmptyDraft()
    draft.payloadId = 15
    draft.title = 'Lima itinerary'
    draft.location = 'peru|lima'
    draft.header.introMarkdown = 'Intro copy'

    const changedContent = {
      ...draft,
      title: 'Updated Lima itinerary',
    }

    expect(buildItineraryDraftSyncSignature(changedContent))
      .not.toBe(buildItineraryDraftSyncSignature(draft))
  })
})
