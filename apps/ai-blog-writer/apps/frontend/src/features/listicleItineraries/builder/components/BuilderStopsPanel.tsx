import { useEffect, useState } from 'react'
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
  MediaMode,
  Meridiem,
  QuarterMinute,
  RelatedItemOption,
} from '../../types'
import {
  getRelatedInstagramPostObjects,
  getRelatedPhotoObjects,
  requiresInstagram,
  requiresPhotos,
  resolveInstagramEmbedUrl,
  resolveInstagramPreviewUrl,
  resolveImageUrl,
} from '../utils/item-media.utils'
import { InstagramPickerModal } from './InstagramPickerModal'
import { PhotoPickerModal } from './PhotoPickerModal'
import { RelatedItemPickerModal } from './RelatedItemPickerModal'

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
  isLocked: boolean
  onContinueStep3: () => void
  onUpdateStep3: () => void
  onSaveStep3: () => void
  onCancelStep3Update: () => void
}

const MEDIA_MODE_OPTIONS: Array<{ value: MediaMode; label: string }> = [
  { value: 'photos', label: 'Photos' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'both', label: 'Photos + Instagram' },
]

function getAvailableMediaModeOptions(hasPhotos: boolean, hasInstagram: boolean): Array<{ value: MediaMode; label: string }> {
  if (hasPhotos && hasInstagram) return MEDIA_MODE_OPTIONS
  if (hasPhotos) return MEDIA_MODE_OPTIONS.filter((option) => option.value === 'photos')
  if (hasInstagram) return MEDIA_MODE_OPTIONS.filter((option) => option.value === 'instagram')
  return []
}

