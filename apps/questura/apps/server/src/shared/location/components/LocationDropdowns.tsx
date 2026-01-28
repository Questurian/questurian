'use client'

import { LocationOption } from '../types'
import { SelectField } from './SelectField'
import styles from '../styles/location.module.css'

/**
 * Cascading location dropdown selectors
 * Displays country > city > neighborhood hierarchy
 */
interface LocationDropdownsProps {
  countries: LocationOption[]
  cities: LocationOption[]
  neighborhoods: LocationOption[]
  selectedCountry: string
  selectedCity: string
  selectedNeighborhood: string
  onCountryChange: (value: string) => void
  onCityChange: (value: string) => void
  onNeighborhoodChange: (value: string) => void
}

export const LocationDropdowns = ({
  countries,
  cities,
  neighborhoods,
  selectedCountry,
  selectedCity,
  selectedNeighborhood,
  onCountryChange,
  onCityChange,
  onNeighborhoodChange,
}: LocationDropdownsProps) => (
  <div className={styles.dropdownsContainer}>
    <SelectField
      label="Country"
      options={countries}
      value={selectedCountry}
      onChange={onCountryChange}
      displayField="country"
    />

    {selectedCountry && (
      <SelectField
        label="City"
        options={cities}
        value={selectedCity}
        onChange={onCityChange}
        displayField="city"
        isOptional={true}
      />
    )}

    {selectedCity && neighborhoods.length > 0 && (
      <SelectField
        label="Neighborhood"
        options={neighborhoods}
        value={selectedNeighborhood}
        onChange={onNeighborhoodChange}
        displayField="neighborhood"
        isOptional={true}
      />
    )}
  </div>
)
