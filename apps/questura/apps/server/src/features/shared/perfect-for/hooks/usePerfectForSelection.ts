import { useEffect, useRef, useState } from 'react'
import { PerfectForTag } from '../types'

export const usePerfectForSelection = (
  value: string[],
  isLoading: boolean,
  allTags: PerfectForTag[],
  applicableType?: string
) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [filteredTags, setFilteredTags] = useState<PerfectForTag[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const prevCategoryRef = useRef<string>('')
  const isInternalUpdateRef = useRef<boolean>(false)

  // Initialize from saved value
  useEffect(() => {
    // Skip if this is an internal update (from toggleTag)
    if (isInternalUpdateRef.current) {
      isInternalUpdateRef.current = false
      return
    }

    if (!isLoading && value && value.length > 0) {
      const stringIds = value.map(id => String(id))
      setSelectedTagIds(stringIds)
    }
  }, [isLoading, value])

  // Filter tags when category changes
  useEffect(() => {
    if (!selectedCategory || allTags.length === 0) {
      setFilteredTags([])
      return
    }
    let tagsToShow = allTags.filter(tag => tag.category === selectedCategory)
    if (applicableType) {
      tagsToShow = tagsToShow.filter(tag =>
        tag.applicableTypes?.includes(applicableType)
      )
    }
    setFilteredTags(tagsToShow)
    // DON'T clear selections - allow multi-category selection
    prevCategoryRef.current = selectedCategory
  }, [selectedCategory, allTags, applicableType])

  const toggleTag = (tagId: string) => {
    // Mark this as an internal update to prevent circular sync
    isInternalUpdateRef.current = true
    setSelectedTagIds(prev =>
      prev.includes(tagId)
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    )
  }

  return {
    selectedCategory,
    setSelectedCategory,
    filteredTags,
    selectedTagIds,
    toggleTag,
  }
}