type ActivePicker =
  | { type: 'item'; itemId: string }
  | { type: 'photos'; itemId: string }
  | { type: 'instagram'; itemId: string }
  | null

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
  isLocked,
  onContinueStep3,
  onUpdateStep3,
  onSaveStep3,
  onCancelStep3Update,
}: BuilderStopsPanelProps) {
  const [activePicker, setActivePicker] = useState<ActivePicker>(null)
  const [copiedItemId, setCopiedItemId] = useState<string | null>(null)
  const [copyErrorItemId, setCopyErrorItemId] = useState<string | null>(null)
  const [photoPreviewIndexByItem, setPhotoPreviewIndexByItem] = useState<Record<string, number>>({})
  const [activeInstagramEmbedPreviewItemId, setActiveInstagramEmbedPreviewItemId] = useState<string | null>(null)

  const activeItemPicker = activePicker?.type === 'item' ? activePicker : null
  const activePhotoPicker = activePicker?.type === 'photos' ? activePicker : null
  const activeInstagramPicker = activePicker?.type === 'instagram' ? activePicker : null

  useEffect(() => {
    if (!copiedItemId) return
    const timer = window.setTimeout(() => setCopiedItemId(null), 1800)
    return () => window.clearTimeout(timer)
  }, [copiedItemId])

  useEffect(() => {
    if (!activeInstagramEmbedPreviewItemId) return

    const { body, documentElement } = document
    const previousBodyOverflow = body.style.overflow
    const previousBodyPaddingRight = body.style.paddingRight
    const previousHtmlOverflow = documentElement.style.overflow
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth

    body.style.overflow = 'hidden'
    documentElement.style.overflow = 'hidden'

    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`
    }

    return () => {
      body.style.overflow = previousBodyOverflow
      body.style.paddingRight = previousBodyPaddingRight
      documentElement.style.overflow = previousHtmlOverflow
    }
  }, [activeInstagramEmbedPreviewItemId])

  useEffect(() => {
    draft.items.forEach((item) => {
      const relatedOptions = relatedByBlockType[item.blockType] || []
      const selectedRelatedItem = relatedOptions.find((entry) => entry.id === item.item) || null
      const hasPhotos = getRelatedPhotoObjects(selectedRelatedItem).length > 0
      const hasInstagram = getRelatedInstagramPostObjects(selectedRelatedItem).length > 0
      const availableOptions = getAvailableMediaModeOptions(hasPhotos, hasInstagram)

      if (availableOptions.length === 0) return
      if (availableOptions.some((option) => option.value === item.mediaMode)) return

      const fallbackMode = availableOptions[0].value
      onUpdateItem(item.id, (current) => ({
        ...current,
        mediaMode: fallbackMode,
        selectedPhotos: requiresPhotos(fallbackMode) ? current.selectedPhotos : [],
        selectedInstagramPost: requiresInstagram(fallbackMode) ? current.selectedInstagramPost : null,
      }))
    })
  }, [draft.items, onUpdateItem, relatedByBlockType])

  const handleCopyRelatedItemTitle = async (itemId: string, title: string) => {
    if (!title.trim()) return
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable')
      }
      await navigator.clipboard.writeText(title)
      setCopiedItemId(itemId)
      setCopyErrorItemId(null)
    } catch {
      setCopiedItemId(null)
      setCopyErrorItemId(itemId)
    }
  }

  return (
    <section className="stl-panel">
      <div className="stl-panel-header">
        <h2>
          <span className="stl-kicker">Step 3</span> Stops & Timeline ({draft.items.length})
        </h2>
        <div className="stl-inline-actions">
          <button type="button" className="stl-btn" onClick={onAddItem} disabled={isLocked}>
            Add Stop
          </button>
          {!draft.step3_complete ? (
            <button type="button" className="stl-btn" onClick={onContinueStep3}>
              Continue
            </button>
          ) : null}
          {draft.step3_complete && !draft.step3_in_update_mode ? (
            <button type="button" className="stl-btn stl-btn-secondary" onClick={onUpdateStep3}>
              Update Stops
            </button>
          ) : null}
          {draft.step3_in_update_mode ? (
            <>
              <button type="button" className="stl-btn" onClick={onSaveStep3}>
                Save Stops
              </button>
              <button type="button" className="stl-btn stl-btn-secondary" onClick={onCancelStep3Update}>
                Cancel
              </button>
            </>
          ) : null}
        </div>
      </div>
      <p className="stl-summary-note">Schedule assist: each stop chains from the previous stop.</p>

      <fieldset className="stl-panel-fieldset" disabled={isLocked}>
        {isLoadingRelated ? <p className="stl-placeholder">Loading related items...</p> : null}

        <div className="stl-list">
          {draft.items.map((item, index) => {
            const relatedOptions = relatedByBlockType[item.blockType] || []
            const selectedRelatedItem = relatedOptions.find((entry) => entry.id === item.item) || null
            const photoObjects = getRelatedPhotoObjects(selectedRelatedItem)
            const instagramPostObjects = getRelatedInstagramPostObjects(selectedRelatedItem)
            const hasPhotosAvailable = photoObjects.length > 0
            const hasInstagramAvailable = instagramPostObjects.length > 0
            const availableMediaModeOptions = getAvailableMediaModeOptions(hasPhotosAvailable, hasInstagramAvailable)
            const effectiveMediaMode =
              availableMediaModeOptions.find((option) => option.value === item.mediaMode)?.value
              ?? availableMediaModeOptions[0]?.value
              ?? null
            const modeNeedsPhotos = effectiveMediaMode ? requiresPhotos(effectiveMediaMode) : false
            const modeNeedsInstagram = effectiveMediaMode ? requiresInstagram(effectiveMediaMode) : false
            const selectedInstagramPost = instagramPostObjects.find(
              (post) => post.id === item.selectedInstagramPost,
            ) || null
            const selectedInstagramEmbedUrl = selectedInstagramPost
              ? resolveInstagramEmbedUrl(selectedInstagramPost)
              : undefined
            const selectedInstagramPreviewUrl = selectedInstagramPost
              ? resolveInstagramPreviewUrl(selectedInstagramPost)
              : undefined
            const firstItemPhoto = photoObjects[0]
            const firstItemPhotoUrl = firstItemPhoto ? resolveImageUrl(firstItemPhoto) : undefined
            const isLastItem = index === draft.items.length - 1
            const selectedPhotoPreviews = item.selectedPhotos
              .map((photoId) => {
                const photo = photoObjects.find((p) => p.id === photoId)
                const url = photo ? resolveImageUrl(photo) : undefined
                return url ? { id: photoId, url } : null
              })
              .filter((entry): entry is { id: number; url: string } => Boolean(entry))
            const photoPreviewCount = selectedPhotoPreviews.length
            const activePhotoPreviewIndex = Math.min(
              photoPreviewIndexByItem[item.id] ?? 0,
              Math.max(photoPreviewCount - 1, 0),
            )
            const activePhotoPreview = selectedPhotoPreviews[activePhotoPreviewIndex]

            return (
              <article key={item.id} className="stl-item-card">
                <header className="stl-item-header">
                  <h3>Item {index + 1}</h3>
                  <div className="stl-inline-actions">
                    {isLastItem ? (
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
                          selectedPhotos: [],
                          selectedInstagramPost: null,
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

                  <div className="stl-field">
                    <span>Related Item *</span>
                    <button
                      type="button"
                      className="stl-picker-trigger"
                      onClick={() => setActivePicker({ type: 'item', itemId: item.id })}
                    >
                      <span className="stl-picker-trigger__preview">
                        {selectedRelatedItem ? (
                          <>
                            {firstItemPhotoUrl && (
                              <img src={firstItemPhotoUrl} alt="" />
                            )}
                            <span className="stl-picker-trigger__label">{selectedRelatedItem.title}</span>
                          </>
                        ) : (
                          <span className="stl-picker-trigger__label stl-picker-trigger__label--placeholder">
                            Select item...
                          </span>
                        )}
                      </span>
                      <span className="stl-picker-trigger__caret">▼</span>
                    </button>
                    {selectedRelatedItem ? (
                      <>
                        <div className="stl-copyable-item-row">
                          <input
                            type="text"
                            className="stl-copyable-item-input"
                            value={selectedRelatedItem.title}
                            readOnly
                            onFocus={(event) => event.currentTarget.select()}
                            onClick={(event) => event.currentTarget.select()}
                            aria-label="Selected related item title"
                          />
                          <button
                            type="button"
                            className={`stl-btn ${copiedItemId === item.id ? 'stl-btn-success' : 'stl-btn-secondary'} stl-copyable-item-btn`}
                            onClick={() => void handleCopyRelatedItemTitle(item.id, selectedRelatedItem.title)}
                          >
                            {copiedItemId === item.id ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                        {copyErrorItemId === item.id ? (
                          <p className="stl-legacy-note">Clipboard blocked. Select the text field and press Cmd/Ctrl+C.</p>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>

                {selectedRelatedItem ? (
                  <label className="stl-field">
                    <span>Media Mode *</span>
                    {availableMediaModeOptions.length > 0 ? (
                      <select
                        value={effectiveMediaMode ?? ''}
                        onChange={(event) =>
                          onUpdateItem(item.id, (current) => {
                            const nextMode = event.target.value as MediaMode
                            if (nextMode === 'photos') {
                              return { ...current, mediaMode: nextMode, selectedInstagramPost: null }
                            }
                            if (nextMode === 'instagram') {
                              return { ...current, mediaMode: nextMode, selectedPhotos: [] }
                            }
                            return { ...current, mediaMode: nextMode }
                          })
                        }
                      >
                        {availableMediaModeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="stl-media-mode-empty">
                        No photos or Instagram posts are available for this related item.
                      </p>
                    )}
                  </label>
                ) : (
                  <p className="stl-legacy-note">Select a related item to unlock media options and blurb.</p>
                )}

                {modeNeedsPhotos ? (
                  <div className="stl-field">
                    <span>Selected Photos * (1-6)</span>
                    {photoPreviewCount > 0 ? (
                      <div className="stl-item-photo-preview">
                        <button
                          type="button"
                          className="stl-item-photo-preview__media"
                          onClick={() => setActivePicker({ type: 'photos', itemId: item.id })}
                        >
                          {activePhotoPreview ? (
                            <img src={activePhotoPreview.url} alt="" />
                          ) : (
                            <div className="stl-item-photo-preview__fallback">Photos selected</div>
                          )}
                          <span className="stl-item-photo-preview__count">
                            {activePhotoPreviewIndex + 1}/{photoPreviewCount}
                          </span>
                        </button>
                        {photoPreviewCount > 1 ? (
                          <>
                            <button
                              type="button"
                              className="stl-item-photo-preview__nav stl-item-photo-preview__nav--prev"
                              aria-label={`Show previous photo for item ${index + 1}`}
                              onClick={() =>
                                setPhotoPreviewIndexByItem((prev) => ({
                                  ...prev,
                                  [item.id]:
                                    (activePhotoPreviewIndex - 1 + photoPreviewCount) % photoPreviewCount,
                                }))
                              }
                            >
                              ‹
                            </button>
                            <button
                              type="button"
                              className="stl-item-photo-preview__nav stl-item-photo-preview__nav--next"
                              aria-label={`Show next photo for item ${index + 1}`}
                              onClick={() =>
                                setPhotoPreviewIndexByItem((prev) => ({
                                  ...prev,
                                  [item.id]:
                                    (activePhotoPreviewIndex + 1) % photoPreviewCount,
                                }))
                              }
                            >
                              ›
                            </button>
                          </>
                        ) : null}
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="stl-picker-trigger"
                        disabled={!selectedRelatedItem}
                        onClick={() => setActivePicker({ type: 'photos', itemId: item.id })}
                      >
                        <span className="stl-picker-trigger__preview">
                          <span className="stl-picker-trigger__label stl-picker-trigger__label--placeholder">
                            Select photos...
                          </span>
                        </span>
                        <span className="stl-picker-trigger__caret">▼</span>
                      </button>
                    )}
                    {!selectedRelatedItem ? (
                      <p className="stl-legacy-note">Select a related item to choose photos.</p>
                    ) : null}
                    {selectedRelatedItem && photoObjects.length === 0 ? (
                      <p className="stl-legacy-note">The selected related item has no gallery photos available.</p>
                    ) : null}
                  </div>
                ) : null}

                {modeNeedsInstagram ? (
                  <div className="stl-field">
                    <span>Selected Instagram Post *</span>
                    {selectedInstagramPost ? (
                      <button
                        type="button"
                        className="stl-picker-trigger stl-picker-trigger--instagram-preview"
                        onClick={() => setActiveInstagramEmbedPreviewItemId(item.id)}
                      >
                        <span className="stl-picker-trigger__preview">
                          {selectedInstagramPreviewUrl ? (
                            <img src={selectedInstagramPreviewUrl} alt="" />
                          ) : (
                            <span className="stl-picker-trigger__thumb-empty" />
                          )}
                          <span className="stl-picker-trigger__label">{selectedInstagramPost.title}</span>
                        </span>
                        <span className="stl-picker-trigger__caret">Preview</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="stl-picker-trigger"
                        disabled={!selectedRelatedItem}
                        onClick={() => setActivePicker({ type: 'instagram', itemId: item.id })}
                      >
                        <span className="stl-picker-trigger__preview">
                          <span className="stl-picker-trigger__label stl-picker-trigger__label--placeholder">
                            Select Instagram post...
                          </span>
                        </span>
                        <span className="stl-picker-trigger__caret">▼</span>
                      </button>
                    )}
                    {!selectedRelatedItem ? (
                      <p className="stl-legacy-note">Select a related item to choose an Instagram post.</p>
                    ) : null}
                    {selectedRelatedItem && instagramPostObjects.length === 0 ? (
                      <p className="stl-legacy-note">The selected related item has no Instagram posts available.</p>
                    ) : null}
                  </div>
                ) : null}

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

                <RelatedItemPickerModal
                  isOpen={activeItemPicker?.itemId === item.id}
                  items={relatedOptions}
                  selectedItemId={item.item}
                  onSelect={(nextId) =>
                    onUpdateItem(item.id, (current) => {
                      const nextRelatedItem = relatedOptions.find((entry) => entry.id === nextId) || null
                      const nextHasPhotos = getRelatedPhotoObjects(nextRelatedItem).length > 0
                      const nextHasInstagram = getRelatedInstagramPostObjects(nextRelatedItem).length > 0
                      const nextAvailableModes = getAvailableMediaModeOptions(nextHasPhotos, nextHasInstagram)
                      const nextMediaMode =
                        nextAvailableModes.find((option) => option.value === current.mediaMode)?.value
                        ?? nextAvailableModes[0]?.value
                        ?? current.mediaMode

                      return {
                        ...current,
                        item: nextId,
                        mediaMode: nextMediaMode,
                        selectedPhotos: [],
                        selectedInstagramPost: null,
                      }
                    })
                  }
                  onClose={() => setActivePicker(null)}
                />

                <PhotoPickerModal
                  isOpen={activePhotoPicker?.itemId === item.id}
                  photoObjects={photoObjects}
                  selectedPhotoIds={item.selectedPhotos}
                  onConfirm={(ids) =>
                    onUpdateItem(item.id, (current) => ({
                      ...current,
                      selectedPhotos: ids,
                    }))
                  }
                  onClose={() => setActivePicker(null)}
                />

                <InstagramPickerModal
                  isOpen={activeInstagramPicker?.itemId === item.id}
                  posts={instagramPostObjects}
                  selectedPostId={item.selectedInstagramPost}
                  onSelect={(nextId) =>
                    onUpdateItem(item.id, (current) => ({
                      ...current,
                      selectedInstagramPost: nextId,
                    }))
                  }
                  onClose={() => setActivePicker(null)}
                />

                {activeInstagramEmbedPreviewItemId === item.id ? (
                  <div
                    className="stl-modal-overlay"
                    onClick={(event) => {
                      if (event.target === event.currentTarget) {
                        setActiveInstagramEmbedPreviewItemId(null)
                      }
                    }}
                  >
                    <div
                      className="stl-picker-modal stl-picker-modal--instagram-preview"
                      role="dialog"
                      aria-modal="true"
                      aria-label="Instagram embed preview"
                    >
                      <div className="stl-picker-modal__header">
                        <h3>{selectedInstagramPost?.title || 'Instagram Post Preview'}</h3>
                        <button
                          type="button"
                          className="stl-picker-modal__close"
                          onClick={() => setActiveInstagramEmbedPreviewItemId(null)}
                          aria-label="Close"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="stl-instagram-embed-modal__body">
                        {selectedInstagramEmbedUrl ? (
                          <div className="stl-instagram-embed-modal__frame-wrap">
                            <iframe
                              src={selectedInstagramEmbedUrl}
                              title={`Instagram post embed for item ${index + 1}`}
                              className="stl-instagram-embed-modal__frame"
                              loading="lazy"
                              allow="encrypted-media; fullscreen; picture-in-picture"
                            />
                          </div>
                        ) : selectedInstagramPreviewUrl ? (
                          <div className="stl-instagram-embed-modal__image-wrap">
                            <img src={selectedInstagramPreviewUrl} alt="" />
                          </div>
                        ) : (
                          <div className="stl-instagram-embed-modal__empty">
                            Preview unavailable for this post.
                          </div>
                        )}
                      </div>

                      <div className="stl-picker-modal__footer">
                        <button
                          type="button"
                          className="stl-btn stl-btn-secondary"
                          onClick={() => {
                            setActiveInstagramEmbedPreviewItemId(null)
                            setActivePicker({ type: 'instagram', itemId: item.id })
                          }}
                        >
                          Change Post
                        </button>
                        <button
                          type="button"
                          className="stl-btn stl-btn-success"
                          onClick={() => setActiveInstagramEmbedPreviewItemId(null)}
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      </fieldset>
    </section>
  )
}
