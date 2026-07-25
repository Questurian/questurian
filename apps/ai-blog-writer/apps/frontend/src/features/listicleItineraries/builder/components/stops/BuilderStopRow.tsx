import { Fragment, type Dispatch, type SetStateAction } from 'react'
import { getRelatedItemDisplayLabel } from '../../../../../shared/related-items/normalizeRelatedItems'
import {
  BLOCK_TYPE_OPTIONS,
  BLOCK_TYPE_OPTIONS_STOPS
} from '../../constants/builder-options.constants'
import type {
  InstagramPostOption,
  ItineraryBlockType,
  ItineraryItemBlock,
  MediaAssetOption,
  RelatedItemOption
} from '../../../types'
import {
  getItineraryAngleOptions,
  isManualItineraryBlockType as isManualBlockType,
  WHERE_STAYING_BLOCK_TYPE
} from '../../../types'
import { getItineraryStopAngleDisabledReason } from '../../services/ai-autowrite.service'
import {
  getLinkedTourObjects,
  getRelatedInstagramPostObjects,
  getRelatedPhotoObjects,
  requiresInstagram,
  requiresPhotos,
  resolveInstagramEmbedUrl,
  resolveInstagramPreviewUrl,
  resolveImageUrl
} from '../../../../../shared/builder/utils/item-media.utils'
import type { ComposeStopReasonResult } from '../../services/compose-stop-reason.service'
import { getAvailableMediaModeOptions } from '../../utils/stopMediaMode.utils'
import {
  buildExistingStopOptions,
  getSelectedExistingRouteKeys,
  getSelectedStartingPointExistingStopKey
} from '../../utils/existingStopSelection.utils'
import { resetItemForBlockType } from '../../utils/itineraryStopBlock.utils'
import { StopInsertZone } from './StopInsertZone'
import { ManualTourStopFields } from './ManualTourStopFields'
import { RelatedStopMediaFields } from './RelatedStopMediaFields'
import { StopEditorialFields } from './StopEditorialFields'
import { BuilderStopOverlays } from './BuilderStopOverlays'
import { ItineraryMomentFields } from '../ItineraryMomentFields'

export type ActivePicker =
  | { type: 'item'; itemId: string }
  | { type: 'photos'; itemId: string }
  | { type: 'instagram'; itemId: string }
  | { type: 'manual-instagram'; itemId: string }
  | { type: 'starting-point-existing-stop'; itemId: string }
  | { type: 'route-existing-stops'; itemId: string }
  | { type: 'tour-picks'; itemId: string }
  | null

type Step3Row = {
  item: ItineraryItemBlock
  section: 'whereStaying' | 'stops'
  localIndex: number
}

type BuilderStopRowProps = {
  row: Step3Row
  showHeading: boolean
  token: string
  locationRef: number | null
  mediaAssets: MediaAssetOption[]
  instagramPosts: InstagramPostOption[]
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>
  fetchedManualImageAssets: Record<number, MediaAssetOption>
  activePicker: ActivePicker
  photoPreviewIndexByItem: Record<string, number>
  activeInstagramEmbedPreviewItemId: string | null
  imagePickerItemId: string | null
  activeAiItemId: string | null
  isLocked: boolean
  onAddItem: (insertIndex?: number) => void
  onMoveItem: (itemId: string, direction: 'up' | 'down') => void
  onRemoveItem: (itemId: string) => void
  onUpdateItem: (
    itemId: string,
    updater: (item: ItineraryItemBlock) => ItineraryItemBlock
  ) => void
  onStopBlurbAiAutoWrite: (itemId: string) => Promise<void>
  onRefineStopReason: (
    itemId: string,
    roughReason: string
  ) => Promise<ComposeStopReasonResult>
  setActivePicker: Dispatch<SetStateAction<ActivePicker>>
  setPhotoPreviewIndexByItem: Dispatch<SetStateAction<Record<string, number>>>
  setActiveInstagramEmbedPreviewItemId: Dispatch<SetStateAction<string | null>>
  setImagePickerItemId: Dispatch<SetStateAction<string | null>>
}

