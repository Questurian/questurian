import type { HomepageThingsToDoListiclesItemRef } from '../types'

export function toRefKey(ref: HomepageThingsToDoListiclesItemRef): string {
  return `${ref.relationTo}:${ref.id}`
}
