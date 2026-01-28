'use client'

import { PerfectForTag } from '../types'
import styles from '../styles/perfect-for.module.css'

interface TagCheckboxListProps {
  tags: PerfectForTag[]
  selectedTagIds: string[]
  onToggle: (tagId: string) => void
}

export const TagCheckboxList = ({ tags, selectedTagIds, onToggle }: TagCheckboxListProps) => (
  <div className={styles.checkboxList}>
    <div className={styles.checkboxListLabel}>Select tags:</div>
    {tags.map(tag => (
      <label key={tag.id} className={styles.checkboxLabel}>
        <input
          type="checkbox"
          checked={selectedTagIds.includes(String(tag.id))}
          onChange={() => onToggle(String(tag.id))}
          className={styles.checkbox}
        />
        <div className={styles.checkboxContent}>
          <span className={styles.checkboxText}>{tag.label}</span>
          {tag.description && (
            <span className={styles.checkboxDescription}>{tag.description}</span>
          )}
        </div>
      </label>
    ))}
  </div>
)
