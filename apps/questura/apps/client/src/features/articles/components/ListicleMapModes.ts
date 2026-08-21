/**
 * The three states of the mobile listicle map, and the geometry that puts the
 * sheet where each of them wants it.
 *
 * The sheet is always the full viewport tall; a mode only says how much of it
 * is on screen. Keeping the height fixed means the map inside never resizes -
 * switching modes is a transform, not a layout pass.
 *
 * Modes are switched by the floating control only. There is deliberately no
 * drag affordance: the sheet's top edge sits at the top of the screen in the
 * takeover, where a downward drag is the system notification-shade gesture.
 */

export type ListicleMapMode = 'list' | 'split' | 'map'

export const LISTICLE_MAP_MODES: ListicleMapMode[] = ['list', 'split', 'map']

export const LISTICLE_MAP_MODE_LABELS: Record<ListicleMapMode, string> = {
  list: 'List',
  split: 'Split',
  map: 'Map',
}

/** Visible height at the split mode, as a fraction of the viewport. */
export const SPLIT_VISIBLE_FRACTION = 0.52

export function sheetHeightPx(viewportHeight: number): number {
  return viewportHeight
}

export function visibleHeightForMode(
  mode: ListicleMapMode,
  viewportHeight: number,
): number {
  if (mode === 'list') return 0
  if (mode === 'map') return viewportHeight
  return Math.round(viewportHeight * SPLIT_VISIBLE_FRACTION)
}

/** How far down the sheet sits for a given amount of visible height. */
export function translateForVisibleHeight(
  visibleHeight: number,
  viewportHeight: number,
): number {
  return Math.max(sheetHeightPx(viewportHeight) - visibleHeight, 0)
}

/** Map pixels hidden below the fold at a given visible height. */
export function hiddenBelowFold(
  visibleHeight: number,
  viewportHeight: number,
): number {
  return translateForVisibleHeight(visibleHeight, viewportHeight)
}
