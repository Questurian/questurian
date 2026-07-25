import type { Dispatch, SetStateAction } from 'react'
import { getRelatedItemDisplayLabel } from '../../../../../shared/related-items/normalizeRelatedItems'
import type {
  ListicleItemBlock,
  MediaMode,
  RelatedItemOption,
  SingleTypeListicleDraft
} from '../../../types'
import {
  getLinkedTourObjects,
  getRelatedInstagramPostObjects,
  getRelatedPhotoObjects,
  requiresInstagram,
  requiresPhotos,
  resolveInstagramEmbedUrl,
  resolveImageUrl,
  resolveInstagramPreviewUrl
} from '../../../../../shared/builder/utils/item-media.utils'
import {
  getAvailableMediaModeOptions,
  getRelatedItemIdealFor
} from './itemMedia.utils'
import type { ActivePicker } from './item.types'
import { BuilderItemOverlays } from './BuilderItemOverlays'
import { BuilderItemSelections } from './BuilderItemSelections'
import { BuilderItemBlurbField } from './BuilderItemBlurbField'

type Props = {
  draft: SingleTypeListicleDraft
  item: ListicleItemBlock
  index: number
  relatedItems: RelatedItemOption[]
  moveItem: (itemId: string, direction: 'up' | 'down') => void
  removeItem: (itemId: string) => void
  updateItem: (
    itemId: string,
    updater: (item: ListicleItemBlock) => ListicleItemBlock
  ) => void
  onItemBlurbAiAutoWrite: (itemId: string) => Promise<void>
  onItemBlurbInspect: (itemId: string, index: number) => void
  hasInspectableStepsByItemId: Record<string, boolean>
  activeAiItemId: string | null
  queuedAiItemIds: string[]
  activePicker: ActivePicker
  setActivePicker: Dispatch<SetStateAction<ActivePicker>>
  copiedItemId: string | null
  copyErrorItemId: string | null
  onCopyRelatedItemTitle: (itemId: string, title: string) => Promise<void>
  photoPreviewIndexByItem: Record<string, number>
  setPhotoPreviewIndexByItem: Dispatch<SetStateAction<Record<string, number>>>
  activeInstagramEmbedPreviewItemId: string | null
  setActiveInstagramEmbedPreviewItemId: Dispatch<SetStateAction<string | null>>
  setGuidelinePreviewItemId: Dispatch<SetStateAction<string | null>>
}

