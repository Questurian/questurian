import type { HomepageThingsToDoListiclesItemRef } from '../types'

import { toReferenceKey } from '../../reference-grid/refs'

export function toRefKey(ref: HomepageThingsToDoListiclesItemRef): string {
  return toReferenceKey(ref)
}
