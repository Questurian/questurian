import { useMemo } from 'react'
import type {
  EditorialStageUiEvent,
  PublishPhase,
  PublishResult
} from '../state/editorialStageUiMachine'
import type { EditorialPublishLifecycle } from '../services/editorial-stage-publish-workflow.service'

type UseEditorialStagePublishUiParams = {
  dispatchUi: (event: EditorialStageUiEvent) => void
  publishPhase: PublishPhase
  publishResult: PublishResult
}

export function useEditorialStagePublishUi({
  dispatchUi,
  publishPhase,
  publishResult
}: UseEditorialStagePublishUiParams) {
  const lifecycle = useMemo<EditorialPublishLifecycle>(
    () => ({
      request: () => dispatchUi({ type: 'PUBLISH_REQUEST' }),
      converting: () => dispatchUi({ type: 'PUBLISH_CONVERTING' }),
      submitting: () => dispatchUi({ type: 'PUBLISH_SUBMITTING' }),
      succeed: (message) => dispatchUi({ type: 'PUBLISH_SUCCESS', message }),
      fail: (message) => dispatchUi({ type: 'PUBLISH_FAILURE', message })
    }),
    [dispatchUi]
  )

  return {
    lifecycle,
    isPublishing:
      publishPhase === 'validating' ||
      publishPhase === 'converting' ||
      publishPhase === 'publishing',
    isConverting: publishPhase === 'converting',
    publishResult
  }
}
