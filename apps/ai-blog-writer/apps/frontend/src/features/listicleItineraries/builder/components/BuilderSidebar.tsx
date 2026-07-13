import { BuilderSidebar as SharedBuilderSidebar } from '../../../../shared/builder/components/BuilderSidebar'
import type { EditorAssistModelName } from '../../../staging/api'
import type { ListicleItineraryDraft } from '../../types'
import { isSeoCoreComplete } from '../validators/step.validators'

type BuilderSidebarProps = {
  completionPercent: number
  draft: ListicleItineraryDraft
  isSetupReady: boolean
  editorModelName: EditorAssistModelName
  onEditorModelChange: (modelName: string) => void
  isSaving: boolean
  isRevertingToPayload: boolean
  isAutoWritingEmptyFields: boolean
  canAutoWriteEmptyFields: boolean
  stepIssues: string[]
  onAutoWriteEmptyFields: () => Promise<void>
  onSaveLocalDraft: () => Promise<void>
  onSyncToPayload: () => Promise<void>
  onRevertToPayload: () => Promise<void>
}

export function BuilderSidebar({
  completionPercent,
  draft,
  isSetupReady,
  editorModelName,
  onEditorModelChange,
  isSaving,
  isRevertingToPayload,
  isAutoWritingEmptyFields,
  canAutoWriteEmptyFields,
  stepIssues,
  onAutoWriteEmptyFields,
  onSaveLocalDraft,
  onSyncToPayload,
  onRevertToPayload,
}: BuilderSidebarProps) {
  const isPublishedPayload = draft.payloadStatus === 'published' || draft.status === 'published'

  return (
    <SharedBuilderSidebar
      draft={draft}
      completionPercent={completionPercent}
      isSetupReady={isSetupReady}
      stepIssues={stepIssues}
      seoCoreComplete={isSeoCoreComplete(draft)}
      stepThreeSyncIssueLabel="Stops have unsaved changes."
      requiresStep2Lock={false}
      showPublishedBadge
      editorModelName={editorModelName}
      onEditorModelChange={onEditorModelChange}
      isSaving={isSaving}
      renderAutoWriteButton={() => (
        <button
          type="button"
          className="stl-btn stl-btn-secondary"
          onClick={() => void onAutoWriteEmptyFields()}
          disabled={isSaving || isRevertingToPayload || isAutoWritingEmptyFields || !canAutoWriteEmptyFields}
        >
          {isAutoWritingEmptyFields ? 'Writing Empty Fields...' : 'Auto Write Empty Fields'}
        </button>
      )}
      saveLocalDraftLabel="Save Local Draft (Browser)"
      revertToPayloadLabel={isPublishedPayload ? 'Revert to Last Published' : 'Revert to Payload Draft'}
      onSaveLocalDraft={onSaveLocalDraft}
      onRevertToPayload={onRevertToPayload}
      isRevertingToPayload={isRevertingToPayload}
      onSyncToPayload={onSyncToPayload}
    />
  )
}
