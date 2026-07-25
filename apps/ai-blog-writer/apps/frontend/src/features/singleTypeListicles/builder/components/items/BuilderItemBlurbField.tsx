import type { Dispatch, SetStateAction } from 'react'
import { MarkdownBlockEditor } from '../../../../../shared/markdown-editor'
import type {
  ListicleAngle,
  ListicleItemBlock,
  SingleTypeListicleDraft
} from '../../../types'
import { getListicleAngleOptions } from '../../../types'
import { AiJobButtonContent } from '../AiJobButtonContent'

type Props = {
  item: ListicleItemBlock
  index: number
  listicleType: SingleTypeListicleDraft['listicleType']
  hasSelectedRelatedItem: boolean
  updateItem: (
    itemId: string,
    updater: (item: ListicleItemBlock) => ListicleItemBlock
  ) => void
  onItemBlurbAiAutoWrite: (itemId: string) => Promise<void>
  onItemBlurbInspect: (itemId: string, index: number) => void
  hasInspectableSteps: boolean
  activeAiItemId: string | null
  queuedAiCount: number
  setGuidelinePreviewItemId: Dispatch<SetStateAction<string | null>>
}

export function BuilderItemBlurbField({
  item,
  index,
  listicleType,
  hasSelectedRelatedItem,
  updateItem,
  onItemBlurbAiAutoWrite,
  onItemBlurbInspect,
  hasInspectableSteps,
  activeAiItemId,
  queuedAiCount,
  setGuidelinePreviewItemId
}: Props) {
  const angleOptions = getListicleAngleOptions(listicleType)
  const aiState =
    activeAiItemId === item.id
      ? 'running'
      : queuedAiCount > 0
        ? 'queued'
        : 'idle'
  const aiStatusLabel =
    activeAiItemId === item.id
      ? 'Waiting for AI response...'
      : queuedAiCount > 0
        ? 'Queued. Waiting for earlier AI response...'
        : null
  const aiButtonClassName = [
    'stl-btn',
    'stl-btn-secondary',
    'stl-btn-ai-state',
    'stl-btn-ai-inline',
    aiState === 'running' ? 'stl-btn-ai-active' : '',
    aiState === 'queued' ? 'stl-btn-ai-queued' : ''
  ]
    .filter(Boolean)
    .join(' ')

  if (!hasSelectedRelatedItem) return null

  return (
    <>
      <div className="stl-field">
        <div className="stl-field-label-row stl-ai-field-label-row">
          <span>Blurb *</span>
          <div className="stl-inline-actions stl-ai-field-actions">
            <select
              className="stl-field-input stl-angle-select"
              value={
                item.angle &&
                angleOptions.some((option) => option.value === item.angle)
                  ? item.angle
                  : ''
              }
              onChange={(event) => {
                const next = event.target.value
                updateItem(item.id, (current) => ({
                  ...current,
                  angle: next === '' ? null : (next as ListicleAngle)
                }))
              }}
              aria-label={`Blurb angle for item ${index + 1}`}
              title="Blurb angle — operator must select one before generating"
            >
              <option value="" disabled>
                Select an angle…
              </option>
              {angleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="stl-btn stl-btn-secondary stl-btn-guideline-preview"
              onClick={() => setGuidelinePreviewItemId(item.id)}
              aria-label={`Preview prompt guidance for item ${index + 1}`}
              title="Preview the angle and tone guidance injected into the AI prompt"
            >
              ⓘ
            </button>
            <button
              type="button"
              className={aiButtonClassName}
              onClick={() => void onItemBlurbAiAutoWrite(item.id)}
              disabled={activeAiItemId === item.id || !item.angle}
              title={
                !item.angle ? 'Select an angle before generating' : undefined
              }
            >
              <AiJobButtonContent
                isRunning={activeAiItemId === item.id}
                isQueued={queuedAiCount > 0}
                runningLabel="Writing..."
                queuedLabel={`Queued${queuedAiCount > 1 ? ` (${queuedAiCount})` : ''}`}
                idleLabel={
                  item.blurbMarkdown.trim() ? 'Regenerate' : 'Auto Write'
                }
              />
            </button>
            <button
              type="button"
              className="stl-btn stl-btn-secondary stl-btn-inspect"
              onClick={() => onItemBlurbInspect(item.id, index)}
              disabled={!hasInspectableSteps && activeAiItemId !== item.id}
              title="Inspect the AI pipeline for this blurb (prompts, model, validation, retry)"
            >
              Inspect
            </button>
          </div>
        </div>
        <div className={`stl-ai-editor-shell stl-ai-editor-shell--${aiState}`}>
          {aiState !== 'idle' && aiStatusLabel ? (
            <div
              className="stl-ai-editor-indicator"
              role="status"
              aria-live="polite"
            >
              <span className="stl-ai-editor-indicator-pill">
                <span className="stl-ai-editor-spinner" aria-hidden="true" />
                <span>{aiStatusLabel}</span>
              </span>
            </div>
          ) : null}
          <MarkdownBlockEditor
            blockId={`${item.id}_blurb`}
            value={item.blurbMarkdown}
            onChange={(nextValue) =>
              updateItem(item.id, (current) => ({
                ...current,
                blurbMarkdown: nextValue,
                blurbJsonText: ''
              }))
            }
            showToolbar
            enforceHeadingStructure={false}
            placeholder="Write why this item made the list..."
            className="stl-markdown-textarea"
            rows={5}
            ariaLabel={`Blurb for item ${index + 1}`}
          />
        </div>
      </div>
      {!item.blurbMarkdown.trim() && item.blurbJsonText?.trim() ? (
        <p className="stl-legacy-note">
          This blurb currently exists as Lexical JSON in Payload. Editing here
          will replace it.
        </p>
      ) : null}
    </>
  )
}
