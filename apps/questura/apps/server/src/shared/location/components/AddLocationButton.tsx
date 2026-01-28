'use client'

import { type MouseEvent } from 'react'
import { Button } from '@payloadcms/ui'
import styles from '../styles/location.module.css'

/**
 * Button to add a location when none exists
 * Triggers the location picker expansion
 */
interface AddLocationButtonProps {
  onOpen: (e: MouseEvent) => void
}

export const AddLocationButton = ({ onOpen }: AddLocationButtonProps) => (
  <div className={styles.addLocationButtonWrapper}>
    <Button onClick={onOpen} buttonStyle="primary" className={styles.addLocationButton}>
      Add location
    </Button>
  </div>
)
