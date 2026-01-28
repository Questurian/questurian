'use client'

import { LocationOption } from '../types'
import { formatLocationName } from '../utils'
import styles from '../styles/location.module.css'

/**
 * Reusable select field component for location selection
 * Handles empty state and conditional rendering
 */
interface SelectFieldProps {
  label: string
  options: LocationOption[]
  value: string
  onChange: (value: string) => void
  displayField: 'country' | 'city' | 'neighborhood'
  isOptional?: boolean
}

export const SelectField = ({
  label,
  options,
  value,
  onChange,
  displayField,
  isOptional = false,
}: SelectFieldProps) => {
  const displayNameFieldMap = {
    country: 'countryName',
    city: 'cityName',
    neighborhood: 'neighborhoodName',
  } as const
  const displayNameField = displayNameFieldMap[displayField]

  return (
    <div className={styles.selectInputWrapper}>
      <label className={styles.selectLabel}>
        {label} {!isOptional && '*'}
      </label>
      {options.length > 0 ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={styles.selectInput}
        >
          <option value="">Select a {displayField}...</option>
          {options.map((option) => {
            const displayName = option[displayNameField] as string | undefined
            const fallback = option[displayField] as string | undefined
            const label =
              displayName || formatLocationName(fallback || '') || `Unnamed ${displayField}`

            return (
              <option key={option.id} value={option.id}>
                {label}
              </option>
            )
          })}
        </select>
      ) : (
        <div className={styles.emptyStateText}>
          No {displayField}s available for this{' '}
          {displayField === 'city' ? 'country' : 'city'}
        </div>
      )}
    </div>
  )
}
