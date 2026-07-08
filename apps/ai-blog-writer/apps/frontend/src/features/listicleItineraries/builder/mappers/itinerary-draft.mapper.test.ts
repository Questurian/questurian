import { describe, expect, it } from 'vitest'
import type { PayloadItineraryDoc, PayloadRichText } from '../../types'
import { payloadDocToDraft } from './itinerary-draft.mapper'

function lexicalFromText(text: string): PayloadRichText {
  return {
    root: {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              text,
            },
          ],
        },
      ],
    },
  }
}

describe('payloadDocToDraft', () => {
  it('hydrates editable markdown fields from Payload Lexical rich text', () => {
    const doc: PayloadItineraryDoc = {
      id: 12,
      title: 'Weekend in Lima',
      location: 'peru|lima',
      header: {
        intro: lexicalFromText('Payload intro copy'),
        featuredImage: 101,
      },
      itineraryDays: [
        {
          id: 'day-one',
          whereStaying: [
            {
              id: 'stay-one',
              blockType: 'itinerary-where-staying',
              item: 201,
              mediaMode: 'photos',
              selectedPhotos: [301],
              blurb: lexicalFromText('Payload lodging blurb'),
            },
          ],
          items: [
            {
              id: 'stop-one',
              blockType: 'itinerary-dining',
              item: 202,
              mediaMode: 'photos',
              selectedPhotos: [302],
              blurb: lexicalFromText('Payload stop blurb'),
            },
          ],
        },
      ],
      status: 'draft',
      updatedAt: '2026-05-10T12:00:00.000Z',
    }

    const draft = payloadDocToDraft(doc, 'lit_local_1')

    expect(draft.draftId).toBe('lit_local_1')
    expect(draft.header.introMarkdown).toBe('Payload intro copy')
    expect(draft.days[0]?.whereStaying[0]?.blurbMarkdown).toBe('Payload lodging blurb')
    expect(draft.days[0]?.items[0]?.blurbMarkdown).toBe('Payload stop blurb')
    expect(draft.header.introJsonText).toContain('Payload intro copy')
    expect(draft.days[0]?.items[0]?.blurbJsonText).toContain('Payload stop blurb')
    expect(draft.lastPayloadSyncSignature).toBeTypeOf('string')
    expect(draft.hasUnsyncedPayloadChanges).toBe(false)
  })
})
