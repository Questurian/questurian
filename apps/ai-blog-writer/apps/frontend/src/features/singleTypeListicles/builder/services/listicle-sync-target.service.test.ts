import { describe, expect, it } from 'vitest'
import { createEmptyDraft } from '../../storage'
import { getListicleSyncTargetStatus } from './listicle-sync-target.service'

describe('getListicleSyncTargetStatus', () => {
  it('preserves published status when updating an existing Payload document', () => {
    const draft = createEmptyDraft()
    draft.payloadId = 11
    draft.payloadStatus = 'published'
    draft.status = 'published'

    expect(getListicleSyncTargetStatus(draft)).toBe('published')
  })

  it('keeps draft documents as drafts', () => {
    expect(getListicleSyncTargetStatus(createEmptyDraft())).toBe('draft')
  })
})
