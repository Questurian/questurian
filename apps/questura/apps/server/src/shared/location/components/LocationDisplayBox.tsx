'use client'

import { type MouseEvent } from 'react'
import { Button } from '@payloadcms/ui'
import { formatLocationForDisplay } from '../utils'
import type { LocationOption } from '../types'
import styles from '../styles/location.module.css'

/**
 * Displays current location with option to change it
 * Shows when a location value already exists
 */
interface LocationDisplayBoxProps {
  value: string
  isExpanded: boolean
  onToggle: (e: MouseEvent) => void
  locations?: LocationOption[]
}

export const LocationDisplayBox = ({
  value,
  isExpanded,
  onToggle,
  locations,
}: LocationDisplayBoxProps) => {
  const displayText = formatLocationForDisplay(value, locations)

  return (
    <div className={styles.displayBox}>
      <div className={styles.displayBoxText}>
        <strong>{displayText}</strong>
      </div>
      <div className={styles.displayBoxButtonContainer}>
        <Button onClick={onToggle} buttonStyle="secondary" size="small">
          {isExpanded ? 'Done' : 'Edit'}
        </Button>
      </div>
    </div>
  )
}
