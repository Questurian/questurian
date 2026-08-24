import type { SingleTypeListicleDraft } from '../../types'

export function getListicleSyncTargetStatus(
  draft: SingleTypeListicleDraft
): 'draft' | 'published' {
  return draft.payloadStatus === 'published' || draft.status === 'published'
    ? 'published'
    : 'draft'
}
