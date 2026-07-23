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
      hasUnsyncedPayloadChanges: true,
      lastPayloadSyncSignature: 'old-signature',
      in_update_mode: true,
      step2_in_update_mode: true,
      editorModelName: 'claude-opus-4-8',
      locationRef: null,
      sharedNeighborhoods: [253, 254],
      updatedAt: '2026-05-12T10:00:00.000Z'
    }

    expect(buildItineraryDraftSyncSignature(changedWorkflowOnly)).toBe(
      buildItineraryDraftSyncSignature(draft)
    )
  })

  it('changes when live Payload content changes', () => {
    const draft = createEmptyDraft()
    draft.payloadId = 15
    draft.title = 'Lima itinerary'
    draft.location = 'peru|lima'
    draft.header.introMarkdown = 'Intro copy'

    const changedContent = {
      ...draft,
      title: 'Updated Lima itinerary'
    }

    expect(buildItineraryDraftSyncSignature(changedContent)).not.toBe(
      buildItineraryDraftSyncSignature(draft)
    )
  })

  it('changes when a stop moment badge changes', () => {
    const draft = createEmptyDraft()
    draft.days[0].items = [
      {
        id: 'breakfast-stop',
        blockType: 'itinerary-dining',
        item: 10,
        moment: 'breakfast',
        momentLabel: 'Breakfast',
        tours: [],
        mediaMode: 'photos',
        selectedPhotos: [],
        selectedInstagramPost: null,
        title: '',
        operator: '',
        price: '',
        url: '',
        tourDuration: 1,
        startingPoint: { label: '', latitude: '', longitude: '' },
        keyLocations: [],
        image: null,
        instagramPost: null,
        blurbMarkdown: 'Start with a local classic.'
      }
    ]

    const changedMoment = {
      ...draft,
      days: [
        {
          ...draft.days[0],
          items: [
            {
              ...draft.days[0].items[0],
              moment: 'coffee' as const,
              momentLabel: 'Coffee break'
            }
          ]
        }
      ]
    }

    expect(buildItineraryDraftSyncSignature(changedMoment)).not.toBe(
      buildItineraryDraftSyncSignature(draft)
    )
  })
})
