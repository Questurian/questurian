import { describe, expect, it } from 'vitest'
import { createEmptyDraft } from '../../storage'
import { buildSingleTypeListicleDraftSyncSignature } from './single-type-listicle-draft-sync-signature'

describe('buildSingleTypeListicleDraftSyncSignature', () => {
  it('ignores local-only workflow and sync fields', () => {
    const draft = createEmptyDraft()
    draft.payloadId = 15
    draft.title = 'Lima restaurants'
    draft.location = 'peru|lima'
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
      updatedAt: '2026-05-12T10:00:00.000Z',
    }

    expect(buildSingleTypeListicleDraftSyncSignature(changedWorkflowOnly))
      .toBe(buildSingleTypeListicleDraftSyncSignature(draft))
  })

  it('changes when live Payload content changes', () => {
    const draft = createEmptyDraft()
    draft.payloadId = 15
    draft.title = 'Lima restaurants'
    draft.location = 'peru|lima'
    draft.header.introMarkdown = 'Intro copy'

    const changedContent = {
      ...draft,
      title: 'Updated Lima restaurants',
    }

    expect(buildSingleTypeListicleDraftSyncSignature(changedContent))
      .not.toBe(buildSingleTypeListicleDraftSyncSignature(draft))
  })
})
