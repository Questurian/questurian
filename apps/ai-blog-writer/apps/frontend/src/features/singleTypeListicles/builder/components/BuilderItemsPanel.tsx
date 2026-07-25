import { useEffect, useState } from 'react'
import { getRelatedItemDisplayLabel } from '../../../../shared/related-items/normalizeRelatedItems'
import { MarkdownBlockEditor } from '../../../../shared/markdown-editor'
import { getBlockTypeForListicleType } from '../../api'
import type { ListicleAngle, ListicleItemBlock, MediaMode, RelatedItemOption, SingleTypeListicleDraft } from '../../types'
import { getListicleAngleOptions, resolveListicleAngleForBlockType, TOUR_PICKS_MAX } from '../../types'
import {
  getLinkedTourObjects,
  getRelatedInstagramPostObjects,
  getRelatedPhotoObjects,
  requiresInstagram,
  requiresPhotos,
  resolveInstagramEmbedUrl,
  resolveImageUrl,
  resolveInstagramPreviewUrl,
} from '../../../../shared/builder/utils/item-media.utils'
import { InstagramPickerModal } from '../../../../shared/builder/components/InstagramPickerModal'
import { PhotoPickerModal } from '../../../../shared/builder/components/PhotoPickerModal'
import { RelatedItemPickerModal } from '../../../../shared/builder/components/RelatedItemPickerModal'
import { AiJobButtonContent } from './AiJobButtonContent'
import { AngleGuidelinePreviewModal } from './AngleGuidelinePreviewModal'
import { fetchListicleGuidelines } from '../../../staging/api'
import type { ListicleGuidelinesResponse } from '../../../staging/api'

type BuilderItemsPanelProps = {
  draft: SingleTypeListicleDraft
  relatedItems: RelatedItemOption[]
  isLoadingRelated: boolean
  moveItem: (itemId: string, direction: 'up' | 'down') => void
  removeItem: (itemId: string) => void
  updateItem: (itemId: string, updater: (item: ListicleItemBlock) => ListicleItemBlock) => void
  onItemBlurbAiAutoWrite: (itemId: string) => Promise<void>
  onItemBlurbInspect: (itemId: string, index: number) => void
  hasInspectableStepsByItemId: Record<string, boolean>
  activeAiItemId: string | null
  queuedAiItemIds: string[]
  isLocked: boolean
  isSynced?: boolean
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

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map((entry) => entry.trim())
}

function getRelatedItemIdealFor(relatedItem: RelatedItemOption | null): string[] {
  if (!relatedItem) return []

  const raw = relatedItem as RelatedItemOption & Record<string, unknown>
  return readStringArray(raw.idealFor ?? raw.ideal_for)
}

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

