import type { SlotValue } from './useHomepageFeaturedSlots'

export function swapCuratedSlots<T>(slots: T[], from: number, to: number): T[] {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= slots.length ||
    to >= slots.length ||
    from === to
  ) {
    return slots
  }

  const next = [...slots]
  const tmp = next[from]
  next[from] = next[to]
  next[to] = tmp
  return next
}

export function swapCuratedArticleSlots(
  slots: SlotValue[],
  from: number,
  to: number
): SlotValue[] {
  return swapCuratedSlots(slots, from, to)
}
