import type { Dispatch, SetStateAction } from 'react'
import type {
  InstagramPostOption,
  ListicleItemBlock,
  RelatedItemOption
} from '../../../types'
import { TOUR_PICKS_MAX } from '../../../types'
import {
  getLinkedTourObjects,
  getRelatedPhotoObjects
} from '../../../../../shared/builder/utils/item-media.utils'
import type { ActivePicker } from './item.types'

type Props = {
  item: ListicleItemBlock
  index: number
  selectedRelatedItem: RelatedItemOption | null
  linkedTours: ReturnType<typeof getLinkedTourObjects>
  staleTourPickIds: number[]
  modeNeedsPhotos: boolean
  modeNeedsInstagram: boolean
  photoObjects: ReturnType<typeof getRelatedPhotoObjects>
  instagramPostObjects: InstagramPostOption[]
  selectedInstagramPost: InstagramPostOption | null
  selectedInstagramPreviewUrl?: string
  photoPreviewCount: number
  activePhotoPreviewIndex: number
  activePhotoPreview?: { id: number; url: string }
  setPhotoPreviewIndexByItem: Dispatch<SetStateAction<Record<string, number>>>
  setActivePicker: Dispatch<SetStateAction<ActivePicker>>
  setActiveInstagramEmbedPreviewItemId: Dispatch<SetStateAction<string | null>>
  updateItem: (
    itemId: string,
    updater: (item: ListicleItemBlock) => ListicleItemBlock
  ) => void
}

export function BuilderItemSelections({
  item,
  index,
  selectedRelatedItem,
  linkedTours,
  staleTourPickIds,
  modeNeedsPhotos,
  modeNeedsInstagram,
  photoObjects,
  instagramPostObjects,
  selectedInstagramPost,
  selectedInstagramPreviewUrl,
  photoPreviewCount,
  activePhotoPreviewIndex,
  activePhotoPreview,
  setPhotoPreviewIndexByItem,
  setActivePicker,
  setActiveInstagramEmbedPreviewItemId,
  updateItem
}: Props) {
  return (
    <>
      {item.blockType === 'data-attractions' &&
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
                            tours: current.tours.filter(
                              (tourId) => tourId !== tour.id
                            )
                          }
                        }
                        if (current.tours.length >= TOUR_PICKS_MAX) {
                          return current
                        }
                        return {
                          ...current,
                          tours: [...current.tours, tour.id]
                        }
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
                    <span className="stl-tour-pick-row__price">
                      {tour.price}
                    </span>
                  ) : null}
                </label>
              )
            })}
          </div>
          {staleTourPickIds.length > 0 ? (
            <p className="stl-tour-picks__stale-warning">
              {staleTourPickIds.length} saved tour pick
              {staleTourPickIds.length === 1 ? ' is' : 's are'} no longer linked
              to this attraction in Location Manager and will block syncing.{' '}
              <button
                type="button"
                className="stl-btn stl-btn-secondary stl-btn-xs"
                onClick={() =>
                  updateItem(item.id, (current) => ({
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
                  setActivePicker({ type: 'photos', itemId: item.id })
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
                    aria-label={`Show previous photo for item ${index + 1}`}
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
                    aria-label={`Show next photo for item ${index + 1}`}
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
                  <span className="stl-picker-trigger__label">
                    {selectedInstagramPost.title}
                  </span>
                </span>
                <span className="stl-picker-trigger__caret">Preview</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              className="stl-picker-trigger"
              disabled={!selectedRelatedItem}
              onClick={() =>
                setActivePicker({ type: 'instagram', itemId: item.id })
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
