import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SingleTypeListicleDraft } from '../../types'
import { createEmptyDraft } from '../../storage'
import { markDraftAsPayloadSynced } from '../../../../shared/payloadSync/draftPayloadSync'
import { buildSingleTypeListicleDraftComparableShape } from '../utils/single-type-listicle-draft-sync-signature'
import { useAutoStructuredData } from './useAutoStructuredData'

function buildDraft(): SingleTypeListicleDraft {
  const draft = createEmptyDraft()
  draft.title = 'Best cafes in Lima'
  draft.location = 'peru|lima'
  draft.listicleType = 'dining'
  draft.step1_complete = true
  draft.step3_complete = true
  draft.header.introMarkdown = 'Where to drink coffee in Lima.'
  draft.seoSection.openGraph.url = 'https://example.com/best-cafes-in-lima'
  return draft
}

/**
 * Drives the hook the way the builder page does: the draft lives outside and
 * is fed back in, so a write has to survive a rerender to count.
 */
function renderAutoStructuredData(initialDraft: SingleTypeListicleDraft) {
  let draft: SingleTypeListicleDraft | null = initialDraft

  const setDraft = (
    next:
      | SingleTypeListicleDraft
      | null
      | ((current: SingleTypeListicleDraft | null) => SingleTypeListicleDraft | null),
  ) => {
    draft = typeof next === 'function' ? next(draft) : next
  }

  const view = renderHook(() =>
    useAutoStructuredData({
      draft,
      relatedItems: [],
      enabled: true,
      setDraft,
    }),
  )

  return {
    read: () => (draft?.seoSection.structuredData ?? '').trim(),
    readDraft: () => draft as SingleTypeListicleDraft,
    applyDraftPatch: (patch: Partial<SingleTypeListicleDraft>) => {
      draft = { ...(draft as SingleTypeListicleDraft), ...patch }
      act(() => view.rerender())
    },
  }
}

describe('useAutoStructuredData', () => {
  /**
   * The template's `dateModified` comes from `payloadUpdatedAt`, which Payload
   * bumps on every sync. Regenerating after a sync landed would rewrite the
   * field and re-raise the "Out of sync" banner the sync just cleared — with a
   * fresh timestamp each click, so it could never be cleared.
   */
  it('leaves a freshly synced draft alone', () => {
    const { read, readDraft, applyDraftPatch } = renderAutoStructuredData(buildDraft())

    const structuredDataBeforeSync = read()
    expect(structuredDataBeforeSync).not.toBe('')

    const syncedAt = '2026-03-05T09:00:00.000Z'
    const synced = markDraftAsPayloadSynced(
      { ...readDraft(), payloadId: 42, payloadUpdatedAt: syncedAt, updatedAt: syncedAt },
      buildSingleTypeListicleDraftComparableShape,
      syncedAt,
    )
    expect(synced.hasUnsyncedPayloadChanges).toBe(false)

    applyDraftPatch(synced)

    expect(read()).toBe(structuredDataBeforeSync)
    expect(readDraft().hasUnsyncedPayloadChanges).toBe(false)
  })

  it('still refreshes the template while the draft has unsynced changes', () => {
    const { read, applyDraftPatch } = renderAutoStructuredData(buildDraft())

    const structuredDataBeforeEdit = read()
    applyDraftPatch({
      payloadId: 42,
      payloadUpdatedAt: '2026-03-05T09:00:00.000Z',
      hasUnsyncedPayloadChanges: true,
    })

    expect(read()).not.toBe(structuredDataBeforeEdit)
  })

  it('fills an empty field on a synced draft that never had structured data', () => {
    const draft = buildDraft()
    draft.payloadId = 42
    draft.payloadUpdatedAt = '2026-03-05T09:00:00.000Z'
    draft.hasUnsyncedPayloadChanges = false

    const { read } = renderAutoStructuredData(draft)

    expect(read()).not.toBe('')
  })
})