export function BuilderItemsPanel({
  draft,
  relatedItems,
  isLoadingRelated,
  moveItem,
  removeItem,
  updateItem,
  onItemBlurbAiAutoWrite,
  onItemBlurbInspect,
  hasInspectableStepsByItemId,
  activeAiItemId,
  queuedAiItemIds,
  isLocked,
  isSynced = false,
  onContinueStep3,
  onUpdateStep3,
  onSaveStep3,
  onCancelStep3Update,
}: BuilderItemsPanelProps) {
  const [activePicker, setActivePicker] = useState<ActivePicker>(null)
  const [copiedItemId, setCopiedItemId] = useState<string | null>(null)
  const [copyErrorItemId, setCopyErrorItemId] = useState<string | null>(null)
  const [photoPreviewIndexByItem, setPhotoPreviewIndexByItem] = useState<Record<string, number>>({})
  const [activeInstagramEmbedPreviewItemId, setActiveInstagramEmbedPreviewItemId] = useState<string | null>(null)
  const [guidelinePreviewItemId, setGuidelinePreviewItemId] = useState<string | null>(null)
  const [guidelines, setGuidelines] = useState<ListicleGuidelinesResponse | null>(null)
  const [guidelinesLoading, setGuidelinesLoading] = useState(false)
  const [guidelinesError, setGuidelinesError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setGuidelinesLoading(true)
    fetchListicleGuidelines()
      .then((res) => {
        if (cancelled) return
        setGuidelines(res)
        setGuidelinesError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setGuidelinesError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (cancelled) return
        setGuidelinesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const activeItemPicker = activePicker?.type === 'item' ? activePicker : null
  const activePhotoPicker = activePicker?.type === 'photos' ? activePicker : null
  const activeInstagramPicker = activePicker?.type === 'instagram' ? activePicker : null
  const angleOptions = getListicleAngleOptions(draft.listicleType)

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
    if (!draft.listicleType) return
    const expectedBlockType = getBlockTypeForListicleType(draft.listicleType)
    const validAngles = new Set(getListicleAngleOptions(draft.listicleType).map((option) => option.value))

    draft.items.forEach((item) => {
      const normalizedAngle = resolveListicleAngleForBlockType(
        expectedBlockType,
        item.blockType === expectedBlockType && item.angle && validAngles.has(item.angle)
          ? item.angle
          : null,
      )
      if (
        item.blockType === expectedBlockType
        && (item.angle ?? null) === normalizedAngle
      ) {
        return
      }
      updateItem(item.id, (current) => ({
        ...current,
        blockType: expectedBlockType,
        angle: normalizedAngle,
      }))
    })
  }, [draft.items, draft.listicleType, updateItem])

  useEffect(() => {
    draft.items.forEach((item) => {
      const selectedRelatedItem = relatedItems.find((entry) => entry.id === item.item) || null
      const hasPhotos = getRelatedPhotoObjects(selectedRelatedItem).length > 0
      const hasInstagram = getRelatedInstagramPostObjects(selectedRelatedItem).length > 0
      const availableOptions = getAvailableMediaModeOptions(hasPhotos, hasInstagram)

      if (availableOptions.length === 0) return
      if (availableOptions.some((option) => option.value === item.mediaMode)) return

      const fallbackMode = availableOptions[0].value
      updateItem(item.id, (current) => ({
        ...current,
        mediaMode: fallbackMode,
        selectedPhotos: requiresPhotos(fallbackMode) ? current.selectedPhotos : [],
        selectedInstagramPost: requiresInstagram(fallbackMode) ? current.selectedInstagramPost : null,
      }))
    })
  }, [draft.items, relatedItems, updateItem])

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

  const guidelinePreviewItem = guidelinePreviewItemId
    ? draft.items.find((entry) => entry.id === guidelinePreviewItemId) ?? null
    : null
  const guidelinePreviewIndex = guidelinePreviewItem
    ? draft.items.findIndex((entry) => entry.id === guidelinePreviewItemId)
    : -1

  return (
    <section className="stl-panel">
      <AngleGuidelinePreviewModal
        isOpen={guidelinePreviewItem !== null}
        onClose={() => setGuidelinePreviewItemId(null)}
        itemLabel={
          guidelinePreviewItem
            ? `Item ${guidelinePreviewIndex + 1}`
            : ''
        }
        itemAngle={guidelinePreviewItem?.angle ?? null}
        listTone={draft.listTone}
        guidelines={guidelines}
        isLoading={guidelinesLoading}
        error={guidelinesError}
      />
      <div className="stl-panel-header">
        <h2>
          {!isSynced ? <span className="stl-kicker">Step 3</span> : null}
          Items ({draft.items.length}/{draft.targetItemCount})
        </h2>
        {!isSynced ? (
          <div className="stl-inline-actions">
            {!draft.step3_complete ? (
              <button type="button" className="stl-btn" onClick={onContinueStep3}>
                Continue
              </button>
            ) : null}
            {draft.step3_complete && !draft.step3_in_update_mode ? (
              <button type="button" className="stl-btn stl-btn-secondary" onClick={onUpdateStep3}>
                Update Items
              </button>
            ) : null}
            {draft.step3_in_update_mode ? (
              <>
                <button type="button" className="stl-btn" onClick={onSaveStep3}>
                  Save Items
                </button>
                <button type="button" className="stl-btn stl-btn-secondary" onClick={onCancelStep3Update}>
                  Cancel
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <fieldset className="stl-panel-fieldset" disabled={!isSynced && isLocked}>
        {isLoadingRelated ? <p className="stl-placeholder">Loading related items...</p> : null}
        {!isLoadingRelated && draft.listicleType && relatedItems.length === 0 ? (
          <p className="stl-placeholder">No published items found for selected location/type.</p>
        ) : null}

        <div className="stl-list">
          {draft.items.map((item, index) => {
          const selectedRelatedItem = relatedItems.find((entry) => entry.id === item.item) || null
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
            (p) => p.id === item.selectedInstagramPost,
          ) || null
          const selectedInstagramEmbedUrl = selectedInstagramPost
            ? resolveInstagramEmbedUrl(selectedInstagramPost)
            : undefined
          const selectedInstagramPreviewUrl = selectedInstagramPost
            ? resolveInstagramPreviewUrl(selectedInstagramPost)
            : undefined

          const firstItemPhoto = photoObjects[0]
          const firstItemPhotoUrl = firstItemPhoto ? resolveImageUrl(firstItemPhoto) : undefined
          const idealForValues = draft.listicleType === 'dining'
            ? getRelatedItemIdealFor(selectedRelatedItem)
            : []
          const linkedTours = item.blockType === 'data-attractions'
            ? getLinkedTourObjects(selectedRelatedItem)
            : []
          const staleTourPickIds = item.blockType === 'data-attractions' && selectedRelatedItem
            ? item.tours.filter((tourId) => !linkedTours.some((tour) => tour.id === tourId))
            : []
          const selectedRelatedItemLabel = getRelatedItemDisplayLabel(selectedRelatedItem)
          const isFirstItem = index === 0
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
          const queuedAiCount = queuedAiItemIds.filter((queuedItemId) => queuedItemId === item.id).length
          const aiStatusLabel = activeAiItemId === item.id
            ? 'Waiting for AI response...'
            : queuedAiCount > 0
              ? 'Queued. Waiting for earlier AI response...'
              : null
          const aiState = activeAiItemId === item.id
            ? 'running'
            : queuedAiCount > 0
              ? 'queued'
              : 'idle'
          const aiButtonClassName = [
            'stl-btn',
            'stl-btn-secondary',
            'stl-btn-ai-state',
            'stl-btn-ai-inline',
            aiState === 'running' ? 'stl-btn-ai-active' : '',
            aiState === 'queued' ? 'stl-btn-ai-queued' : '',
          ].filter(Boolean).join(' ')

          return (
            <article key={item.id} className="stl-item-card">
              <header className="stl-item-header">
                <h3>Item {index + 1}</h3>
                <div className="stl-inline-actions stl-item-actions">
                  {!isFirstItem ? (
                    <button
                      type="button"
                      className="stl-item-action-btn stl-item-action-btn--move"
                      onClick={() => moveItem(item.id, 'up')}
                      aria-label={`Move item ${index + 1} up`}
                      title="Move up"
                    >
                      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                        <path d="M8 3.2 3.7 7.5l1.1 1.1 2.4-2.4V13h1.6V6.2l2.4 2.4 1.1-1.1z" />
                      </svg>
                    </button>
                  ) : null}
                  {!isLastItem ? (
                    <button
                      type="button"
                      className="stl-item-action-btn stl-item-action-btn--move"
                      onClick={() => moveItem(item.id, 'down')}
                      aria-label={`Move item ${index + 1} down`}
                      title="Move down"
                    >
                      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                        <path d="M8 12.8 12.3 8.5l-1.1-1.1-2.4 2.4V3H7.2v6.8L4.8 7.4 3.7 8.5z" />
                      </svg>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="stl-item-action-btn stl-item-action-btn--remove"
                    onClick={() => removeItem(item.id)}
                    aria-label={`Remove item ${index + 1}`}
                    title="Remove item"
                  >
                    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                      <path d="M6.7 2h2.6l.6 1h3v1.4H3.1V3h3zm-1 4h1.4v6.1H5.7zm3.2 0h1.4v6.1H8.9zM4.4 5h7.2v8.1c0 .5-.4.9-.9.9H5.3c-.5 0-.9-.4-.9-.9z" />
                    </svg>
                  </button>
                </div>
              </header>

              <div className="stl-item-setup-fields">
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
                          <span className="stl-picker-trigger__label">{selectedRelatedItemLabel}</span>
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
                          value={selectedRelatedItemLabel}
                          readOnly
                          onFocus={(event) => event.currentTarget.select()}
                          onClick={(event) => event.currentTarget.select()}
                          aria-label="Selected related item title"
                        />
                        <button
                          type="button"
                          className={`stl-btn ${copiedItemId === item.id ? 'stl-btn-success' : 'stl-btn-secondary'} stl-copyable-item-btn`}
                          onClick={() => void handleCopyRelatedItemTitle(item.id, selectedRelatedItemLabel)}
                        >
                          {copiedItemId === item.id ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      {copyErrorItemId === item.id ? (
                        <p className="stl-legacy-note">Clipboard blocked. Select the text field and press Cmd/Ctrl+C.</p>
                      ) : null}
                      {draft.listicleType === 'dining' ? (
                        <label className="stl-field">
                          <span>Ideal For</span>
                          <textarea
                            className="stl-readonly-field"
                            value={idealForValues.join(', ')}
                            readOnly
                            rows={idealForValues.length > 2 ? 3 : 2}
                            placeholder="No ideal-for tags saved for this restaurant."
                          />
                          <p className="stl-legacy-note">View only. Update the related dining entry to change this.</p>
                        </label>
                      ) : null}
                    </>
                  ) : null}
                </div>
                {selectedRelatedItem ? (
                  <label className="stl-field">
                    <span>Media Mode *</span>
                    {availableMediaModeOptions.length > 0 ? (
                      <select
                        value={effectiveMediaMode ?? ''}
                        onChange={(event) =>
                          updateItem(item.id, (current) => {
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
              </div>

              {item.blockType === 'data-attractions' && selectedRelatedItem && linkedTours.length > 0 ? (
                <div className="stl-field">
                  <div className="stl-field-label-row">
                    <span>Tour Picks</span>
                    <span className="stl-tour-duration-badge">
                      {item.tours.length}/{TOUR_PICKS_MAX}
                    </span>
                  </div>
                  <p className="stl-legacy-note">
                    Feature up to {TOUR_PICKS_MAX} of this attraction's linked tours, in the order you pick them.
                    Tour titles, prices, and booking links stay live from Location Manager.
                  </p>
                  <div className="stl-tour-picks">
                    {linkedTours.map((tour) => {
                      const pickIndex = item.tours.indexOf(tour.id)
                      const isPicked = pickIndex !== -1
                      const atCap = !isPicked && item.tours.length >= TOUR_PICKS_MAX

                      return (
                        <label
                          key={tour.id}
                          className={`stl-tour-pick-row${isPicked ? ' stl-tour-pick-row--picked' : ''}${atCap ? ' stl-tour-pick-row--disabled' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={isPicked}
                            disabled={atCap}
                            onChange={() =>
                              updateItem(item.id, (current) => {
                                if (current.tours.includes(tour.id)) {
                                  return {
                                    ...current,
                                    tours: current.tours.filter((tourId) => tourId !== tour.id),
                                  }
                                }
                                if (current.tours.length >= TOUR_PICKS_MAX) {
                                  return current
                                }
                                return { ...current, tours: [...current.tours, tour.id] }
                              })
                            }
                          />
                          <span className="stl-tour-pick-row__order">
                            {isPicked ? `#${pickIndex + 1}` : ''}
                          </span>
                          <span className="stl-tour-pick-row__title">
                            {tour.title?.trim() || `Tour #${tour.id}`}
                          </span>
                          {tour.price?.trim() ? (
                            <span className="stl-tour-pick-row__price">{tour.price}</span>
                          ) : null}
                        </label>
                      )
                    })}
                  </div>
                  {staleTourPickIds.length > 0 ? (
                    <p className="stl-tour-picks__stale-warning">
                      {staleTourPickIds.length} saved tour pick{staleTourPickIds.length === 1 ? ' is' : 's are'} no
                      longer linked to this attraction in Location Manager and will block syncing.{' '}
                      <button
                        type="button"
                        className="stl-btn stl-btn-secondary stl-btn-xs"
                        onClick={() =>
                          updateItem(item.id, (current) => ({
                            ...current,
                            tours: current.tours.filter(
                              (tourId) => !staleTourPickIds.includes(tourId),
                            ),
                          }))
                        }
                      >
                        Remove stale picks
                      </button>
                    </p>
                  ) : null}
                </div>
              ) : null}

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
                    <>
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
                    </>
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

              {selectedRelatedItem ? (
                <>
                  <div className="stl-field">
                    <div className="stl-field-label-row stl-ai-field-label-row">
                      <span>Blurb *</span>
                      <div className="stl-inline-actions stl-ai-field-actions">
                        <select
                          className="stl-field-input stl-angle-select"
                          value={item.angle && angleOptions.some((option) => option.value === item.angle) ? item.angle : ''}
                          onChange={(event) => {
                            const next = event.target.value
                            updateItem(item.id, (current) => ({
                              ...current,
                              angle: next === '' ? null : (next as ListicleAngle),
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
                          title={!item.angle ? 'Select an angle before generating' : undefined}
                        >
                          <AiJobButtonContent
                            isRunning={activeAiItemId === item.id}
                            isQueued={queuedAiCount > 0}
                            runningLabel="Writing..."
                            queuedLabel={`Queued${queuedAiCount > 1 ? ` (${queuedAiCount})` : ''}`}
                            idleLabel={item.blurbMarkdown.trim() ? 'Regenerate' : 'Auto Write'}
                          />
                        </button>
                        <button
                          type="button"
                          className="stl-btn stl-btn-secondary stl-btn-inspect"
                          onClick={() => onItemBlurbInspect(item.id, index)}
                          disabled={
                            !hasInspectableStepsByItemId[item.id] && activeAiItemId !== item.id
                          }
                          title="Inspect the AI pipeline for this blurb (prompts, model, validation, retry)"
                        >
                          Inspect
                        </button>
                      </div>
                    </div>
                    <div className={`stl-ai-editor-shell stl-ai-editor-shell--${aiState}`}>
                      {aiState !== 'idle' && aiStatusLabel ? (
                        <div className="stl-ai-editor-indicator" role="status" aria-live="polite">
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
                            blurbJsonText: '',
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
                      This blurb currently exists as Lexical JSON in Payload. Editing here will replace it.
                    </p>
                  ) : null}
                </>
              ) : null}

              {/* Related item picker modal */}
              <RelatedItemPickerModal
                isOpen={activeItemPicker?.itemId === item.id}
                items={relatedItems}
                selectedItemId={item.item}
                onSelect={(nextId) =>
                  updateItem(item.id, (current) => {
                    const nextRelatedItem = relatedItems.find((entry) => entry.id === nextId) || null
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
                      // Tour Picks belong to the previous attraction's linked list.
                      tours: nextId === current.item ? current.tours : [],
                      mediaMode: nextMediaMode,
                      selectedPhotos: [],
                      selectedInstagramPost: null,
                    }
                  })
                }
                onClose={() => setActivePicker(null)}
              />

              {/* Photo picker modal */}
              <PhotoPickerModal
                isOpen={activePhotoPicker?.itemId === item.id}
                photoObjects={photoObjects}
                selectedPhotoIds={item.selectedPhotos}
                onConfirm={(ids) =>
                  updateItem(item.id, (current) => ({
                    ...current,
                    selectedPhotos: ids,
                  }))
                }
                onClose={() => setActivePicker(null)}
              />

              {/* Instagram picker modal */}
              <InstagramPickerModal
                isOpen={activeInstagramPicker?.itemId === item.id}
                posts={instagramPostObjects}
                selectedPostId={item.selectedInstagramPost}
                onSelect={(nextId) =>
                  updateItem(item.id, (current) => ({
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
                        Change Instagram Post
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
