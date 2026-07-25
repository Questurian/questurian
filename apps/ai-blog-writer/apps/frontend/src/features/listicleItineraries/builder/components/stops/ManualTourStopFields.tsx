import type { Dispatch, SetStateAction } from 'react'
import { getRelatedItemDisplayLabel } from '../../../../../shared/related-items/normalizeRelatedItems'
import type {
  InstagramPostOption,
  ItineraryItemBlock,
  MediaAssetOption,
  TourAgencyPriceTier
} from '../../../types'
import { TOUR_AGENCY_PRICE_TIERS } from '../../../types'
import type { ExistingStopPickerOption } from '../ExistingStopPickerModal'
import {
  createKeyLocationRow,
  formatTourDurationLabel
} from '../../utils/itineraryStopBlock.utils'
import { findExistingStopOptionForRow } from '../../utils/existingStopSelection.utils'
import type { ActivePicker } from './BuilderStopRow'

type Props = {
  item: ItineraryItemBlock
  instagramPosts: InstagramPostOption[]
  existingStopOptions: ExistingStopPickerOption[]
  selectedStartingPointExistingStop: ExistingStopPickerOption | null
  selectedManualInstagramPost: InstagramPostOption | null
  selectedInstagramPreviewUrl?: string
  selectedManualImage: MediaAssetOption | null
  selectedManualImageUrl?: string
  onUpdateItem: (
    itemId: string,
    updater: (item: ItineraryItemBlock) => ItineraryItemBlock
  ) => void
  setActivePicker: Dispatch<SetStateAction<ActivePicker>>
  setActiveInstagramEmbedPreviewItemId: Dispatch<SetStateAction<string | null>>
  setImagePickerItemId: Dispatch<SetStateAction<string | null>>
}

export function ManualTourStopFields({
  item,
  instagramPosts,
  existingStopOptions,
  selectedStartingPointExistingStop,
  selectedManualInstagramPost,
  selectedInstagramPreviewUrl,
  selectedManualImage,
  selectedManualImageUrl,
  onUpdateItem,
  setActivePicker,
  setActiveInstagramEmbedPreviewItemId,
  setImagePickerItemId
}: Props) {
  return (
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
                operator: event.target.value
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
                price: event.target.value as TourAgencyPriceTier | ''
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
                url: event.target.value
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
                tourDuration: Number(event.target.value)
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
              onClick={() =>
                setActivePicker({
                  type: 'starting-point-existing-stop',
                  itemId: item.id
                })
              }
              disabled={existingStopOptions.length < 1}
            >
              Choose Existing Stop
            </button>
          </div>
          <p className="stl-legacy-note">
            Pull from dining, hotels, attractions, nightlife, or key locations.
            You can still edit the fields after picking.
          </p>
          {selectedStartingPointExistingStop ? (
            <div className="stl-tour-existing-point">
              <div className="stl-tour-existing-point__meta">
                <span className="stl-tour-existing-point__badge">
                  {selectedStartingPointExistingStop.collectionLabel}
                </span>
                <strong>
                  {getRelatedItemDisplayLabel(
                    selectedStartingPointExistingStop.item
                  )}
                </strong>
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
                      label: event.target.value
                    }
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
                      latitude: event.target.value
                    }
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
                      longitude: event.target.value
                    }
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
                <span className="stl-picker-trigger__label">
                  {selectedManualInstagramPost.title}
                </span>
              </span>
              <span className="stl-picker-trigger__caret">Preview</span>
            </button>
          ) : (
            <button
              type="button"
              className="stl-picker-trigger"
              onClick={() =>
                setActivePicker({
                  type: 'manual-instagram',
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
          {selectedManualInstagramPost ? (
            <div className="stl-inline-actions">
              <button
                type="button"
                className="stl-btn stl-btn-secondary stl-btn-xs"
                onClick={() =>
                  setActivePicker({
                    type: 'manual-instagram',
                    itemId: item.id
                  })
                }
              >
                Change
              </button>
              <button
                type="button"
                className="stl-btn stl-btn-secondary stl-btn-xs"
                onClick={() =>
                  onUpdateItem(item.id, (current) => ({
                    ...current,
                    instagramPost: null
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
                {selectedManualImageUrl && (
                  <img src={selectedManualImageUrl} alt="" />
                )}
                <span className="stl-picker-trigger__label">
                  {selectedManualImage.filename}
                </span>
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
                setActivePicker({
                  type: 'route-existing-stops',
                  itemId: item.id
                })
              }
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
                  keyLocations: [
                    ...current.keyLocations,
                    createKeyLocationRow(item.id, 'manual')
                  ]
                }))
              }
            >
              Add Manual Point
            </button>
          </div>
        </div>
        <p className="stl-legacy-note">
          Keep route points simple: bulk-pick existing stops, then add only the
          custom coordinates you still need.
        </p>

        {item.keyLocations.length < 1 ? (
          <p className="stl-legacy-note">
            Add existing stops or manual coordinates for the route.
          </p>
        ) : (
          <div className="stl-tour-key-locations">
            {item.keyLocations.map((location, locationIndex) => {
              const selectedExistingStop = findExistingStopOptionForRow(
                existingStopOptions,
                location
              )

              return (
                <div key={location.id} className="stl-tour-key-location-row">
                  <div className="stl-tour-key-location-row__header">
                    <div className="stl-tour-key-location-row__title">
                      <strong>Route Point {locationIndex + 1}</strong>
                      <span className="stl-tour-key-location-row__kind">
                        {location.source === 'existing'
                          ? 'Existing stop'
                          : 'Manual point'}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="stl-btn stl-btn-danger stl-btn-xs"
                      onClick={() =>
                        onUpdateItem(item.id, (current) => ({
                          ...current,
                          keyLocations: current.keyLocations.filter(
                            (entry) => entry.id !== location.id
                          )
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
                          {selectedExistingStop?.collectionLabel ||
                            location.relatedCollection ||
                            'Existing'}
                        </span>
                        <strong>
                          {selectedExistingStop
                            ? getRelatedItemDisplayLabel(
                                selectedExistingStop.item
                              )
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
                          This existing stop is outside the current itinerary
                          scope or no longer published.
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
                              keyLocations: current.keyLocations.map((entry) =>
                                entry.id !== location.id
                                  ? entry
                                  : {
                                      ...entry,
                                      title: event.target.value
                                    }
                              )
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
                              keyLocations: current.keyLocations.map((entry) =>
                                entry.id !== location.id
                                  ? entry
                                  : {
                                      ...entry,
                                      latitude: event.target.value
                                    }
                              )
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
                              keyLocations: current.keyLocations.map((entry) =>
                                entry.id !== location.id
                                  ? entry
                                  : {
                                      ...entry,
                                      longitude: event.target.value
                                    }
                              )
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
  )
}