export function BuilderStopRow({
  row,
  showHeading,
  token: resolvedToken,
  locationRef,
  mediaAssets,
  instagramPosts,
  relatedByBlockType,
  fetchedManualImageAssets,
  activePicker,
  photoPreviewIndexByItem,
  activeInstagramEmbedPreviewItemId,
  imagePickerItemId,
  activeAiItemId,
  isLocked,
  onAddItem,
  onMoveItem,
  onRemoveItem,
  onUpdateItem,
  onStopBlurbAiAutoWrite,
  onRefineStopReason,
  setActivePicker,
  setPhotoPreviewIndexByItem,
  setActiveInstagramEmbedPreviewItemId,
  setImagePickerItemId
}: BuilderStopRowProps) {
  const { item, section, localIndex } = row
  const isManualStop = isManualBlockType(item.blockType)
  const relatedOptions = relatedByBlockType[item.blockType] || []
  const selectedRelatedItem =
    relatedOptions.find((entry) => entry.id === item.item) || null
  const photoObjects = getRelatedPhotoObjects(selectedRelatedItem)
  const instagramPostObjects =
    getRelatedInstagramPostObjects(selectedRelatedItem)
  const hasPhotosAvailable = photoObjects.length > 0
  const hasInstagramAvailable = instagramPostObjects.length > 0
  const availableMediaModeOptions = isManualStop
    ? []
    : getAvailableMediaModeOptions(hasPhotosAvailable, hasInstagramAvailable)
  const effectiveMediaMode =
    availableMediaModeOptions.find((option) => option.value === item.mediaMode)
      ?.value ??
    availableMediaModeOptions[0]?.value ??
    null
  const modeNeedsPhotos =
    !isManualStop && effectiveMediaMode
      ? requiresPhotos(effectiveMediaMode)
      : false
  const modeNeedsInstagram =
    !isManualStop && effectiveMediaMode
      ? requiresInstagram(effectiveMediaMode)
      : false
  const selectedInstagramPost =
    instagramPostObjects.find(
      (post) => post.id === item.selectedInstagramPost
    ) || null
  const selectedManualInstagramPost =
    instagramPosts.find((post) => post.id === item.instagramPost) || null
  const previewInstagramPost = isManualStop
    ? selectedManualInstagramPost
    : selectedInstagramPost
  const selectedInstagramEmbedUrl = previewInstagramPost
    ? resolveInstagramEmbedUrl(previewInstagramPost)
    : undefined
  const selectedInstagramPreviewUrl = previewInstagramPost
    ? resolveInstagramPreviewUrl(previewInstagramPost)
    : undefined
  const firstItemPhoto = photoObjects[0]
  const firstItemPhotoUrl = firstItemPhoto
    ? resolveImageUrl(firstItemPhoto)
    : undefined
  const selectedRelatedItemLabel =
    getRelatedItemDisplayLabel(selectedRelatedItem)
  const angleOptions = getItineraryAngleOptions(item.blockType)
  const angleDisabledReason = getItineraryStopAngleDisabledReason(item)
  const linkedTours =
    item.blockType === 'itinerary-attractions'
      ? getLinkedTourObjects(selectedRelatedItem)
      : []
  const staleTourPickIds =
    item.blockType === 'itinerary-attractions' && selectedRelatedItem
      ? item.tours.filter(
          (tourId) => !linkedTours.some((tour) => tour.id === tourId)
        )
      : []
  const existingStopOptions = buildExistingStopOptions(relatedByBlockType)
  const selectedStartingPointExistingStopKey =
    getSelectedStartingPointExistingStopKey(
      item.startingPoint,
      existingStopOptions
    )
  const selectedStartingPointExistingStop = selectedStartingPointExistingStopKey
    ? existingStopOptions.find(
        (option) => option.selectionKey === selectedStartingPointExistingStopKey
      ) || null
    : null
  const selectedExistingRouteKeys = getSelectedExistingRouteKeys(item)
  const selectedPhotoPreviews = item.selectedPhotos
    .map((photoId) => {
      const photo = photoObjects.find((p) => p.id === photoId)
      const url = photo ? resolveImageUrl(photo) : undefined
      return url ? { id: photoId, url } : null
    })
    .filter((entry): entry is { id: number; url: string } => Boolean(entry))
  const selectedManualImage =
    mediaAssets.find((asset) => asset.id === item.image) ||
    (item.image ? fetchedManualImageAssets[item.image] : null) ||
    null
  const selectedManualImageUrl = selectedManualImage
    ? resolveImageUrl(selectedManualImage)
    : undefined
  const photoPreviewCount = selectedPhotoPreviews.length
  const activePhotoPreviewIndex = Math.min(
    photoPreviewIndexByItem[item.id] ?? 0,
    Math.max(photoPreviewCount - 1, 0)
  )
  const activePhotoPreview = selectedPhotoPreviews[activePhotoPreviewIndex]

  return (
    <Fragment key={item.id}>
      {showHeading ? (
        <h3 className="stl-step3-section-heading">
          {section === 'whereStaying' ? "Where you're staying" : 'Stops'}
        </h3>
      ) : null}
      {section === 'stops' && localIndex === 0 ? (
        <StopInsertZone
          label="Insert stop here"
          onInsert={() => onAddItem(0)}
        />
      ) : null}
      <article className="stl-item-card">
        <header className="stl-item-header">
          <div>
            <h3>
              {section === 'whereStaying'
                ? `Lodging ${localIndex + 1}`
                : `Stop ${localIndex + 1}`}
            </h3>
            {section !== 'whereStaying' && item.shellSlotLabel ? (
              <p className="stl-shell-slot-badge">
                {item.shellSlotDaypart?.replace('_', ' ') || 'shell slot'} ·{' '}
                {item.shellSlotLabel}
              </p>
            ) : null}
          </div>
          <div className="stl-inline-actions">
            <button
              type="button"
              className="stl-btn stl-btn-secondary"
              onClick={() => onMoveItem(item.id, 'up')}
            >
              Up
            </button>
            <button
              type="button"
              className="stl-btn stl-btn-secondary"
              onClick={() => onMoveItem(item.id, 'down')}
            >
              Down
            </button>
            <button
              type="button"
              className="stl-btn stl-btn-danger"
              onClick={() => onRemoveItem(item.id)}
            >
              Remove
            </button>
          </div>
        </header>

        <div className="stl-grid stl-grid-2">
          <label className="stl-field">
            <span>Block Type *</span>
            <select
              value={item.blockType}
              disabled={section === 'whereStaying'}
              onChange={(event) =>
                onUpdateItem(item.id, (current) =>
                  resetItemForBlockType(
                    current,
                    event.target.value as ItineraryBlockType
                  )
                )
              }
            >
              {(section === 'whereStaying'
                ? BLOCK_TYPE_OPTIONS.filter(
                    (option) => option.value === WHERE_STAYING_BLOCK_TYPE
                  )
                : BLOCK_TYPE_OPTIONS_STOPS
              ).map((blockType) => (
                <option key={blockType.value} value={blockType.value}>
                  {blockType.label}
                </option>
              ))}
            </select>
          </label>

          {isManualStop ? (
            <label className="stl-field">
              <span>Tour Title *</span>
              <input
                type="text"
                value={item.title}
                onChange={(event) =>
                  onUpdateItem(item.id, (current) => ({
                    ...current,
                    title: event.target.value
                  }))
                }
                placeholder="Ex. Sacred Valley day tour"
              />
            </label>
          ) : (
            <div className="stl-field">
              <span>Related Item *</span>
              <button
                type="button"
                className="stl-picker-trigger"
                onClick={() =>
                  setActivePicker({ type: 'item', itemId: item.id })
                }
              >
                <span className="stl-picker-trigger__preview">
                  {selectedRelatedItem ? (
                    <>
                      {firstItemPhotoUrl && (
                        <img src={firstItemPhotoUrl} alt="" />
                      )}
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
            </div>
          )}
        </div>

        {section !== 'whereStaying' ? (
          <ItineraryMomentFields
            item={item}
            onChange={(updater) => onUpdateItem(item.id, updater)}
          />
        ) : null}

        {isManualStop ? (
          <ManualTourStopFields
            item={item}
            instagramPosts={instagramPosts}
            existingStopOptions={existingStopOptions}
            selectedStartingPointExistingStop={
              selectedStartingPointExistingStop
            }
            selectedManualInstagramPost={selectedManualInstagramPost}
            selectedInstagramPreviewUrl={selectedInstagramPreviewUrl}
            selectedManualImage={selectedManualImage}
            selectedManualImageUrl={selectedManualImageUrl}
            onUpdateItem={onUpdateItem}
            setActivePicker={setActivePicker}
            setActiveInstagramEmbedPreviewItemId={
              setActiveInstagramEmbedPreviewItemId
            }
            setImagePickerItemId={setImagePickerItemId}
          />
        ) : (
          <RelatedStopMediaFields
            item={item}
            section={section}
            localIndex={localIndex}
            selectedRelatedItem={selectedRelatedItem}
            availableMediaModeOptions={availableMediaModeOptions}
            effectiveMediaMode={effectiveMediaMode}
            linkedTours={linkedTours}
            staleTourPickIds={staleTourPickIds}
            modeNeedsPhotos={modeNeedsPhotos}
            photoObjects={photoObjects}
            selectedPhotoPreviews={selectedPhotoPreviews}
            activePhotoPreviewIndex={activePhotoPreviewIndex}
            activePhotoPreview={activePhotoPreview}
            modeNeedsInstagram={modeNeedsInstagram}
            selectedInstagramPost={selectedInstagramPost}
            selectedInstagramPreviewUrl={selectedInstagramPreviewUrl}
            instagramPostObjects={instagramPostObjects}
            onUpdateItem={onUpdateItem}
            setActivePicker={setActivePicker}
            setPhotoPreviewIndexByItem={setPhotoPreviewIndexByItem}
            setActiveInstagramEmbedPreviewItemId={
              setActiveInstagramEmbedPreviewItemId
            }
          />
        )}

        <StopEditorialFields
          item={item}
          section={section}
          localIndex={localIndex}
          angleOptions={angleOptions}
          angleDisabledReason={angleDisabledReason}
          activeAiItemId={activeAiItemId}
          isLocked={isLocked}
          onUpdateItem={onUpdateItem}
          onStopBlurbAiAutoWrite={onStopBlurbAiAutoWrite}
          onRefineStopReason={onRefineStopReason}
        />

        <BuilderStopOverlays
          item={item}
          section={section}
          localIndex={localIndex}
          token={resolvedToken}
          locationRef={locationRef}
          instagramPosts={instagramPosts}
          relatedOptions={relatedOptions}
          existingStopOptions={existingStopOptions}
          selectedStartingPointExistingStopKey={
            selectedStartingPointExistingStopKey
          }
          selectedExistingRouteKeys={selectedExistingRouteKeys}
          linkedTours={linkedTours}
          photoObjects={photoObjects}
          instagramPostObjects={instagramPostObjects}
          previewInstagramPost={previewInstagramPost}
          selectedInstagramEmbedUrl={selectedInstagramEmbedUrl}
          selectedInstagramPreviewUrl={selectedInstagramPreviewUrl}
          activePicker={activePicker}
          activeInstagramEmbedPreviewItemId={activeInstagramEmbedPreviewItemId}
          imagePickerItemId={imagePickerItemId}
          onUpdateItem={onUpdateItem}
          setActivePicker={setActivePicker}
          setActiveInstagramEmbedPreviewItemId={
            setActiveInstagramEmbedPreviewItemId
          }
          setImagePickerItemId={setImagePickerItemId}
        />
      </article>
      {section === 'stops' ? (
        <StopInsertZone
          label="Insert stop here"
          onInsert={() => onAddItem(localIndex + 1)}
        />
      ) : null}
    </Fragment>
  )
}
