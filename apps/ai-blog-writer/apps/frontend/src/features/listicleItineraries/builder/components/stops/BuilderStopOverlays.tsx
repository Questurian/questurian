import type { Dispatch, SetStateAction } from 'react'
import { FeaturedImagePicker } from '../../../../../components/FeaturedImagePicker'
import type {
  InstagramPostOption,
  ItineraryItemBlock,
  RelatedItemOption
} from '../../../types'
import type { ExistingStopPickerOption } from '../ExistingStopPickerModal'
import { ExistingStopPickerModal } from '../ExistingStopPickerModal'
import { TourPicksModal } from '../TourPicksModal'
import { InstagramPickerModal } from '../../../../../shared/builder/components/InstagramPickerModal'
import { PhotoPickerModal } from '../../../../../shared/builder/components/PhotoPickerModal'
import { RelatedItemPickerModal } from '../../../../../shared/builder/components/RelatedItemPickerModal'
import {
  getLinkedTourObjects,
  getRelatedInstagramPostObjects,
  getRelatedPhotoObjects
} from '../../../../../shared/builder/utils/item-media.utils'
import { getAvailableMediaModeOptions } from '../../utils/stopMediaMode.utils'
import {
  buildRoutePointRowsFromSelection,
  buildStartingPointFromExistingStop
} from '../../utils/existingStopSelection.utils'
import type { ActivePicker } from './BuilderStopRow'

type Props = {
  item: ItineraryItemBlock
  section: 'whereStaying' | 'stops'
  localIndex: number
  token: string
  locationRef: number | null
  instagramPosts: InstagramPostOption[]
  relatedOptions: RelatedItemOption[]
  existingStopOptions: ExistingStopPickerOption[]
  selectedStartingPointExistingStopKey: string | null
  selectedExistingRouteKeys: string[]
  linkedTours: ReturnType<typeof getLinkedTourObjects>
  photoObjects: ReturnType<typeof getRelatedPhotoObjects>
  instagramPostObjects: InstagramPostOption[]
  previewInstagramPost: InstagramPostOption | null
  selectedInstagramEmbedUrl?: string
  selectedInstagramPreviewUrl?: string
  activePicker: ActivePicker
  activeInstagramEmbedPreviewItemId: string | null
  imagePickerItemId: string | null
  onUpdateItem: (
    itemId: string,
    updater: (item: ItineraryItemBlock) => ItineraryItemBlock
  ) => void
  setActivePicker: Dispatch<SetStateAction<ActivePicker>>
  setActiveInstagramEmbedPreviewItemId: Dispatch<SetStateAction<string | null>>
  setImagePickerItemId: Dispatch<SetStateAction<string | null>>
}

export function BuilderStopOverlays(props: Props) {
  const {
    item,
    section,
    localIndex,
    token: resolvedToken,
    locationRef,
    instagramPosts,
    relatedOptions,
    existingStopOptions,
    selectedStartingPointExistingStopKey,
    selectedExistingRouteKeys,
    linkedTours,
    photoObjects,
    instagramPostObjects,
    previewInstagramPost,
    selectedInstagramEmbedUrl,
    selectedInstagramPreviewUrl,
    activePicker,
    activeInstagramEmbedPreviewItemId,
    imagePickerItemId,
    onUpdateItem,
    setActivePicker,
    setActiveInstagramEmbedPreviewItemId,
    setImagePickerItemId
  } = props
  const activeItemPicker = activePicker?.type === 'item' ? activePicker : null
  const activePhotoPicker =
    activePicker?.type === 'photos' ? activePicker : null
  const activeInstagramPicker =
    activePicker?.type === 'instagram' ? activePicker : null
  const activeManualInstagramPicker =
    activePicker?.type === 'manual-instagram' ? activePicker : null
  const activeStartingPointExistingStopPicker =
    activePicker?.type === 'starting-point-existing-stop' ? activePicker : null
  const activeRouteExistingStopsPicker =
    activePicker?.type === 'route-existing-stops' ? activePicker : null
  const activeTourPicksPicker =
    activePicker?.type === 'tour-picks' ? activePicker : null

  return (
    <>
      <RelatedItemPickerModal
        isOpen={activeItemPicker?.itemId === item.id}
        items={relatedOptions}
        selectedItemId={item.item}
        onSelect={(nextId) =>
          onUpdateItem(item.id, (current) => {
            const nextRelatedItem =
              relatedOptions.find((entry) => entry.id === nextId) || null
            const nextHasPhotos =
              getRelatedPhotoObjects(nextRelatedItem).length > 0
            const nextHasInstagram =
              getRelatedInstagramPostObjects(nextRelatedItem).length > 0
            const nextAvailableModes = getAvailableMediaModeOptions(
              nextHasPhotos,
              nextHasInstagram
            )
            const nextMediaMode =
              nextAvailableModes.find(
                (option) => option.value === current.mediaMode
              )?.value ??
              nextAvailableModes[0]?.value ??
              current.mediaMode

            const pickChanged = nextId !== current.item
            // The Selection reason and blurb are invalidated centrally
            // on identity change (applyItemUpdate, ADR 0020) — no need
            // to clear them here.
            return {
              ...current,
              item: nextId,
              // Tour Picks belong to the previous attraction's linked list.
              tours: pickChanged ? [] : current.tours,
              mediaMode: nextMediaMode,
              selectedPhotos: [],
              selectedInstagramPost: null
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
        selectedKeys={
          selectedStartingPointExistingStopKey
            ? [selectedStartingPointExistingStopKey]
            : []
        }
        confirmLabel="Use Selected"
        emptyMessage="No existing stops match this itinerary."
        searchPlaceholder="Search dining, hotels, attractions, nightlife, or key locations..."
        requireCoordinates
        onConfirm={(keys) => {
          const selected = existingStopOptions.find(
            (option) => option.selectionKey === keys[0]
          )
          if (!selected) return
          onUpdateItem(item.id, (current) => ({
            ...current,
            startingPoint: buildStartingPointFromExistingStop(selected.item)
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
            keyLocations: buildRoutePointRowsFromSelection(
              current,
              keys,
              existingStopOptions
            )
          }))
        }
        onClose={() => setActivePicker(null)}
      />

      <TourPicksModal
        isOpen={activeTourPicksPicker?.itemId === item.id}
        tours={linkedTours}
        selectedTourIds={item.tours}
        onConfirm={(tourIds) =>
          onUpdateItem(item.id, (current) => ({
            ...current,
            tours: tourIds
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
            selectedPhotos: ids
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
            image: mediaAssetId
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
            selectedInstagramPost: nextId
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
            instagramPost: nextId
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
                  setActivePicker({
                    type: 'instagram',
                    itemId: item.id
                  })
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
    </>
  )
}
