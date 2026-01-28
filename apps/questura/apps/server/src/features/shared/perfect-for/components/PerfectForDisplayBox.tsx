'use client'

import { type MouseEvent } from 'react'
import { Button } from '@payloadcms/ui'
import { PerfectForTag } from '../types'
import styles from '../styles/perfect-for.module.css'

interface PerfectForDisplayBoxProps {
  selectedTags: PerfectForTag[]
  isExpanded: boolean
  onToggle: (e: MouseEvent) => void
}

export const PerfectForDisplayBox = ({
  selectedTags,
  isExpanded,
  onToggle,
}: PerfectForDisplayBoxProps) => {
  if (selectedTags.length === 0) return null

  return (
    <div className={styles.displayBox}>
      <div className={styles.tagsContainer}>
        {selectedTags.map(tag => (
          <span key={tag.id} className={styles.tagPill}>
            {tag.label}
          </span>
        ))}
      </div>
      <div className={styles.displayBoxButtonContainer}>
        <Button onClick={onToggle} buttonStyle="secondary" size="small">
          {isExpanded ? 'Done' : 'Edit'}
        </Button>
      </div>
    </div>
  )
}
