import { PerfectForTag } from '../types'

/**
 * Format category slug to display name
 * @example formatCategoryName('group-size') → 'Group Size'
 */
export const formatCategoryName = (category: string): string => {
  return category
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Get tag objects from array of IDs
 */
export const getTagsByIds = (
  tags: PerfectForTag[],
  ids: string[]
): PerfectForTag[] => {
  return tags.filter(tag => ids.includes(String(tag.id)))
}

/**
 * Filter tags by category
 */
export const filterTagsByCategory = (
  tags: PerfectForTag[],
  category: string
): PerfectForTag[] => {
  if (!category) return []
  return tags.filter(tag => tag.category === category)
}

/**
 * Filter tags by applicable type
 */
export const filterTagsByType = (
  tags: PerfectForTag[],
  type: string
): PerfectForTag[] => {
  if (!type) return tags
  return tags.filter(tag => tag.applicableTypes?.includes(type))
}
