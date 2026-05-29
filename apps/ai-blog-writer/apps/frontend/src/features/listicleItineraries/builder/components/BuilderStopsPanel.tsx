import { Fragment, useEffect, useMemo, useState } from 'react'
import { FeaturedImagePicker } from '../../../../components/FeaturedImagePicker'
import { getRelatedItemDisplayLabel } from '../../../../shared/related-items/normalizeRelatedItems'
import { fetchMediaAssets as fetchPayloadMediaAssets } from '../../../../shared/api/payload/payload.api'
import { MarkdownBlockEditor } from '../../../../shared/markdown-editor'
import { BLOCK_TYPE_OPTIONS, BLOCK_TYPE_OPTIONS_STOPS } from '../constants/builder-options.constants'
import type {
  InstagramPostOption,
  ItineraryBlockType,
  ItineraryItemBlock,
  ListicleAngle,
  ListicleItineraryDraft,
  MediaAssetOption,
  MediaMode,
  RelatedItemCollection,
  RelatedItemOption,
  TourAgencyKeyLocationRow,
  TourAgencyPriceTier,
  TourAgencyStartingPoint,
} from '../../types'
import {
  getItineraryAngleOptions,
  isManualItineraryBlockType as isManualBlockType,
  relatedCollectionToBlockType,
  TOUR_AGENCY_PRICE_TIERS,
  WHERE_STAYING_BLOCK_TYPE,
} from '../../types'
import { getItineraryStopAngleDisabledReason } from '../services/ai-autowrite.service'
import {
  getRelatedInstagramPostObjects,
  getRelatedPhotoObjects,
  requiresInstagram,
  requiresPhotos,
  resolveInstagramEmbedUrl,
  resolveInstagramPreviewUrl,
  resolveImageUrl,
} from '../../../../shared/builder/utils/item-media.utils'
import { ExistingStopPickerModal, type ExistingStopPickerOption } from './ExistingStopPickerModal'
import { InstagramPickerModal } from '../../../../shared/builder/components/InstagramPickerModal'
import { PhotoPickerModal } from '../../../../shared/builder/components/PhotoPickerModal'
import { RelatedItemPickerModal } from '../../../../shared/builder/components/RelatedItemPickerModal'

type AiRewriteInput = {
  blockId: string
  currentContent: string
  prompt: string
  includeWholeArticleContext: boolean
}

