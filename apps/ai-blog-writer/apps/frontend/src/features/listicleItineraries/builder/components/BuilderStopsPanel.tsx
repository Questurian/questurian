import { MarkdownBlockEditor } from '../../../staging/features/markdown-editor'
import {
  BLOCK_TYPE_OPTIONS,
  DURATION_MINUTE_OPTIONS,
  PERIOD_OPTIONS,
  QUARTER_MINUTE_OPTIONS,
} from '../constants/builder-options.constants'
import type {
  DurationMinute,
  ItineraryBlockType,
  ItineraryItemBlock,
  ListicleItineraryDraft,
  Meridiem,
  QuarterMinute,
  RelatedItemOption,
} from '../../types'

type AiRewriteInput = {
  blockId: string
  currentContent: string
  prompt: string
  includeWholeArticleContext: boolean
}

type BuilderStopsPanelProps = {
  draft: ListicleItineraryDraft
  isLoadingRelated: boolean
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>
  onAddItem: () => void
  onEndHereOnLastStop: () => void
  onMoveItem: (itemId: string, direction: 'up' | 'down') => void
  onRemoveItem: (itemId: string) => void
  onUpdateItem: (
    itemId: string,
    updater: (item: ItineraryItemBlock) => ItineraryItemBlock,
    options?: { cascadeSchedule?: boolean },
  ) => void
  onStopBlurbAiRewrite: (itemId: string, input: AiRewriteInput) => Promise<string>
}

export function BuilderStopsPanel({
  draft,
  isLoadingRelated,
  relatedByBlockType,
  onAddItem,
  onEndHereOnLastStop,
  onMoveItem,
  onRemoveItem,
  onUpdateItem,
  onStopBlurbAiRewrite,
}: BuilderStopsPanelProps) {
  return (
    <section className="stl-panel">
      <div className="stl-panel-header">
        <h2>
          <span className="stl-kicker">Step 3</span> Stops & Timeline ({draft.items.length})
        </h2>
        <button type="button" className="stl-btn" onClick={onAddItem}>
          Add Stop
        </button>
      </div>
      <p className="stl-summary-note">Schedule assist: each stop chains from the previous stop.</p>

      {isLoadingRelated ? <p className="stl-placeholder">Loading related items...</p> : null}

      <div className="stl-list">
        {draft.items.map((item, index) => {
          const relatedOptions = relatedByBlockType[item.blockType] || []

          return (
            <article key={item.id} className="stl-item-card">
              <header className="stl-item-header">
                <h3>Item {index + 1}</h3>
                <div className="stl-inline-actions">
                  {index === draft.items.length - 1 ? (
                    <button type="button" className="stl-btn" onClick={onEndHereOnLastStop}>
                      End Here
                    </button>
                  ) : null}
                  <button type="button" className="stl-btn stl-btn-secondary" onClick={() => onMoveItem(item.id, 'up')}>
                    Up
                  </button>
                  <button
                    type="button"
                    className="stl-btn stl-btn-secondary"
                    onClick={() => onMoveItem(item.id, 'down')}
                  >
                    Down
                  </button>
                  <button type="button" className="stl-btn stl-btn-danger" onClick={() => onRemoveItem(item.id)}>
                    Remove
                  </button>
                </div>
              </header>

              <div className="stl-grid stl-grid-2">
                <label className="stl-field">
                  <span>Block Type *</span>
                  <select
                    value={item.blockType}
                    onChange={(event) =>
                      onUpdateItem(item.id, (current) => ({
                        ...current,
                        blockType: event.target.value as ItineraryBlockType,
                        item: null,
                      }))
                    }
                  >
                    {BLOCK_TYPE_OPTIONS.map((blockType) => (
                      <option key={blockType.value} value={blockType.value}>
                        {blockType.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="stl-field">
                  <span>Related Item *</span>
                  <select
                    value={item.item || ''}
                    onChange={(event) =>
                      onUpdateItem(item.id, (current) => ({
                        ...current,
                        item: event.target.value ? Number(event.target.value) : null,
                      }))
                    }
                  >
                    <option value="">Select item</option>
                    {relatedOptions.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        #{entry.id} {entry.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="stl-grid stl-grid-2">
                <div className="stl-field">
                  <span>Start Time * (auto-chained)</span>
                  <div className="stl-grid stl-grid-3">
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={item.timeHour}
                      onChange={(event) =>
                        onUpdateItem(item.id, (current) => ({
                          ...current,
                          timeHour: Number(event.target.value) || 0,
                        }), { cascadeSchedule: true })
                      }
                    />
                    <select
                      value={item.timeMinute}
                      onChange={(event) =>
                        onUpdateItem(item.id, (current) => ({
                          ...current,
                          timeMinute: event.target.value as QuarterMinute,
                        }), { cascadeSchedule: true })
                      }
                    >
                      {QUARTER_MINUTE_OPTIONS.map((minute) => (
                        <option key={minute} value={minute}>
                          {minute}
                        </option>
                      ))}
                    </select>
                    <select
                      value={item.timePeriod}
                      onChange={(event) =>
                        onUpdateItem(item.id, (current) => ({
                          ...current,
                          timePeriod: event.target.value as Meridiem,
                        }), { cascadeSchedule: true })
                      }
                    >
                      {PERIOD_OPTIONS.map((period) => (
                        <option key={period} value={period}>
                          {period}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="stl-field">
                  <span>Duration *</span>
                  <div className="stl-grid stl-grid-2">
                    <input
                      type="number"
                      min={0}
                      max={24}
                      value={item.durationHours}
                      onChange={(event) =>
                        onUpdateItem(item.id, (current) => ({
                          ...current,
                          durationHours: Number(event.target.value) || 0,
                        }), { cascadeSchedule: true })
                      }
                    />
                    <select
                      value={item.durationMinutes}
                      onChange={(event) =>
                        onUpdateItem(item.id, (current) => ({
                          ...current,
                          durationMinutes: event.target.value as DurationMinute,
                        }), { cascadeSchedule: true })
                      }
                    >
                      {DURATION_MINUTE_OPTIONS.map((minute) => (
                        <option key={minute} value={minute}>
                          {minute} min
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <label className="stl-field">
                <span>Blurb *</span>
                <MarkdownBlockEditor
                  blockId={`${item.id}_blurb`}
                  value={item.blurbMarkdown}
                  onChange={(nextValue) =>
                    onUpdateItem(item.id, (current) => ({
                      ...current,
                      blurbMarkdown: nextValue,
                      blurbJsonText: '',
                    }))
                  }
                  showToolbar
                  enforceHeadingStructure={false}
                  onAiRewrite={(input) => onStopBlurbAiRewrite(item.id, input)}
                  placeholder="Write editorial context for this stop..."
                  className="stl-markdown-textarea"
                  rows={5}
                />
              </label>
              {!item.blurbMarkdown.trim() && item.blurbJsonText?.trim() ? (
                <p className="stl-legacy-note">This blurb currently exists as Lexical JSON in Payload. Editing here will replace it.</p>
              ) : null}
            </article>
          )
        })}
      </div>
    </section>
  )
}
