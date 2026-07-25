import type { Dispatch, SetStateAction } from 'react'
import type {
  InstagramPostOption,
  ItineraryItemBlock,
  MediaMode,
  RelatedItemOption
} from '../../../types'
import { TOUR_PICKS_MAX } from '../../../types'
import type {
  getRelatedPhotoObjects,
  getLinkedTourObjects
} from '../../../../../shared/builder/utils/item-media.utils'
import type { getAvailableMediaModeOptions } from '../../utils/stopMediaMode.utils'
import type { ActivePicker } from './BuilderStopRow'

type PhotoPreview = { id: number; url: string }

type Props = {
  item: ItineraryItemBlock
  section: 'whereStaying' | 'stops'
  localIndex: number
  selectedRelatedItem: RelatedItemOption | null
  availableMediaModeOptions: ReturnType<typeof getAvailableMediaModeOptions>
  effectiveMediaMode: MediaMode | null
  linkedTours: ReturnType<typeof getLinkedTourObjects>
  staleTourPickIds: number[]
  modeNeedsPhotos: boolean
  photoObjects: ReturnType<typeof getRelatedPhotoObjects>
  selectedPhotoPreviews: PhotoPreview[]
  activePhotoPreviewIndex: number
  activePhotoPreview?: PhotoPreview
  modeNeedsInstagram: boolean
  selectedInstagramPost: InstagramPostOption | null
  selectedInstagramPreviewUrl?: string
  instagramPostObjects: InstagramPostOption[]
  onUpdateItem: (
    itemId: string,
    updater: (item: ItineraryItemBlock) => ItineraryItemBlock
  ) => void
  setActivePicker: Dispatch<SetStateAction<ActivePicker>>
  setPhotoPreviewIndexByItem: Dispatch<SetStateAction<Record<string, number>>>
  setActiveInstagramEmbedPreviewItemId: Dispatch<SetStateAction<string | null>>
}

export function RelatedStopMediaFields(props: Props) {
  const {
    item,
    section,
    localIndex,
    selectedRelatedItem,
    availableMediaModeOptions,
    effectiveMediaMode,
    linkedTours,
    staleTourPickIds,
    modeNeedsPhotos,
    photoObjects,
    selectedPhotoPreviews,
    activePhotoPreviewIndex,
    activePhotoPreview,
    modeNeedsInstagram,
    selectedInstagramPost,
    selectedInstagramPreviewUrl,
    instagramPostObjects,
    onUpdateItem,
    setActivePicker,
    setPhotoPreviewIndexByItem,
    setActiveInstagramEmbedPreviewItemId
  } = props
  const photoPreviewCount = selectedPhotoPreviews.length

  return (
    <>
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
              No photos or Instagram posts are available for this related item.
            </p>
          )}
        </label>
      ) : (
        <p className="stl-legacy-note">
          Select a related item to unlock media options and blurb.
        </p>
      )}

      {item.blockType === 'itinerary-attractions' &&
      selectedRelatedItem &&
      linkedTours.length > 0 ? (
        <div className="stl-field">
          <div className="stl-field-label-row">
            <span>Tour Picks</span>
            <span className="stl-tour-duration-badge">
              {item.tours.length}/{TOUR_PICKS_MAX}
            </span>
          </div>
          <p className="stl-legacy-note">
            Feature up to {TOUR_PICKS_MAX} of this attraction's linked tours, in
            the order you pick them. Tour titles, prices, and booking links stay
            live from Location Manager.
          </p>
          <button
            type="button"
            className="stl-picker-trigger"
            onClick={() =>
              setActivePicker({
                type: 'tour-picks',
                itemId: item.id
              })
            }
          >
            <span className="stl-picker-trigger__preview">
              {item.tours.length > 0 ? (
                <span className="stl-picker-trigger__label">
                  {item.tours.length} tour
                  {item.tours.length === 1 ? '' : 's'} selected
                </span>
              ) : (
                <span className="stl-picker-trigger__label stl-picker-trigger__label--placeholder">
                  Select tours...
                </span>
              )}
            </span>
            <span className="stl-picker-trigger__caret">▼</span>
          </button>
          {item.tours.length > 0 ? (
            <div className="stl-tour-picks">
              {item.tours.map((tourId, pickIndex) => {
                const tour = linkedTours.find((entry) => entry.id === tourId)
                if (!tour) return null

                return (
                  <div
                    key={tourId}
                    className="stl-tour-pick-row stl-tour-pick-row--picked"
                  >
                    <span className="stl-tour-pick-row__order">
                      #{pickIndex + 1}
                    </span>
                    <span className="stl-tour-pick-row__title">
                      {tour.title?.trim() || `Tour #${tour.id}`}
                    </span>
                    {tour.price?.trim() ? (
                      <span className="stl-tour-pick-row__price">
                        {tour.price}
                      </span>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : null}
          {staleTourPickIds.length > 0 ? (
            <p className="stl-tour-picks__stale-warning">
              {staleTourPickIds.length} saved tour pick
              {staleTourPickIds.length === 1 ? ' is' : 's are'} no longer linked
              to this attraction in Location Manager and will block syncing.{' '}
              <button
                type="button"
                className="stl-btn stl-btn-secondary stl-btn-xs"
                onClick={() =>
                  onUpdateItem(item.id, (current) => ({
                    ...current,
                    tours: current.tours.filter(
                      (tourId) => !staleTourPickIds.includes(tourId)
                    )
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
                onClick={() =>
                  setActivePicker({
                    type: 'photos',
                    itemId: item.id
                  })
                }
              >
                {activePhotoPreview ? (
                  <img src={activePhotoPreview.url} alt="" />
                ) : (
                  <div className="stl-item-photo-preview__fallback">
                    Photos selected
                  </div>
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
                          (activePhotoPreviewIndex - 1 + photoPreviewCount) %
                          photoPreviewCount
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
                          (activePhotoPreviewIndex + 1) % photoPreviewCount
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
              onClick={() =>
                setActivePicker({ type: 'photos', itemId: item.id })
              }
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
            <p className="stl-legacy-note">
              Select a related item to choose photos.
            </p>
          ) : null}
          {selectedRelatedItem && photoObjects.length === 0 ? (
            <p className="stl-legacy-note">
              The selected related item has no gallery photos available.
            </p>
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
                <span className="stl-picker-trigger__label">
                  {selectedInstagramPost.title}
                </span>
              </span>
              <span className="stl-picker-trigger__caret">Preview</span>
            </button>
          ) : (
            <button
              type="button"
              className="stl-picker-trigger"
              disabled={!selectedRelatedItem}
              onClick={() =>
                setActivePicker({
                  type: 'instagram',
                  itemId: item.id
                })
              }
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
            <p className="stl-legacy-note">
              Select a related item to choose an Instagram post.
            </p>
          ) : null}
          {selectedRelatedItem && instagramPostObjects.length === 0 ? (
            <p className="stl-legacy-note">
              The selected related item has no Instagram posts available.
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
