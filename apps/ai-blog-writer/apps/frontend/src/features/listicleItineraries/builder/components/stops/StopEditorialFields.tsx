import { MarkdownBlockEditor } from '../../../../../shared/markdown-editor'
import type { ItineraryItemBlock, ListicleAngle } from '../../../types'
import type { getItineraryAngleOptions } from '../../../types'
import { StopReasonField } from '../StopReasonField'
import type { ComposeStopReasonResult } from '../../services/compose-stop-reason.service'

type Props = {
  item: ItineraryItemBlock
  section: 'whereStaying' | 'stops'
  localIndex: number
  angleOptions: ReturnType<typeof getItineraryAngleOptions>
  angleDisabledReason?: string
  activeAiItemId: string | null
  isLocked: boolean
  onUpdateItem: (
    itemId: string,
    updater: (item: ItineraryItemBlock) => ItineraryItemBlock
  ) => void
  onStopBlurbAiAutoWrite: (itemId: string) => Promise<void>
  onRefineStopReason: (
    itemId: string,
    roughReason: string
  ) => Promise<ComposeStopReasonResult>
}

export function StopEditorialFields({
  item,
  section,
  localIndex,
  angleOptions,
  angleDisabledReason,
  activeAiItemId,
  isLocked,
  onUpdateItem,
  onStopBlurbAiAutoWrite,
  onRefineStopReason
}: Props) {
  return (
    <>
      <div className="stl-field">
        <div className="stl-field-label-row stl-blurb-label-row">
          <span>Blurb *</span>
          <div className="stl-inline-actions stl-blurb-actions">
            {angleOptions.length > 0 ? (
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
                  onUpdateItem(item.id, (current) => ({
                    ...current,
                    angle: next === '' ? null : (next as ListicleAngle)
                  }))
                }}
                aria-label={
                  section === 'whereStaying'
                    ? `Blurb angle for lodging ${localIndex + 1}`
                    : `Blurb angle for stop ${localIndex + 1}`
                }
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
            ) : null}
            <button
              type="button"
              className="stl-btn stl-btn-secondary"
              onClick={() => void onStopBlurbAiAutoWrite(item.id)}
              disabled={
                activeAiItemId === item.id || Boolean(angleDisabledReason)
              }
              title={angleDisabledReason}
            >
              {activeAiItemId === item.id
                ? 'Writing...'
                : item.blurbMarkdown.trim()
                  ? 'Regenerate'
                  : 'Auto Write'}
            </button>
          </div>
        </div>
        <MarkdownBlockEditor
          blockId={`${item.id}_blurb`}
          value={item.blurbMarkdown}
          onChange={(nextValue) =>
            onUpdateItem(item.id, (current) => ({
              ...current,
              blurbMarkdown: nextValue,
              blurbJsonText: ''
            }))
          }
          showToolbar
          enforceHeadingStructure={false}
          placeholder="Write editorial context for this stop..."
          className="stl-markdown-textarea"
          rows={5}
          ariaLabel={
            section === 'whereStaying'
              ? `Blurb for lodging ${localIndex + 1}`
              : `Blurb for stop ${localIndex + 1}`
          }
        />
      </div>
      {!item.blurbMarkdown.trim() && item.blurbJsonText?.trim() ? (
        <p className="stl-legacy-note">
          This blurb currently exists as Lexical JSON in Payload. Editing here
          will replace it.
        </p>
      ) : null}

      <StopReasonField
        item={item}
        disabled={isLocked}
        onUpdateItem={onUpdateItem}
        onRefineStopReason={onRefineStopReason}
      />
    </>
  )
}
