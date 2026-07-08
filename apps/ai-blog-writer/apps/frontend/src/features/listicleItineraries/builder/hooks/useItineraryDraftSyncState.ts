import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useState } from 'react'
import { useBuilderAutosave } from '../../../../shared/builder/hooks/useBuilderAutosave'
import { markDraftAsPayloadUnsynced } from '../../../../shared/payloadSync/draftPayloadSync'
import { useDraftPayloadSyncState } from '../../../../shared/payloadSync/useDraftPayloadSyncState'
import { fetchItineraryById } from '../../api'
import { saveDraft } from '../../storage'
import type { ListicleItineraryDraft } from '../../types'
import { payloadDocToDraft } from '../mappers/itinerary-draft.mapper'
import { buildItineraryDraftComparableShape } from '../utils/itinerary-draft-sync-signature'

type UseItineraryDraftSyncStateParams = {
  token?: string | null
  draft: ListicleItineraryDraft | null
  setDraft: Dispatch<SetStateAction<ListicleItineraryDraft | null>>
  isLoading: boolean
  payloadIdParam: string | null
  draftIdParam: string | null
  onError: (message: string) => void
  setResult: Dispatch<SetStateAction<string | null>>
}

export function useItineraryDraftSyncState({
  token,
  draft,
  setDraft,
  isLoading,
  payloadIdParam,
  draftIdParam,
  onError,
  setResult,
}: UseItineraryDraftSyncStateParams) {
  const [isRevertingToPayload, setIsRevertingToPayload] = useState(false)

  const isSynced = Boolean(draft?.payloadId)
  const routeKey = `${payloadIdParam ?? ''}:${draftIdParam ?? ''}`
  const { hasUnsyncedPayloadChanges } = useDraftPayloadSyncState({
    draft,
    setDraft,
    isLoading,
    routeKey,
    buildComparableShape: buildItineraryDraftComparableShape,
    initializeMissingBaselineAsSynced: true,
  })

  useBuilderAutosave(draft, saveDraft)

  const onSyncResult = useCallback((message: string | null) => {
    setResult(message)
  }, [setResult])

  const saveLocalDraft = useCallback(async (): Promise<void> => {
    if (!draft) return
    const nextDraft = markDraftAsPayloadUnsynced(draft, buildItineraryDraftComparableShape)
    setDraft(nextDraft)
    saveDraft(nextDraft)
    onError('')
    setResult('Saved local draft in this browser only (not synced to Payload).')
  }, [draft, onError, setDraft, setResult])

  const revertToPayloadVersion = useCallback(async (): Promise<void> => {
    if (!draft?.payloadId) return
    if (!token) {
      onError('You must be logged in to reload from Payload.')
      return
    }

    const isPublishedPayload = draft.payloadStatus === 'published' || draft.status === 'published'
    const confirmed = window.confirm(
      isPublishedPayload
        ? 'Discard local staged changes and reload the current published Payload version? Payload will not be changed.'
        : 'Discard local staged changes and reload the current Payload draft? Payload will not be changed.',
    )
    if (!confirmed) return

    onError('')
    setResult(null)
    setIsRevertingToPayload(true)

    try {
      const doc = await fetchItineraryById(draft.payloadId, token)
      const nextDraft = payloadDocToDraft(doc, draft.draftId)
      nextDraft.editorModelName = draft.editorModelName

      setDraft(nextDraft)
      saveDraft(nextDraft)
      setResult(isPublishedPayload ? 'Reverted to last published Payload version.' : 'Reverted to current Payload draft.')
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to reload from Payload.')
    } finally {
      setIsRevertingToPayload(false)
    }
  }, [draft, onError, setDraft, setResult, token])

  return {
    hasUnsyncedPayloadChanges,
    isRevertingToPayload,
    isSynced,
    onSyncResult,
    saveLocalDraft,
    revertToPayloadVersion,
  }
}