export function BuilderItemCard({
  draft,
  item,
  index,
  relatedItems,
  moveItem,
  removeItem,
  updateItem,
  onItemBlurbAiAutoWrite,
  onItemBlurbInspect,
  hasInspectableStepsByItemId,
  activeAiItemId,
  queuedAiItemIds,
  activePicker,
  setActivePicker,
  copiedItemId,
  copyErrorItemId,
  onCopyRelatedItemTitle: handleCopyRelatedItemTitle,
  photoPreviewIndexByItem,
  setPhotoPreviewIndexByItem,
  activeInstagramEmbedPreviewItemId,
  setActiveInstagramEmbedPreviewItemId,
  setGuidelinePreviewItemId
}: Props) {
  const selectedRelatedItem =
    relatedItems.find((entry) => entry.id === item.item) || null
  const photoObjects = getRelatedPhotoObjects(selectedRelatedItem)
  const instagramPostObjects =
    getRelatedInstagramPostObjects(selectedRelatedItem)
  const hasPhotosAvailable = photoObjects.length > 0
  const hasInstagramAvailable = instagramPostObjects.length > 0
  const availableMediaModeOptions = getAvailableMediaModeOptions(
    hasPhotosAvailable,
    hasInstagramAvailable
  )
  const effectiveMediaMode =
    availableMediaModeOptions.find((option) => option.value === item.mediaMode)
      ?.value ??
    availableMediaModeOptions[0]?.value ??
    null
  const modeNeedsPhotos = effectiveMediaMode
    ? requiresPhotos(effectiveMediaMode)
    : false
  const modeNeedsInstagram = effectiveMediaMode
    ? requiresInstagram(effectiveMediaMode)
    : false
  const selectedInstagramPost =
    instagramPostObjects.find((p) => p.id === item.selectedInstagramPost) ||
    null
  const selectedInstagramEmbedUrl = selectedInstagramPost
    ? resolveInstagramEmbedUrl(selectedInstagramPost)
    : undefined
  const selectedInstagramPreviewUrl = selectedInstagramPost
    ? resolveInstagramPreviewUrl(selectedInstagramPost)
    : undefined

  const firstItemPhoto = photoObjects[0]
  const firstItemPhotoUrl = firstItemPhoto
    ? resolveImageUrl(firstItemPhoto)
    : undefined
  const idealForValues =
    draft.listicleType === 'dining'
      ? getRelatedItemIdealFor(selectedRelatedItem)
      : []
  const linkedTours =
    item.blockType === 'data-attractions'
      ? getLinkedTourObjects(selectedRelatedItem)
      : []
  const staleTourPickIds =
    item.blockType === 'data-attractions' && selectedRelatedItem
      ? item.tours.filter(
          (tourId) => !linkedTours.some((tour) => tour.id === tourId)
        )
      : []
  const selectedRelatedItemLabel =
    getRelatedItemDisplayLabel(selectedRelatedItem)
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
    Math.max(photoPreviewCount - 1, 0)
  )
  const activePhotoPreview = selectedPhotoPreviews[activePhotoPreviewIndex]
  const queuedAiCount = queuedAiItemIds.filter(
    (queuedItemId) => queuedItemId === item.id
  ).length
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
                  {firstItemPhotoUrl && <img src={firstItemPhotoUrl} alt="" />}
                  <span className="stl-picker-trigger__label">
                    {selectedRelatedItemLabel}
                  </span>
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
                  onClick={() =>
                    void handleCopyRelatedItemTitle(
                      item.id,
                      selectedRelatedItemLabel
                    )
                  }
                >
                  {copiedItemId === item.id ? 'Copied' : 'Copy'}
                </button>
              </div>
              {copyErrorItemId === item.id ? (
                <p className="stl-legacy-note">
                  Clipboard blocked. Select the text field and press Cmd/Ctrl+C.
                </p>
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
                  <p className="stl-legacy-note">
                    View only. Update the related dining entry to change this.
                  </p>
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
                      return {
                        ...current,
                        mediaMode: nextMode,
                        selectedInstagramPost: null
                      }
                    }
                    if (nextMode === 'instagram') {
                      return {
                        ...current,
                        mediaMode: nextMode,
                        selectedPhotos: []
                      }
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
                No photos or Instagram posts are available for this related
                item.
              </p>
            )}
          </label>
        ) : (
          <p className="stl-legacy-note">
            Select a related item to unlock media options and blurb.
          </p>
        )}
      </div>

      <BuilderItemSelections
        item={item}
        index={index}
        selectedRelatedItem={selectedRelatedItem}
        linkedTours={linkedTours}
        staleTourPickIds={staleTourPickIds}
        modeNeedsPhotos={modeNeedsPhotos}
        modeNeedsInstagram={modeNeedsInstagram}
        photoObjects={photoObjects}
        instagramPostObjects={instagramPostObjects}
        selectedInstagramPost={selectedInstagramPost}
        selectedInstagramPreviewUrl={selectedInstagramPreviewUrl}
        photoPreviewCount={photoPreviewCount}
        activePhotoPreviewIndex={activePhotoPreviewIndex}
        activePhotoPreview={activePhotoPreview}
        setPhotoPreviewIndexByItem={setPhotoPreviewIndexByItem}
        setActivePicker={setActivePicker}
        setActiveInstagramEmbedPreviewItemId={
          setActiveInstagramEmbedPreviewItemId
        }
        updateItem={updateItem}
      />
      <BuilderItemBlurbField
        item={item}
        index={index}
        listicleType={draft.listicleType}
        hasSelectedRelatedItem={selectedRelatedItem !== null}
        updateItem={updateItem}
        onItemBlurbAiAutoWrite={onItemBlurbAiAutoWrite}
        onItemBlurbInspect={onItemBlurbInspect}
        hasInspectableSteps={Boolean(hasInspectableStepsByItemId[item.id])}
        activeAiItemId={activeAiItemId}
        queuedAiCount={queuedAiCount}
        setGuidelinePreviewItemId={setGuidelinePreviewItemId}
      />
      <BuilderItemOverlays
        item={item}
        index={index}
        relatedItems={relatedItems}
        photoObjects={photoObjects}
        instagramPostObjects={instagramPostObjects}
        selectedInstagramPost={selectedInstagramPost}
        selectedInstagramEmbedUrl={selectedInstagramEmbedUrl}
        selectedInstagramPreviewUrl={selectedInstagramPreviewUrl}
        activePicker={activePicker}
        setActivePicker={setActivePicker}
        activeInstagramEmbedPreviewItemId={activeInstagramEmbedPreviewItemId}
        setActiveInstagramEmbedPreviewItemId={
          setActiveInstagramEmbedPreviewItemId
        }
        updateItem={updateItem}
      />
    </article>
  )
}
