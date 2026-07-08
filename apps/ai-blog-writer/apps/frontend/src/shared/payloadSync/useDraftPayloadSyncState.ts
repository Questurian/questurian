import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import {
  payloadSyncFieldsEqual,
  refreshDraftPayloadSyncState,
  type PayloadSyncStateFields,
} from './draftPayloadSync'

type UseDraftPayloadSyncStateParams<TDraft extends PayloadSyncStateFields> = {
  draft: TDraft | null
  setDraft: Dispatch<SetStateAction<TDraft | null>>
  isLoading: boolean
  routeKey: string
  buildComparableShape: (draft: TDraft) => unknown
  hasPayloadIdentity?: (draft: TDraft) => boolean
  missingBaselineIsUnsynced?: boolean
  initializeMissingBaselineAsSynced?: boolean
}

export function useDraftPayloadSyncState<TDraft extends PayloadSyncStateFields>({
  draft,
  setDraft,
  isLoading,
  routeKey,
  buildComparableShape,
  hasPayloadIdentity,
  missingBaselineIsUnsynced,
  initializeMissingBaselineAsSynced,
}: UseDraftPayloadSyncStateParams<TDraft>) {
  const [hasUnsyncedPayloadChanges, setHasUnsyncedPayloadChanges] = useState(false)

  useEffect(() => {
    setHasUnsyncedPayloadChanges(false)
  }, [routeKey])

  useEffect(() => {
    if (isLoading || !draft) return

    const refreshed = refreshDraftPayloadSyncState(draft, buildComparableShape, {
      hasPayloadIdentity,
      missingBaselineIsUnsynced,
      initializeMissingBaselineAsSynced,
    })

    setHasUnsyncedPayloadChanges(Boolean(refreshed.hasUnsyncedPayloadChanges))

    if (payloadSyncFieldsEqual(draft, refreshed)) return

    setDraft((current) => {
      if (!current) return current

      const currentId = 'draftId' in current ? current.draftId : undefined
      const draftId = 'draftId' in draft ? draft.draftId : undefined
      if (currentId && draftId && currentId !== draftId) return current

      const next = refreshDraftPayloadSyncState(current, buildComparableShape, {
        hasPayloadIdentity,
        missingBaselineIsUnsynced,
        initializeMissingBaselineAsSynced,
      })

      return payloadSyncFieldsEqual(current, next) ? current : next
    })
  }, [
    buildComparableShape,
    draft,
    hasPayloadIdentity,
    initializeMissingBaselineAsSynced,
    isLoading,
    missingBaselineIsUnsynced,
    setDraft,
  ])

  return {
    hasUnsyncedPayloadChanges,
  }
}
