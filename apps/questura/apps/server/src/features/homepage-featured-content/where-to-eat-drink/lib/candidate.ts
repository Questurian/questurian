import type { HomepageWhereToEatDrinkItemRef } from '../types'

import { toReferenceKey } from '../../reference-grid/refs'

export function toRefKey(ref: HomepageWhereToEatDrinkItemRef): string {
  return toReferenceKey(ref)
}
