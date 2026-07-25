import type { Location } from '../../../api'
import type { StagedArticle } from '../../../types'
import { getLocationDisplayName } from '../../../features/editorial-stage-article/utils/editorial-stage-view.utils'
import {
  buildPrimaryLocationUpdate,
  getSharedNeighborhoodOptions,
  sanitizeSharedNeighborhoods,
} from '../../../features/editorial-stage-article/utils/sharedNeighborhoods'

type EditorialLocationSectionProps = {
  stagedArticle: StagedArticle
  locations: Location[]
  isEditingLocked: boolean
  onUpdate: (updates: Partial<StagedArticle>) => void
}

export function EditorialLocationSection({
  stagedArticle,
  locations,
  isEditingLocked,
  onUpdate,
}: EditorialLocationSectionProps) {
  const selectedLocation = locations.find((location) => location.id === stagedArticle.locationId)
  const sharedNeighborhoodOptions = getSharedNeighborhoodOptions(locations, stagedArticle.locationId)
  const selectedSharedNeighborhoods = sanitizeSharedNeighborhoods(
    stagedArticle.sharedNeighborhoods,
    locations,
    stagedArticle.locationId,
  )

  return (
    <>
      <div className="stage-article-sidebar-section">
        <label className="stage-article-label">
          Location <span className="required">*</span>
        </label>
        <select
          value={stagedArticle.locationId || ''}
          onChange={(event) => {
            const nextLocationId = Number(event.target.value) || undefined
            onUpdate(buildPrimaryLocationUpdate({
              locations,
              nextLocationId,
              sharedNeighborhoods: stagedArticle.sharedNeighborhoods,
            }))
          }}
          className="stage-article-select"
          disabled={isEditingLocked}
        >
          <option value="">-- Select --</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {getLocationDisplayName(location)} ({location.level})
            </option>
          ))}
        </select>
      </div>

      {selectedLocation?.level === 'city' ? (
        <div className="stage-article-sidebar-section">
          <label className="stage-article-label">Shared Neighborhoods</label>
          <span className="stage-article-label-hint">
            Optional. Exact neighborhood scoping only.
          </span>
          <select
            multiple
            value={selectedSharedNeighborhoods.map(String)}
            onChange={(event) => {
              const nextSharedNeighborhoods = Array.from(
                event.currentTarget.selectedOptions,
                (option) => Number(option.value),
              ).filter((value) => Number.isFinite(value) && value > 0)

              onUpdate({
                sharedNeighborhoods: sanitizeSharedNeighborhoods(
                  nextSharedNeighborhoods,
                  locations,
                  stagedArticle.locationId,
                ),
              })
            }}
            className="stage-article-select"
            disabled={isEditingLocked || sharedNeighborhoodOptions.length === 0}
            style={{ minHeight: '8rem' }}
          >
            {sharedNeighborhoodOptions.map((location) => (
              <option key={location.id} value={location.id}>
                {getLocationDisplayName(location)}
              </option>
            ))}
          </select>
          {sharedNeighborhoodOptions.length === 0 ? (
            <p className="stage-article-publish-checklist-more">
              No neighborhoods are available for this city yet.
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
