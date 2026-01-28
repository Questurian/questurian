'use client'

import { type MouseEvent } from 'react'
import { Button } from '@payloadcms/ui'
import styles from '../styles/perfect-for.module.css'

interface AddPerfectForButtonProps {
  onOpen: (e: MouseEvent) => void
}

export const AddPerfectForButton = ({ onOpen }: AddPerfectForButtonProps) => (
  <div className={styles.addButtonWrapper}>
    <Button
      onClick={onOpen}
      buttonStyle="primary"
      className={styles.addButton}
    >
      + Add Perfect For Tags
    </Button>
  </div>
)
