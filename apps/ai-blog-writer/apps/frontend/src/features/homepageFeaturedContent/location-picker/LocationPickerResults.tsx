import {
  getLocationDisplayLabel,
  type ModalCountryGroup,
} from './location-groups'

type LocationPickerResultsProps = {
  groups: ModalCountryGroup[]
  isLoading: boolean
  totalResults: number
  searchValue: string
  isSubmitting: boolean
  onSelect: (locationId: number) => void
}

export function LocationPickerResults({
  groups,
  isLoading,
  totalResults,
  searchValue,
  isSubmitting,
  onSelect,
}: LocationPickerResultsProps) {
  if (isLoading) {
    return <p className="hf-modal-empty">Loading locations…</p>
  }
  if (totalResults === 0) {
    return (
      <p className="hf-modal-empty">
        {searchValue.trim()
          ? 'No locations matched your search.'
          : 'All available cities and neighborhoods already have a homepage.'}
      </p>
    )
  }

  return groups.map((countryGroup) => (
    <section key={countryGroup.key} className="hf-modal-country-group">
      <div className="hf-modal-group">{countryGroup.countryLabel}</div>

      {countryGroup.cityGroups.map((cityGroup) => (
        <div key={cityGroup.key} className="hf-modal-city-group">
          <div className="hf-modal-city-group-header">
            <div>
              <p className="hf-modal-city-group-kicker">City</p>
              <h3>{cityGroup.cityLabel}</h3>
            </div>
          </div>

          {cityGroup.city ? (
            <button
              type="button"
              className="hf-modal-row hf-modal-row-city"
              onClick={() => onSelect(cityGroup.city!.id)}
              disabled={isSubmitting}
            >
              <span className="hf-modal-row-copy">
                <span className="hf-modal-row-name">
                  {getLocationDisplayLabel(cityGroup.city)}
                </span>
              </span>
              <span className="hf-modal-row-meta">
                {cityGroup.city.locationKey && (
                  <span className="hf-modal-row-key">
                    {cityGroup.city.locationKey}
                  </span>
                )}
                <span className="hf-level-tag">city</span>
              </span>
            </button>
          ) : null}

          {cityGroup.neighborhoods.length > 0 ? (
            <div className="hf-modal-neighborhood-stack">
              <div className="hf-modal-neighborhood-label">Neighborhoods</div>
              {cityGroup.neighborhoods.map((location) => (
                <button
                  key={location.id}
                  type="button"
                  className="hf-modal-row hf-modal-row-child"
                  onClick={() => onSelect(location.id)}
                  disabled={isSubmitting}
                >
                  <span className="hf-modal-row-copy">
                    <span className="hf-modal-row-name">
                      {getLocationDisplayLabel(location)}
                    </span>
                  </span>
                  <span className="hf-modal-row-meta">
                    {location.locationKey && (
                      <span className="hf-modal-row-key">
                        {location.locationKey}
                      </span>
                    )}
                    <span className="hf-level-tag">neighborhood</span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </section>
  ))
}
