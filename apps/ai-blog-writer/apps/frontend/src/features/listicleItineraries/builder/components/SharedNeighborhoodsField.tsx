import type { ListicleItineraryDraft, LocationOption } from '../../types'
import { FieldInfoHint } from '../../../../shared/builder/components/FieldInfoHint'
import {
  formatNeighborhoodChipLabel,
  getSharedNeighborhoodsTriggerLabel,
} from './neighborhood-labels.utils'

type SharedNeighborhoodsFieldProps = {
  draft: ListicleItineraryDraft
  neighborhoodOptions: LocationOption[]
  isSetupLocked: boolean
  onOpen: () => void
}

export function SharedNeighborhoodsField({
  draft,
  neighborhoodOptions,
  isSetupLocked,
  onOpen,
}: SharedNeighborhoodsFieldProps) {
  return (
    <div className="stl-field stl-shared-neighborhoods-field">
      <label className="stl-field-label-row">
        <span className="stl-field-label-with-hint">
          Shared Neighborhoods
          <FieldInfoHint
            text={
              neighborhoodOptions.length > 0
                ? 'Optional. When selected, stop pickers match only these exact neighborhoods.'
                : 'No neighborhoods are available under this city.'
            }
          />
        </span>
      </label>
      <button
        type="button"
        className="stl-picker-trigger"
        disabled={isSetupLocked || neighborhoodOptions.length < 1}
        onClick={onOpen}
      >
        <span className="stl-picker-trigger__preview">
          <span
            className={`stl-picker-trigger__label${
              draft.sharedNeighborhoods.length === 0
                ? ' stl-picker-trigger__label--placeholder'
                : ''
            }`}
          >
            {neighborhoodOptions.length > 0
              ? getSharedNeighborhoodsTriggerLabel(
                  draft.sharedNeighborhoods,
                  neighborhoodOptions,
                )
              : 'No neighborhoods available'}
          </span>
        </span>
        <span className="stl-picker-trigger__caret">▼</span>
      </button>
      {draft.sharedNeighborhoods.length > 1 ? (
        <div className="stl-shared-neighborhoods-summary">
          {draft.sharedNeighborhoods.map((neighborhoodId) => {
            const location = neighborhoodOptions.find(
              (entry) => entry.id === neighborhoodId,
            )
            return location ? (
              <span key={neighborhoodId} className="stl-shared-neighborhoods-chip">
                {formatNeighborhoodChipLabel(location)}
              </span>
            ) : null
          })}
        </div>
      ) : null}
    </div>
  )
}
