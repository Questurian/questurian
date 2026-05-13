import type { HomepageWhereToEatDrinkItemRef } from '../types'

export function toRefKey(ref: HomepageWhereToEatDrinkItemRef): string {
  return `${ref.relationTo}:${ref.id}`
}
