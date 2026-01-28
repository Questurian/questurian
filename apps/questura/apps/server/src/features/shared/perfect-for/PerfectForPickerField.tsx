'use client'

import { useEffect, useRef, type MouseEvent } from 'react'
import { useField } from '@payloadcms/ui'
import {
  PerfectForDisplayBox,
  AddPerfectForButton,
  PerfectForSelectionPanel
} from './components'
import { usePerfectForData, usePerfectForSelection, usePickerExpanded } from './hooks'
import { getTagsByIds } from './utils'
import type { PerfectForPickerFieldProps } from './types'
import styles from './styles/perfect-for.module.css'

export const PerfectForPickerField = (props: PerfectForPickerFieldProps) => {
  const { path, applicableType } = props
  const { value, setValue } = useField<string[]>({ path })
  const { allTags, categories, isLoading } = usePerfectForData()
  const {
    selectedCategory,
    setSelectedCategory,
    filteredTags,
    selectedTagIds,
    toggleTag,
  } = usePerfectForSelection(value || [], isLoading, allTags, applicableType)
  const { isExpanded, setIsExpanded } = usePickerExpanded(value?.length ? 'has-value' : '')
  const prevSelectedTagIdsRef = useRef<string[]>([])

  // Sync selected tags to form field
  useEffect(() => {
    // Only call setValue if the array actually changed
    const prev = prevSelectedTagIdsRef.current
    const hasChanged =
      prev.length !== selectedTagIds.length ||
      prev.some((id, idx) => id !== selectedTagIds[idx])

    if (hasChanged) {
      setValue(selectedTagIds)
      prevSelectedTagIdsRef.current = selectedTagIds
    }
  }, [selectedTagIds, setValue])

  const selectedTags = getTagsByIds(allTags, selectedTagIds)

  const handleToggleExpanded = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsExpanded(!isExpanded)
  }

  const handleOpenPicker = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsExpanded(true)
  }

  if (isLoading) return <div>Loading tags...</div>

  return (
    <div className="field-type">
      <label className="field-label">Perfect For</label>
      <div className={styles.container}>
        {selectedTags.length > 0 ? (
          <PerfectForDisplayBox
            selectedTags={selectedTags}
            isExpanded={isExpanded}
            onToggle={handleToggleExpanded}
          />
        ) : (
          <AddPerfectForButton onOpen={handleOpenPicker} />
        )}
        {isExpanded && (
          <PerfectForSelectionPanel
            categories={categories}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            filteredTags={filteredTags}
            selectedTagIds={selectedTagIds}
            onToggleTag={toggleTag}
          />
        )}
      </div>
    </div>
  )
}

export default PerfectForPickerField
