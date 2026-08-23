import type { HomepageHotelGridSelection } from './hotelGridTypes'
import type { HomepageLocationGridSelection } from './locationGridTypes'
import type { HomepageFeaturedSelection } from './types'

/** Bumps TanStack query keys when saved slot contents change without block shape changing. */
export function homepageFeaturedSelectionRevision(
  s: HomepageFeaturedSelection
): string {
  const itemSig = [...s.items]
    .map((it) => `${it.slot ?? 0}:${it.relationTo}:${it.id}`)
    .sort()
    .join(';')
  const invSig = [...s.invalidItems]
    .map(
      (it) => `${it.slot}:${it.reason}:${it.relationTo ?? ''}:${it.id ?? ''}`
    )
    .sort()
    .join(';')
  return `${s.totalSlots}|${itemSig}|${invSig}`
}

export function homepageHotelGridSelectionRevision(
  s: HomepageHotelGridSelection
): string {
  const itemSig = [...s.items]
    .map((it) => `${it.slot ?? 0}:${it.id}`)
    .sort()
    .join(';')
  const invSig = [...s.invalidItems]
    .map((it) => `${it.slot}:${it.reason}:${it.id ?? ''}`)
    .sort()
    .join(';')
  return `${s.totalSlots}|${itemSig}|${invSig}`
}

export function homepageLocationGridSelectionRevision(
  s: HomepageLocationGridSelection
): string {
  const itemSig = [...s.items]
    .map((it) => `${it.slot ?? 0}:${it.id}`)
    .sort()
    .join(';')
  const invSig = [...s.invalidItems]
    .map((it) => `${it.slot}:${it.reason}:${it.id ?? ''}`)
    .sort()
    .join(';')
  return `${s.totalSlots}|${itemSig}|${invSig}`
}
