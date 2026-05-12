import { BuilderSidebar as SharedBuilderSidebar } from '../../../shared/builder/components/BuilderSidebar'
import type { EditorAssistModelName } from '../../../staging/api'
import type { SingleTypeListicleDraft } from '../../types'
import { isSeoCoreComplete } from '../validators/submit.validators'
import { AiJobButtonContent } from './AiJobButtonContent'

type BuilderSidebarProps = {
  draft: SingleTypeListicleDraft
  completionPercent: number
  isSetupReady: boolean
  hasTargetCount: boolean
  stepIssues: string[]
  editorModelName: EditorAssistModelName
  onEditorModelChange: (modelName: string) => void
  isSaving: boolean
  isAutoWritingEmptyFields: boolean
  autoWriteEmptyFieldsQueueCount: number
  autoWriteEmptyFieldsStatus: string | null
  canAutoWriteEmptyFields: boolean
  onAutoWriteEmptyFields: () => Promise<void>
  onSaveLocalDraft: () => Promise<void>
  onSyncToPayload: () => Promise<void>
}

export function BuilderSidebar({
  draft,
  completionPercent,
  isSetupReady,
  hasTargetCount,
  stepIssues,
  editorModelName,
  onEditorModelChange,
  isSaving,
  isAutoWritingEmptyFields,
  autoWriteEmptyFieldsQueueCount,
  autoWriteEmptyFieldsStatus,
  canAutoWriteEmptyFields,
  onAutoWriteEmptyFields,
  onSaveLocalDraft,
  onSyncToPayload,
}: BuilderSidebarProps) {
  const hasTargetSelected = draft.targetItemCount > 0
  const targetDelta = draft.targetItemCount - draft.items.length
  const seoComplete = isSeoCoreComplete(draft)

  const autoWriteEmptyFieldsButtonClassName = [
    'stl-btn',
    'stl-btn-secondary',
    'stl-btn-ai-state',
    isAutoWritingEmptyFields ? 'stl-btn-ai-active' : '',
    !isAutoWritingEmptyFields && autoWriteEmptyFieldsQueueCount > 0 ? 'stl-btn-ai-queued' : '',
  ].filter(Boolean).join(' ')

  return (
    <SharedBuilderSidebar
      draft={draft}
      completionPercent={completionPercent}
      isSetupReady={isSetupReady}
      stepIssues={stepIssues}
      seoCoreComplete={seoComplete}
      stepThreeSyncIssueLabel="Items have unsaved changes."
      extraChecklistRow={(
        <li className={hasTargetCount ? 'done' : ''}>
          Target match: {hasTargetCount
            ? 'Met'
            : !hasTargetSelected
              ? 'Not set'
              : targetDelta > 0
                ? `Need ${targetDelta} more`
                : 'Above target'}
        </li>
      )}
      editorModelName={editorModelName}
      onEditorModelChange={onEditorModelChange}
      isSaving={isSaving}
      renderAutoWriteButton={() => (
        <button
          type="button"
          className={autoWriteEmptyFieldsButtonClassName}
          onClick={() => void onAutoWriteEmptyFields()}
          disabled={isSaving || isAutoWritingEmptyFields || !canAutoWriteEmptyFields}
        >
          <AiJobButtonContent
            isRunning={isAutoWritingEmptyFields}
            isQueued={autoWriteEmptyFieldsQueueCount > 0}
            runningLabel="Writing Empty Fields..."
            queuedLabel={`Empty Fields Queued${autoWriteEmptyFieldsQueueCount > 1 ? ` (${autoWriteEmptyFieldsQueueCount})` : ''}`}
            idleLabel="Auto Write Empty Fields"
          />
        </button>
      )}
      autoWriteStatusNote={autoWriteEmptyFieldsStatus}
      saveLocalDraftLabel="Save Local Draft"
      onSaveLocalDraft={onSaveLocalDraft}
      onSyncToPayload={onSyncToPayload}
    />
  )
}
