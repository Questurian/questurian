import { useEffect, useState } from 'react'
import { FeaturedImagePicker } from '../../../../components/FeaturedImagePicker'
import { getRelatedItemDisplayLabel } from '../../../shared/related-items/normalizeRelatedItems'
import { MarkdownBlockEditor } from '../../../staging/features/markdown-editor'
import {
  BLOCK_TYPE_OPTIONS,
  DURATION_MINUTE_OPTIONS,
  PERIOD_OPTIONS,
  QUARTER_MINUTE_OPTIONS,
} from '../constants/builder-options.constants'
import type {
  DurationMinute,
  InstagramPostOption,
  ItineraryBlockType,
  ItineraryItemBlock,
  ListicleItineraryDraft,
  MediaAssetOption,
  MediaMode,
  Meridiem,
  QuarterMinute,
  RelatedItemCollection,
  RelatedItemOption,
  TourAgencyKeyLocationRow,
  TourAgencyPriceTier,
} from '../../types'
import {
  isManualItineraryBlockType as isManualBlockType,
  relatedCollectionToBlockType,
  TOUR_AGENCY_PRICE_TIERS,
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
  token: string | null
  locationRef: number | null
  mediaAssets: MediaAssetOption[]
  instagramPosts: InstagramPostOption[]
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
  onStopBlurbAiAutoWrite: (itemId: string) => Promise<void>
  onStopBlurbAiRewrite: (itemId: string, input: AiRewriteInput) => Promise<string>
  activeAiItemId: string | null
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
  | { type: 'manual-instagram'; itemId: string }
  | null

const TOUR_AGENCY_KEY_LOCATION_COLLECTION_OPTIONS: Array<{
  value: RelatedItemCollection
  label: string
}> = [
  { value: 'dining', label: 'Dining' },
  { value: 'accommodations', label: 'Accommodations' },
  { value: 'attractions', label: 'Attractions' },
  { value: 'nightlife', label: 'Nightlife' },
  { value: 'key-locations', label: 'Key Locations' },
]

function createKeyLocationRow(
  itemId: string,
  source: TourAgencyKeyLocationRow['source'],
): TourAgencyKeyLocationRow {
  return {
    id: `${itemId}_key_location_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    source,
    relatedCollection: source === 'existing' ? 'key-locations' : null,
    relatedItem: null,
    title: '',
    latitude: '',
    longitude: '',
  }
}

function getRelatedItemsForCollection(
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>,
  collection: RelatedItemCollection | null,
): RelatedItemOption[] {
  if (!collection) return []
  return relatedByBlockType[relatedCollectionToBlockType(collection)] || []
}

function formatTourDurationLabel(hours: number): string {
  return `${hours} hour${hours === 1 ? '' : 's'}`
}

function resetItemForBlockType(item: ItineraryItemBlock, blockType: ItineraryBlockType): ItineraryItemBlock {
  return {
    ...item,
    blockType,
    item: null,
    mediaMode: 'photos',
    selectedPhotos: [],
    selectedInstagramPost: null,
    title: '',
    operator: '',
    price: '',
    url: '',
    tourDuration: 1,
    startingPoint: {
      label: '',
      latitude: '',
      longitude: '',
    },
    keyLocations: [],
    image: null,
    instagramPost: null,
  }
}

export function BuilderStopsPanel({
  draft,
  token,
  locationRef,
  mediaAssets,
  instagramPosts,
  isLoadingRelated,
  relatedByBlockType,
  onAddItem,
  onEndHereOnLastStop,
  onMoveItem,
  onRemoveItem,
  onUpdateItem,
  onStopBlurbAiAutoWrite,
  onStopBlurbAiRewrite,
  activeAiItemId,
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
  const [imagePickerItemId, setImagePickerItemId] = useState<string | null>(null)

  const activeItemPicker = activePicker?.type === 'item' ? activePicker : null
  const activePhotoPicker = activePicker?.type === 'photos' ? activePicker : null
  const activeInstagramPicker = activePicker?.type === 'instagram' ? activePicker : null
  const activeManualInstagramPicker = activePicker?.type === 'manual-instagram' ? activePicker : null

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
      if (isManualBlockType(item.blockType)) {
        return
      }

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
            const isManualStop = isManualBlockType(item.blockType)
            const relatedOptions = relatedByBlockType[item.blockType] || []
            const selectedRelatedItem = relatedOptions.find((entry) => entry.id === item.item) || null
            const photoObjects = getRelatedPhotoObjects(selectedRelatedItem)
            const instagramPostObjects = getRelatedInstagramPostObjects(selectedRelatedItem)
            const hasPhotosAvailable = photoObjects.length > 0
            const hasInstagramAvailable = instagramPostObjects.length > 0
            const availableMediaModeOptions = isManualStop
              ? []
              : getAvailableMediaModeOptions(hasPhotosAvailable, hasInstagramAvailable)
            const effectiveMediaMode =
              availableMediaModeOptions.find((option) => option.value === item.mediaMode)?.value
              ?? availableMediaModeOptions[0]?.value
              ?? null
            const modeNeedsPhotos = !isManualStop && effectiveMediaMode ? requiresPhotos(effectiveMediaMode) : false
            const modeNeedsInstagram = !isManualStop && effectiveMediaMode ? requiresInstagram(effectiveMediaMode) : false
            const selectedInstagramPost = instagramPostObjects.find(
              (post) => post.id === item.selectedInstagramPost,
            ) || null
            const selectedManualInstagramPost = instagramPosts.find(
              (post) => post.id === item.instagramPost,
            ) || null
            const previewInstagramPost = isManualStop ? selectedManualInstagramPost : selectedInstagramPost
            const selectedInstagramEmbedUrl = previewInstagramPost
              ? resolveInstagramEmbedUrl(previewInstagramPost)
              : undefined
            const selectedInstagramPreviewUrl = previewInstagramPost
              ? resolveInstagramPreviewUrl(previewInstagramPost)
              : undefined
            const firstItemPhoto = photoObjects[0]
            const firstItemPhotoUrl = firstItemPhoto ? resolveImageUrl(firstItemPhoto) : undefined
            const selectedRelatedItemLabel = getRelatedItemDisplayLabel(selectedRelatedItem)
            const isLastItem = index === draft.items.length - 1
            const selectedPhotoPreviews = item.selectedPhotos
              .map((photoId) => {
                const photo = photoObjects.find((p) => p.id === photoId)
                const url = photo ? resolveImageUrl(photo) : undefined
                return url ? { id: photoId, url } : null
              })
              .filter((entry): entry is { id: number; url: string } => Boolean(entry))
            const selectedManualImage = mediaAssets.find((asset) => asset.id === item.image) || null
            const selectedManualImageUrl = selectedManualImage ? resolveImageUrl(selectedManualImage) : undefined
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
                        onUpdateItem(item.id, (current) => resetItemForBlockType(
                          current,
                          event.target.value as ItineraryBlockType,
                        ))
                      }
                    >
                      {BLOCK_TYPE_OPTIONS.map((blockType) => (
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
                            title: event.target.value,
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
                        </>
                      ) : null}
                    </div>
                  )}
                </div>

                {isManualStop ? (
                  <>
                    <div className="stl-grid stl-grid-2">
                      <label className="stl-field">
                        <span>Operator *</span>
                        <input
                          type="text"
                          value={item.operator}
                          onChange={(event) =>
                            onUpdateItem(item.id, (current) => ({
                              ...current,
                              operator: event.target.value,
                            }))
                          }
                          placeholder="Ex. Alpaca Expeditions"
                        />
                      </label>

                      <label className="stl-field">
                        <span>Price</span>
                        <select
                          value={item.price}
                          onChange={(event) =>
                            onUpdateItem(item.id, (current) => ({
                              ...current,
                              price: event.target.value as TourAgencyPriceTier | '',
                            }))
                          }
                        >
                          <option value="">Not specified</option>
                          {TOUR_AGENCY_PRICE_TIERS.map((tier) => (
                            <option key={tier} value={tier}>
                              {tier}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="stl-grid stl-grid-2">
                      <label className="stl-field">
                        <span>URL *</span>
                        <input
                          type="url"
                          value={item.url}
                          onChange={(event) =>
                            onUpdateItem(item.id, (current) => ({
                              ...current,
                              url: event.target.value,
                            }))
                          }
                          placeholder="https://example.com/tour"
                        />
                      </label>

                      <label className="stl-field">
                        <div className="stl-field-label-row">
                          <span>Tour Duration *</span>
                          <span className="stl-tour-duration-badge">
                            {formatTourDurationLabel(item.tourDuration)}
                          </span>
                        </div>
                        <input
                          className="stl-tour-duration-slider"
                          type="range"
                          min={1}
                          max={24}
                          step={1}
                          value={item.tourDuration}
                          onChange={(event) =>
                            onUpdateItem(item.id, (current) => ({
                              ...current,
                              tourDuration: Number(event.target.value),
                            }))
                          }
                          aria-label="Tour Duration"
                        />
                      </label>
                    </div>

                    <div className="stl-grid stl-grid-2">
                      <div className="stl-field">
                        <span>Starting Point</span>
                        <div className="stl-grid stl-grid-3">
                          <label className="stl-field">
                            <span>Label</span>
                            <input
                              type="text"
                              value={item.startingPoint.label}
                              onChange={(event) =>
                                onUpdateItem(item.id, (current) => ({
                                  ...current,
                                  startingPoint: {
                                    ...current.startingPoint,
                                    label: event.target.value,
                                  },
                                }))
                              }
                              placeholder="Ex. Plaza de Armas"
                            />
                          </label>
                          <label className="stl-field">
                            <span>Latitude</span>
                            <input
                              type="text"
                              value={item.startingPoint.latitude}
                              onChange={(event) =>
                                onUpdateItem(item.id, (current) => ({
                                  ...current,
                                  startingPoint: {
                                    ...current.startingPoint,
                                    latitude: event.target.value,
                                  },
                                }))
                              }
                              placeholder="-13.5319"
                            />
                          </label>
                          <label className="stl-field">
                            <span>Longitude</span>
                            <input
                              type="text"
                              value={item.startingPoint.longitude}
                              onChange={(event) =>
                                onUpdateItem(item.id, (current) => ({
                                  ...current,
                                  startingPoint: {
                                    ...current.startingPoint,
                                    longitude: event.target.value,
                                  },
                                }))
                              }
                              placeholder="-71.9675"
                            />
                          </label>
                        </div>
                      </div>

                      <div className="stl-field">
                        <span>Instagram</span>
                        {selectedManualInstagramPost ? (
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
                              <span className="stl-picker-trigger__label">{selectedManualInstagramPost.title}</span>
                            </span>
                            <span className="stl-picker-trigger__caret">Preview</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="stl-picker-trigger"
                            onClick={() => setActivePicker({ type: 'manual-instagram', itemId: item.id })}
                          >
                            <span className="stl-picker-trigger__preview">
                              <span className="stl-picker-trigger__label stl-picker-trigger__label--placeholder">
                                Select Instagram post...
                              </span>
                            </span>
                            <span className="stl-picker-trigger__caret">▼</span>
                          </button>
                        )}
                        {selectedManualInstagramPost ? (
                          <div className="stl-inline-actions">
                            <button
                              type="button"
                              className="stl-btn stl-btn-secondary stl-btn-xs"
                              onClick={() => setActivePicker({ type: 'manual-instagram', itemId: item.id })}
                            >
                              Change
                            </button>
                            <button
                              type="button"
                              className="stl-btn stl-btn-secondary stl-btn-xs"
                              onClick={() =>
                                onUpdateItem(item.id, (current) => ({
                                  ...current,
                                  instagramPost: null,
                                }))
                              }
                            >
                              Clear
                            </button>
                          </div>
                        ) : null}
                        {instagramPosts.length < 1 ? (
                          <p className="stl-legacy-note">No Instagram posts are loaded.</p>
                        ) : null}
                      </div>
                    </div>

                    <div className="stl-field">
                      <span>Img</span>
                      <button
                        type="button"
                        className="stl-picker-trigger"
                        onClick={() => setImagePickerItemId(item.id)}
                      >
                        <span className="stl-picker-trigger__preview">
                          {selectedManualImage ? (
                            <>
                              {selectedManualImageUrl && <img src={selectedManualImageUrl} alt="" />}
                              <span className="stl-picker-trigger__label">{selectedManualImage.filename}</span>
                            </>
                          ) : (
                            <span className="stl-picker-trigger__label stl-picker-trigger__label--placeholder">
                              Select image...
                            </span>
                          )}
                        </span>
                        <span className="stl-picker-trigger__caret">▼</span>
                      </button>
                    </div>

                    <div className="stl-field">
                      <div className="stl-field-label-row">
                        <span>Key Locations</span>
                        <div className="stl-inline-actions">
                          <button
                            type="button"
                            className="stl-btn stl-btn-secondary"
                            onClick={() =>
                              onUpdateItem(item.id, (current) => ({
                                ...current,
                                keyLocations: [...current.keyLocations, createKeyLocationRow(item.id, 'existing')],
                              }))
                            }
                          >
                            Add Existing Item
                          </button>
                          <button
                            type="button"
                            className="stl-btn stl-btn-secondary"
                            onClick={() =>
                              onUpdateItem(item.id, (current) => ({
                                ...current,
                                keyLocations: [...current.keyLocations, createKeyLocationRow(item.id, 'manual')],
                              }))
                            }
                          >
                            Add Manual Point
                          </button>
                        </div>
                      </div>

                      {item.keyLocations.length < 1 ? (
                        <p className="stl-legacy-note">Add existing stops or manual coordinates for the route.</p>
                      ) : (
                        <div className="stl-tour-key-locations">
                          {item.keyLocations.map((location, locationIndex) => {
                            const relatedOptionsForRow = getRelatedItemsForCollection(
                              relatedByBlockType,
                              location.relatedCollection,
                            )
                            const selectedRelatedKeyLocation = relatedOptionsForRow.find(
                              (entry) => entry.id === location.relatedItem,
                            ) || null

                            return (
                              <div key={location.id} className="stl-tour-key-location-row">
                                <div className="stl-tour-key-location-row__header">
                                  <strong>Route Point {locationIndex + 1}</strong>
                                  <button
                                    type="button"
                                    className="stl-btn stl-btn-danger stl-btn-xs"
                                    onClick={() =>
                                      onUpdateItem(item.id, (current) => ({
                                        ...current,
                                        keyLocations: current.keyLocations.filter((entry) => entry.id !== location.id),
                                      }))
                                    }
                                  >
                                    Remove
                                  </button>
                                </div>

                                <div className="stl-grid stl-grid-2">
                                  <label className="stl-field">
                                    <span>Source</span>
                                    <select
                                      value={location.source}
                                      onChange={(event) =>
                                        onUpdateItem(item.id, (current) => ({
                                          ...current,
                                          keyLocations: current.keyLocations.map((entry) => (
                                            entry.id !== location.id
                                              ? entry
                                              : {
                                                  ...entry,
                                                  source: event.target.value as TourAgencyKeyLocationRow['source'],
                                                  relatedCollection: event.target.value === 'existing' ? 'key-locations' : null,
                                                  relatedItem: null,
                                                  title: '',
                                                  latitude: '',
                                                  longitude: '',
                                                }
                                          )),
                                        }))
                                      }
                                    >
                                      <option value="existing">Existing item</option>
                                      <option value="manual">Manual coordinates</option>
                                    </select>
                                  </label>

                                  {location.source === 'existing' ? (
                                    <label className="stl-field">
                                      <span>Collection</span>
                                      <select
                                        value={location.relatedCollection ?? ''}
                                        onChange={(event) =>
                                          onUpdateItem(item.id, (current) => ({
                                            ...current,
                                            keyLocations: current.keyLocations.map((entry) => (
                                              entry.id !== location.id
                                                ? entry
                                                : {
                                                    ...entry,
                                                    relatedCollection: event.target.value as RelatedItemCollection,
                                                    relatedItem: null,
                                                  }
                                            )),
                                          }))
                                        }
                                      >
                                        {TOUR_AGENCY_KEY_LOCATION_COLLECTION_OPTIONS.map((option) => (
                                          <option key={option.value} value={option.value}>
                                            {option.label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  ) : null}
                                </div>

                                {location.source === 'existing' ? (
                                  <label className="stl-field">
                                    <span>Existing Item</span>
                                    <select
                                      value={location.relatedItem ?? ''}
                                      onChange={(event) =>
                                        onUpdateItem(item.id, (current) => ({
                                          ...current,
                                          keyLocations: current.keyLocations.map((entry) => (
                                            entry.id !== location.id
                                              ? entry
                                              : {
                                                  ...entry,
                                                  relatedItem: event.target.value ? Number(event.target.value) : null,
                                                }
                                          )),
                                        }))
                                      }
                                    >
                                      <option value="">Select item...</option>
                                      {relatedOptionsForRow.map((option) => (
                                        <option key={option.id} value={option.id}>
                                          {getRelatedItemDisplayLabel(option)}
                                        </option>
                                      ))}
                                    </select>
                                    {selectedRelatedKeyLocation?.location ? (
                                      <p className="stl-legacy-note">{selectedRelatedKeyLocation.location}</p>
                                    ) : null}
                                  </label>
                                ) : (
                                  <div className="stl-grid stl-grid-3">
                                    <label className="stl-field">
                                      <span>Title</span>
                                      <input
                                        type="text"
                                        value={location.title}
                                        onChange={(event) =>
                                          onUpdateItem(item.id, (current) => ({
                                            ...current,
                                            keyLocations: current.keyLocations.map((entry) => (
                                              entry.id !== location.id
                                                ? entry
                                                : {
                                                    ...entry,
                                                    title: event.target.value,
                                                  }
                                            )),
                                          }))
                                        }
                                        placeholder="Ex. Scenic overlook"
                                      />
                                    </label>
                                    <label className="stl-field">
                                      <span>Latitude</span>
                                      <input
                                        type="text"
                                        value={location.latitude}
                                        onChange={(event) =>
                                          onUpdateItem(item.id, (current) => ({
                                            ...current,
                                            keyLocations: current.keyLocations.map((entry) => (
                                              entry.id !== location.id
                                                ? entry
                                                : {
                                                    ...entry,
                                                    latitude: event.target.value,
                                                  }
                                            )),
                                          }))
                                        }
                                        placeholder="-13.5319"
                                      />
                                    </label>
                                    <label className="stl-field">
                                      <span>Longitude</span>
                                      <input
                                        type="text"
                                        value={location.longitude}
                                        onChange={(event) =>
                                          onUpdateItem(item.id, (current) => ({
                                            ...current,
                                            keyLocations: current.keyLocations.map((entry) => (
                                              entry.id !== location.id
                                                ? entry
                                                : {
                                                    ...entry,
                                                    longitude: event.target.value,
                                                  }
                                            )),
                                          }))
                                        }
                                        placeholder="-71.9675"
                                      />
                                    </label>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </>
                ) : selectedRelatedItem ? (
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

                {!isManualStop && modeNeedsPhotos ? (
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

                {!isManualStop && modeNeedsInstagram ? (
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
                  <div className="stl-field-label-row">
                    <span>Blurb *</span>
                    <div className="stl-inline-actions">
                      <button
                        type="button"
                        className="stl-btn stl-btn-secondary"
                        onClick={() => void onStopBlurbAiAutoWrite(item.id)}
                        disabled={activeAiItemId === item.id}
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

                <FeaturedImagePicker
                  isOpen={imagePickerItemId === item.id}
                  selectedId={item.image}
                  token={token ?? ''}
                  locationRef={locationRef}
                  requireMediaSet={false}
                  prefetchedPayloadAssets={mediaAssets.map((asset) => ({
                    id: asset.id,
                    filename: asset.filename,
                    url: asset.url,
                    alt: asset.alt,
                    alt_text: asset.alt_text,
                    altText: asset.altText,
                    mediaSet: asset.mediaSet,
                    variant: asset.variant as 'square' | 'portrait' | 'thumbnail' | 'wide' | 'hero' | 'open_graph' | 'editorial' | undefined,
                  }))}
                  onSelect={(mediaAssetId) =>
                    onUpdateItem(item.id, (current) => ({
                      ...current,
                      image: mediaAssetId,
                    }))
                  }
                  onClose={() => setImagePickerItemId(null)}
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

                <InstagramPickerModal
                  isOpen={activeManualInstagramPicker?.itemId === item.id}
                  posts={instagramPosts}
                  selectedPostId={item.instagramPost}
                  onSelect={(nextId) =>
                    onUpdateItem(item.id, (current) => ({
                      ...current,
                      instagramPost: nextId,
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
                        <h3>{previewInstagramPost?.title || 'Instagram Post Preview'}</h3>
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
