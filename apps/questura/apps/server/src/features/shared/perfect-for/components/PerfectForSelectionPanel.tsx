'use client'

import { CategorySelect } from './CategorySelect'
import { TagCheckboxList } from './TagCheckboxList'
import { PerfectForTag } from '../types'
import styles from '../styles/perfect-for.module.css'

interface PerfectForSelectionPanelProps {
  categories: string[]
  selectedCategory: string
  onCategoryChange: (category: string) => void
  filteredTags: PerfectForTag[]
  selectedTagIds: string[]
  onToggleTag: (tagId: string) => void
}

export const PerfectForSelectionPanel = ({
  categories,
  selectedCategory,
  onCategoryChange,
  filteredTags,
  selectedTagIds,
  onToggleTag,
}: PerfectForSelectionPanelProps) => (
  <div className={styles.selectionPanel}>
    <CategorySelect
      categories={categories}
      value={selectedCategory}
      onChange={onCategoryChange}
    />

    {selectedCategory && filteredTags.length > 0 && (
      <TagCheckboxList
        tags={filteredTags}
        selectedTagIds={selectedTagIds}
        onToggle={onToggleTag}
      />
    )}

    {selectedCategory && filteredTags.length === 0 && (
      <div className={styles.emptyState}>
        No tags available in this category
      </div>
    )}
  </div>
)
