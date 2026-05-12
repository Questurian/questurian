import { BuilderHeaderPanel as SharedBuilderHeaderPanel } from '../../../shared/builder/components/BuilderHeaderPanel'
import type { MediaAssetOption, SingleTypeListicleDraft } from '../../types'
import { AiJobButtonContent } from './AiJobButtonContent'

type AiRewriteInput = {
  blockId: string
  currentContent: string
  prompt: string
  includeWholeArticleContext: boolean
}

type BuilderHeaderPanelProps = {
  draft: SingleTypeListicleDraft
  token: string | null
  locationRef: number | null
  mediaAssets: MediaAssetOption[]
  updateHeader: (next: Partial<SingleTypeListicleDraft['header']>) => void
  onIntroAiAutoWrite: () => Promise<void>
  onIntroAiRewrite: (input: AiRewriteInput) => Promise<string>
  isIntroAiGenerating: boolean
  introAiQueueCount: number
  introAiStatus: string | null
  isLocked: boolean
  isSynced?: boolean
  onContinueStep2: () => void
  onUpdateStep2: () => void
  onSaveStep2: () => void
  onCancelStep2Update: () => void
}

export function BuilderHeaderPanel({
  draft,
  token,
  locationRef,
  mediaAssets,
  updateHeader,
  onIntroAiAutoWrite,
  onIntroAiRewrite,
  isIntroAiGenerating,
  introAiQueueCount,
  introAiStatus,
  isLocked,
  isSynced = false,
  onContinueStep2,
  onUpdateStep2,
  onSaveStep2,
  onCancelStep2Update,
}: BuilderHeaderPanelProps) {
  const introAiState = isIntroAiGenerating ? 'running' : introAiQueueCount > 0 ? 'queued' : 'idle'
  const introAiButtonClassName = [
    'stl-btn',
    'stl-btn-secondary',
    'stl-btn-ai-state',
    'stl-btn-ai-inline',
    introAiState === 'running' ? 'stl-btn-ai-active' : '',
    introAiState === 'queued' ? 'stl-btn-ai-queued' : '',
  ].filter(Boolean).join(' ')

  return (
    <SharedBuilderHeaderPanel
      draft={draft}
      token={token}
      locationRef={locationRef}
      mediaAssets={mediaAssets}
      updateHeader={updateHeader}
      onIntroAiRewrite={onIntroAiRewrite}
      isLocked={isLocked}
      isSynced={isSynced}
      onContinueStep2={onContinueStep2}
      onUpdateStep2={onUpdateStep2}
      onSaveStep2={onSaveStep2}
      onCancelStep2Update={onCancelStep2Update}
      headerPreviewTitleFallback="Your article headline will appear here"
      introPlaceholder="Write the listicle intro..."
      uploadExternalRefBase={`${draft.draftId}-featured-upload`}
      uploadFileNameTitle={draft.title || 'single-type-listicle'}
      introLabelRowExtraClassName="stl-ai-field-label-row"
      introActionsExtraClassName="stl-ai-field-actions"
      renderIntroAiActions={() => (
        <button
          type="button"
          className={introAiButtonClassName}
          onClick={() => void onIntroAiAutoWrite()}
          disabled={isIntroAiGenerating}
        >
          <AiJobButtonContent
            isRunning={isIntroAiGenerating}
            isQueued={introAiQueueCount > 0}
            runningLabel="Writing..."
            queuedLabel={`Queued${introAiQueueCount > 1 ? ` (${introAiQueueCount})` : ''}`}
            idleLabel={draft.header.introMarkdown.trim() ? 'Regenerate' : 'Auto Write'}
          />
        </button>
      )}
      renderIntroEditorWrapper={(editor) => (
        <div className={`stl-ai-editor-shell stl-ai-editor-shell--${introAiState}`}>
          {introAiState !== 'idle' ? (
            <div className="stl-ai-editor-indicator" role="status" aria-live="polite">
              <span className="stl-ai-editor-indicator-pill">
                <span className="stl-ai-editor-spinner" aria-hidden="true" />
                <span>{introAiStatus}</span>
              </span>
            </div>
          ) : null}
          {editor}
        </div>
      )}
    />
  )
}
