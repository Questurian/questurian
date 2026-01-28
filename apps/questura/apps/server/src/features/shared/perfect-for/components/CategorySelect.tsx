'use client'

import { formatCategoryName } from '../utils'
import styles from '../styles/perfect-for.module.css'

interface CategorySelectProps {
  categories: string[]
  value: string
  onChange: (category: string) => void
}

const CATEGORY_ORDER = [
  'group-size',
  'occasion',
  'vibe',
  'time-of-day',
  'dietary',
  'activity-level',
  'budget',
  'special-features',
]

export const CategorySelect = ({ categories, value, onChange }: CategorySelectProps) => {
  const sortedCategories = [...categories].sort(
    (a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b)
  )

  return (
    <div className={styles.selectInputWrapper}>
      <label className={styles.selectLabel}>Category</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={styles.selectInput}
      >
        <option value="">Select a category...</option>
        {sortedCategories.map(category => (
          <option key={category} value={category}>
            {formatCategoryName(category)}
          </option>
        ))}
      </select>
    </div>
  )
}