type BuilderStopsPanelProps = {
  draft: ListicleItineraryDraft
  /** Index of the day tab being edited (0-based). */
  activeDayIndex: number
  token: string | null
  locationRef: number | null
  mediaAssets: MediaAssetOption[]
  instagramPosts: InstagramPostOption[]
  isLoadingRelated: boolean
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>
  onAddWhereStaying: () => void
  onAddItem: () => void
  onMoveItem: (itemId: string, direction: 'up' | 'down') => void
  onRemoveItem: (itemId: string) => void
  onUpdateItem: (itemId: string, updater: (item: ItineraryItemBlock) => ItineraryItemBlock) => void
  onStopBlurbAiAutoWrite: (itemId: string) => Promise<void>
  onStopBlurbAiRewrite: (itemId: string, input: AiRewriteInput) => Promise<string>
  activeAiItemId: string | null
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
  | { type: 'starting-point-existing-stop'; itemId: string }
  | { type: 'route-existing-stops'; itemId: string }
  | null

const TOUR_AGENCY_EXISTING_STOP_COLLECTION_OPTIONS: Array<{
  value: RelatedItemCollection
  label: string
}> = [
  { value: 'dining', label: 'Dining' },
  { value: 'accommodations', label: 'Hotels' },
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

function buildExistingStopSelectionKey(collection: RelatedItemCollection, itemId: number): string {
  return `${collection}:${itemId}`
}

function canUseExistingItemAsStartingPoint(item: RelatedItemOption): boolean {
  const latitude = toCoordinateText(item.latitude).trim()
  const longitude = toCoordinateText(item.longitude).trim()
  return Boolean(
    latitude
    && longitude
    && Number.isFinite(Number(latitude))
    && Number.isFinite(Number(longitude))
  )
}

function buildExistingStopOptions(
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>,
): ExistingStopPickerOption[] {
  return TOUR_AGENCY_EXISTING_STOP_COLLECTION_OPTIONS.flatMap(({ value, label }) => (
    getRelatedItemsForCollection(relatedByBlockType, value).map((item) => ({
      selectionKey: buildExistingStopSelectionKey(value, item.id),
      collection: value,
      collectionLabel: label,
      item,
      canUseAsStartingPoint: canUseExistingItemAsStartingPoint(item),
    }))
  ))
}

function toCoordinateText(value: number | string | null | undefined): string {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : ''
  }

  return typeof value === 'string' ? value : ''
}

function buildStartingPointFromExistingStop(item: RelatedItemOption): TourAgencyStartingPoint {
  return {
    label: getRelatedItemDisplayLabel(item),
    latitude: toCoordinateText(item.latitude),
    longitude: toCoordinateText(item.longitude),
  }
}

function normalizeTextForCompare(value: string): string {
  return value.trim().toLowerCase()
}

function getSelectedStartingPointExistingStopKey(
  startingPoint: TourAgencyStartingPoint,
  existingStopOptions: ExistingStopPickerOption[],
): string | null {
  const label = normalizeTextForCompare(startingPoint.label)
  if (!label) return null

  const latitude = startingPoint.latitude.trim()
  const longitude = startingPoint.longitude.trim()
  const match = existingStopOptions.find((option) => {
    if (!option.canUseAsStartingPoint) return false
    const optionStartingPoint = buildStartingPointFromExistingStop(option.item)
    const optionLabel = normalizeTextForCompare(optionStartingPoint.label)
    if (optionLabel !== label) return false

    const optionLatitude = optionStartingPoint.latitude.trim()
    const optionLongitude = optionStartingPoint.longitude.trim()
    if (!latitude && !longitude) return true
    return optionLatitude === latitude && optionLongitude === longitude
  })

  return match?.selectionKey ?? null
}

function getExistingRouteSelectionKey(location: TourAgencyKeyLocationRow): string | null {
  if (
    location.source !== 'existing'
    || !location.relatedCollection
    || typeof location.relatedItem !== 'number'
  ) {
    return null
  }

  return buildExistingStopSelectionKey(location.relatedCollection, location.relatedItem)
}

function getSelectedExistingRouteKeys(item: ItineraryItemBlock): string[] {
  return item.keyLocations
    .map((location) => getExistingRouteSelectionKey(location))
    .filter((selectionKey): selectionKey is string => Boolean(selectionKey))
}

function findExistingStopOptionForRow(
  existingStopOptions: ExistingStopPickerOption[],
  location: TourAgencyKeyLocationRow,
): ExistingStopPickerOption | null {
  const selectionKey = getExistingRouteSelectionKey(location)
  if (!selectionKey) return null
  return existingStopOptions.find((option) => option.selectionKey === selectionKey) || null
}

function buildRoutePointRowsFromSelection(
  item: ItineraryItemBlock,
  selectedKeys: string[],
  existingStopOptions: ExistingStopPickerOption[],
): TourAgencyKeyLocationRow[] {
  const availableKeys = new Set(existingStopOptions.map((option) => option.selectionKey))
  const selectedKeySet = new Set(selectedKeys)
  const nextRows: TourAgencyKeyLocationRow[] = []

  item.keyLocations.forEach((location) => {
    const selectionKey = getExistingRouteSelectionKey(location)
    if (!selectionKey) {
      nextRows.push(location)
      return
    }

    if (!availableKeys.has(selectionKey)) {
      nextRows.push(location)
      return
    }

    if (selectedKeySet.has(selectionKey)) {
      nextRows.push(location)
      selectedKeySet.delete(selectionKey)
    }
  })

  selectedKeys.forEach((selectionKey) => {
    if (!selectedKeySet.has(selectionKey)) return
    const selectedOption = existingStopOptions.find((option) => option.selectionKey === selectionKey)
    if (!selectedOption) return

    nextRows.push({
      ...createKeyLocationRow(item.id, 'existing'),
      relatedCollection: selectedOption.collection,
      relatedItem: selectedOption.item.id,
    })
  })

  return nextRows
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
  activeDayIndex,
  token,
  locationRef,
  mediaAssets,
  instagramPosts,
  isLoadingRelated,
  relatedByBlockType,
  onAddWhereStaying,
  onAddItem,
  onMoveItem,
  onRemoveItem,
  onUpdateItem,
  onStopBlurbAiAutoWrite,
  onStopBlurbAiRewrite,
  activeAiItemId,
  isLocked,
  isSynced = false,
  onContinueStep3,
  onUpdateStep3,
  onSaveStep3,
  onCancelStep3Update,
}: BuilderStopsPanelProps) {
  const resolvedToken = token ?? ''
  const dayDraft = useMemo(() => {
    const day = draft.days[activeDayIndex] ?? draft.days[0]
    return day ?? { id: '', whereStaying: [] as ItineraryItemBlock[], items: [] as ItineraryItemBlock[] }
  }, [draft.days, activeDayIndex])
  const [activePicker, setActivePicker] = useState<ActivePicker>(null)
  const [copiedItemId, setCopiedItemId] = useState<string | null>(null)
  const [copyErrorItemId, setCopyErrorItemId] = useState<string | null>(null)
  const [photoPreviewIndexByItem, setPhotoPreviewIndexByItem] = useState<Record<string, number>>({})
  const [activeInstagramEmbedPreviewItemId, setActiveInstagramEmbedPreviewItemId] = useState<string | null>(null)
  const [imagePickerItemId, setImagePickerItemId] = useState<string | null>(null)
  const [fetchedManualImageAssets, setFetchedManualImageAssets] = useState<Record<number, MediaAssetOption>>({})

  const step3Rows = useMemo(
    () => [
      ...dayDraft.whereStaying.map((item, index) => ({
        item,
        section: 'whereStaying' as const,
        localIndex: index,
      })),
      ...dayDraft.items.map((item, index) => ({
        item,
        section: 'stops' as const,
        localIndex: index,
      })),
    ],
    [dayDraft.whereStaying, dayDraft.items],
  )

  const activeItemPicker = activePicker?.type === 'item' ? activePicker : null
  const activePhotoPicker = activePicker?.type === 'photos' ? activePicker : null
  const activeInstagramPicker = activePicker?.type === 'instagram' ? activePicker : null
  const activeManualInstagramPicker = activePicker?.type === 'manual-instagram' ? activePicker : null
  const activeStartingPointExistingStopPicker = activePicker?.type === 'starting-point-existing-stop' ? activePicker : null
  const activeRouteExistingStopsPicker = activePicker?.type === 'route-existing-stops' ? activePicker : null
  const missingManualImageIds = useMemo(() => {
    if (!resolvedToken) return []

    const loadedIds = new Set<number>([
      ...mediaAssets.map((asset) => asset.id),
      ...Object.keys(fetchedManualImageAssets).map((id) => Number(id)),
    ])

    const allStep3Items = [...dayDraft.whereStaying, ...dayDraft.items]

    return Array.from(new Set(
      allStep3Items
        .filter((item) => isManualBlockType(item.blockType) && typeof item.image === 'number')
        .map((item) => item.image)
        .filter((imageId): imageId is number => typeof imageId === 'number' && !loadedIds.has(imageId)),
    ))
  }, [dayDraft.whereStaying, dayDraft.items, fetchedManualImageAssets, mediaAssets, resolvedToken])

  useEffect(() => {
    if (!copiedItemId) return
    const timer = window.setTimeout(() => setCopiedItemId(null), 1800)
    return () => window.clearTimeout(timer)
  }, [copiedItemId])

  useEffect(() => {
    if (!resolvedToken || missingManualImageIds.length === 0) return

    let cancelled = false

    const hydrateManualImages = async () => {
      const responses = await Promise.all(
        missingManualImageIds.map(async (imageId) => {
          try {
            const response = await fetchPayloadMediaAssets(resolvedToken, {
              id: imageId,
              limit: 1,
            })
            return response.docs[0] || null
          } catch {
            return null
          }
        }),
      )

      if (cancelled) return

      const hydratedAssets = responses
        .filter((asset): asset is NonNullable<(typeof responses)[number]> => Boolean(asset))
        .map((asset) => ({
          id: asset.id,
          filename: asset.filename,
          alt: asset.alt ?? undefined,
          alt_text: asset.alt_text ?? undefined,
          altText: asset.altText ?? undefined,
          mediaSet: asset.mediaSet,
          url: asset.url ?? undefined,
          variant: asset.variant ?? undefined,
        } satisfies MediaAssetOption))
      if (hydratedAssets.length < 1) return

      setFetchedManualImageAssets((current) => {
        const next = { ...current }
        hydratedAssets.forEach((asset) => {
          next[asset.id] = asset
        })
        return next
      })
    }

    void hydrateManualImages()

    return () => {
      cancelled = true
    }
  }, [missingManualImageIds, resolvedToken])

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
    ;[...dayDraft.whereStaying, ...dayDraft.items].forEach((item) => {
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
  }, [dayDraft.whereStaying, dayDraft.items, onUpdateItem, relatedByBlockType])

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
          {!isSynced ? <span className="stl-kicker">Step 3</span> : null} Lodging & stops
          <span className="stl-step3-header-counts">
            {' '}
            {draft.dayCount > 1 ? `Day ${activeDayIndex + 1} · ` : ''}
            ({dayDraft.whereStaying.length} lodging · {dayDraft.items.length} stops)
          </span>
        </h2>
        <div className="stl-inline-actions">
          <button type="button" className="stl-btn" onClick={onAddWhereStaying}>
            Add lodging
          </button>
          <button type="button" className="stl-btn" onClick={onAddItem}>
            Add stop
          </button>
          {!isSynced ? (
            <>
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
            </>
          ) : null}
        </div>
      </div>

      <fieldset className="stl-panel-fieldset" disabled={!isSynced && isLocked}>
        {isLoadingRelated ? <p className="stl-placeholder">Loading related items...</p> : null}

        <div className="stl-list">
          {step3Rows.map((row, idx) => {
            const { item, section, localIndex } = row
            const showHeading = idx === 0 || step3Rows[idx - 1].section !== section
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
            const angleOptions = getItineraryAngleOptions(item.blockType)
            const angleDisabledReason = getItineraryStopAngleDisabledReason(item)
            const existingStopOptions = buildExistingStopOptions(relatedByBlockType)
            const selectedStartingPointExistingStopKey = getSelectedStartingPointExistingStopKey(
              item.startingPoint,
              existingStopOptions,
            )
            const selectedStartingPointExistingStop = selectedStartingPointExistingStopKey
              ? existingStopOptions.find((option) => option.selectionKey === selectedStartingPointExistingStopKey) || null
              : null
            const selectedExistingRouteKeys = getSelectedExistingRouteKeys(item)
            const selectedPhotoPreviews = item.selectedPhotos
              .map((photoId) => {
                const photo = photoObjects.find((p) => p.id === photoId)
                const url = photo ? resolveImageUrl(photo) : undefined
                return url ? { id: photoId, url } : null
              })
              .filter((entry): entry is { id: number; url: string } => Boolean(entry))
            const selectedManualImage = (
              mediaAssets.find((asset) => asset.id === item.image)
              || (item.image ? fetchedManualImageAssets[item.image] : null)
              || null
            )
            const selectedManualImageUrl = selectedManualImage ? resolveImageUrl(selectedManualImage) : undefined
            const photoPreviewCount = selectedPhotoPreviews.length
            const activePhotoPreviewIndex = Math.min(
              photoPreviewIndexByItem[item.id] ?? 0,
              Math.max(photoPreviewCount - 1, 0),
            )
            const activePhotoPreview = selectedPhotoPreviews[activePhotoPreviewIndex]

            return (
              <Fragment key={item.id}>
                {showHeading ? (
                  <h3 className="stl-step3-section-heading">
                    {section === 'whereStaying' ? "Where you're staying" : 'Stops'}
                  </h3>
                ) : null}
                <article className="stl-item-card">
                <header className="stl-item-header">
                  <h3>{section === 'whereStaying' ? `Lodging ${localIndex + 1}` : `Stop ${localIndex + 1}`}</h3>
                  <div className="stl-inline-actions">
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
                      disabled={section === 'whereStaying'}
                      onChange={(event) =>
                        onUpdateItem(item.id, (current) => resetItemForBlockType(
                          current,
                          event.target.value as ItineraryBlockType,
                        ))
                      }
                    >
                      {(section === 'whereStaying'
                        ? BLOCK_TYPE_OPTIONS.filter((option) => option.value === WHERE_STAYING_BLOCK_TYPE)
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
                        <div className="stl-field-label-row">
                          <span>Starting Point</span>
                          <button
                            type="button"
                            className="stl-btn stl-btn-secondary stl-btn-xs"
                            onClick={() => setActivePicker({ type: 'starting-point-existing-stop', itemId: item.id })}
                            disabled={existingStopOptions.length < 1}
                          >
                            Choose Existing Stop
                          </button>
                        </div>
                        <p className="stl-legacy-note">
                          Pull from dining, hotels, attractions, nightlife, or key locations. You can still edit the fields after picking.
                        </p>
                        {selectedStartingPointExistingStop ? (
                          <div className="stl-tour-existing-point">
                            <div className="stl-tour-existing-point__meta">
                              <span className="stl-tour-existing-point__badge">
                                {selectedStartingPointExistingStop.collectionLabel}
                              </span>
                              <strong>{getRelatedItemDisplayLabel(selectedStartingPointExistingStop.item)}</strong>
                            </div>
                            {selectedStartingPointExistingStop.item.location ? (
                              <p className="stl-tour-existing-point__location">
                                {selectedStartingPointExistingStop.item.location}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
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
                            onClick={() => setActivePicker({ type: 'route-existing-stops', itemId: item.id })}
                            disabled={existingStopOptions.length < 1}
                          >
                            Select Existing Stops
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
                      <p className="stl-legacy-note">
                        Keep route points simple: bulk-pick existing stops, then add only the custom coordinates you still need.
                      </p>

                      {item.keyLocations.length < 1 ? (
                        <p className="stl-legacy-note">Add existing stops or manual coordinates for the route.</p>
                      ) : (
                        <div className="stl-tour-key-locations">
                          {item.keyLocations.map((location, locationIndex) => {
                            const selectedExistingStop = findExistingStopOptionForRow(existingStopOptions, location)

                            return (
                              <div key={location.id} className="stl-tour-key-location-row">
                                <div className="stl-tour-key-location-row__header">
                                  <div className="stl-tour-key-location-row__title">
                                    <strong>Route Point {locationIndex + 1}</strong>
                                    <span className="stl-tour-key-location-row__kind">
                                      {location.source === 'existing' ? 'Existing stop' : 'Manual point'}
                                    </span>
                                  </div>
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

                                {location.source === 'existing' ? (
                                  <div className="stl-tour-existing-point">
                                    <div className="stl-tour-existing-point__meta">
                                      <span className="stl-tour-existing-point__badge">
                                        {selectedExistingStop?.collectionLabel || location.relatedCollection || 'Existing'}
                                      </span>
                                      <strong>
                                        {selectedExistingStop
                                          ? getRelatedItemDisplayLabel(selectedExistingStop.item)
                                          : 'Saved item is unavailable'}
                                      </strong>
                                    </div>
                                    {selectedExistingStop?.item.location ? (
                                      <p className="stl-tour-existing-point__location">
                                        {selectedExistingStop.item.location}
                                      </p>
                                    ) : null}
                                    {!selectedExistingStop ? (
                                      <p className="stl-legacy-note">
                                        This existing stop is outside the current itinerary scope or no longer published.
                                      </p>
                                    ) : null}
                                  </div>
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
                              aria-label={
                        section === 'whereStaying'
                          ? `Show previous photo for lodging ${localIndex + 1}`
                          : `Show previous photo for stop ${localIndex + 1}`
                      }
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
                              aria-label={
                        section === 'whereStaying'
                          ? `Show next photo for lodging ${localIndex + 1}`
                          : `Show next photo for stop ${localIndex + 1}`
                      }
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

                <div className="stl-field">
                  <div className="stl-field-label-row">
                    <span>Blurb *</span>
                    <div className="stl-inline-actions">
                      {angleOptions.length > 0 ? (
                        <select
                          className="stl-field-input stl-angle-select"
                          value={item.angle && angleOptions.some((option) => option.value === item.angle) ? item.angle : ''}
                          onChange={(event) => {
                            const next = event.target.value
                            onUpdateItem(item.id, (current) => ({
                              ...current,
                              angle: next === '' ? null : (next as ListicleAngle),
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
                        disabled={activeAiItemId === item.id || Boolean(angleDisabledReason)}
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
                        blurbJsonText: '',
                      }))
                    }
                    showToolbar
                    enforceHeadingStructure={false}
                    onAiRewrite={(input) => onStopBlurbAiRewrite(item.id, input)}
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

                <ExistingStopPickerModal
                  isOpen={activeStartingPointExistingStopPicker?.itemId === item.id}
                  items={existingStopOptions}
                  mode="single"
                  title="Choose Starting Point"
                  description="Use an existing dining stop, hotel, attraction, nightlife venue, or key location with coordinates."
                  selectedKeys={selectedStartingPointExistingStopKey ? [selectedStartingPointExistingStopKey] : []}
                  confirmLabel="Use Selected"
                  emptyMessage="No existing stops match this itinerary."
                  searchPlaceholder="Search dining, hotels, attractions, nightlife, or key locations..."
                  requireCoordinates
                  onConfirm={(keys) => {
                    const selected = existingStopOptions.find((option) => option.selectionKey === keys[0])
                    if (!selected) return
                    onUpdateItem(item.id, (current) => ({
                      ...current,
                      startingPoint: buildStartingPointFromExistingStop(selected.item),
                    }))
                  }}
                  onClose={() => setActivePicker(null)}
                />

                <ExistingStopPickerModal
                  isOpen={activeRouteExistingStopsPicker?.itemId === item.id}
                  items={existingStopOptions}
                  mode="multiple"
                  title="Select Existing Stops"
                  description="Pick from published dining, hotels, attractions, nightlife, and key locations in one list."
                  selectedKeys={selectedExistingRouteKeys}
                  confirmLabel="Save Selection"
                  emptyMessage="No existing stops match this itinerary."
                  searchPlaceholder="Search all existing stops..."
                  onConfirm={(keys) =>
                    onUpdateItem(item.id, (current) => ({
                      ...current,
                      keyLocations: buildRoutePointRowsFromSelection(current, keys, existingStopOptions),
                    }))
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
                  token={resolvedToken}
                  locationRef={locationRef}
                  payloadSourceMode="mediaSets"
                  requireMediaSet={false}
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
                              title={
                                section === 'whereStaying'
                                  ? `Instagram post embed for lodging ${localIndex + 1}`
                                  : `Instagram post embed for stop ${localIndex + 1}`
                              }
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
              </Fragment>
            )
          })}
        </div>
      </fieldset>
    </section>
  )
}
