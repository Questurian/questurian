/**
 * Scroll a pop-up so something that just opened is on screen.
 *
 * The research pop-up is one fixed size and its content scrolls inside it, so
 * opening a section below the fold would otherwise happen out of sight. Only
 * the pop-up scrolls -- never the page behind it, which is held still.
 */

/** Room kept between the pinned header and whatever is revealed. */
const GAP_PX = 12

function scroller(from: Element): HTMLElement | null {
  return from.closest<HTMLElement>('.lp-modal')
}

function motion(): ScrollBehavior {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth'
}

/** Bring `element` into view inside its pop-up.
 *
 *  `start` puts its top just under the header. `nearest` moves as little as
 *  possible: nothing if it is already visible, and never so far that its top
 *  goes under the header. */
export function revealInModal(
  element: Element | null | undefined,
  align: 'start' | 'nearest' = 'nearest'
) {
  if (!element) return
  const box = scroller(element)
  if (!box?.scrollBy) return
  const head = box.querySelector<HTMLElement>(':scope > .lp-modal-head')
  const frame = box.getBoundingClientRect()
  const top = frame.top + (head?.offsetHeight ?? 0) + GAP_PX
  const bottom = frame.bottom - GAP_PX
  const rect = element.getBoundingClientRect()
  let delta = 0
  if (align === 'start' || rect.top < top || rect.height > bottom - top)
    delta = rect.top - top
  else if (rect.bottom > bottom) delta = rect.bottom - bottom
  if (Math.abs(delta) > 1) box.scrollBy({ top: delta, behavior: motion() })
}

/** Same, after the browser has laid out what was just rendered. */
export function revealSoon(
  find: () => Element | null | undefined,
  align: 'start' | 'nearest' = 'nearest'
) {
  requestAnimationFrame(() => revealInModal(find(), align))
}

/** Back to the top of the pop-up, for a change of tab. Instant: a new tab is a
 *  new page, not a movement within one. */
export function scrollModalToTop(from: Element | null | undefined) {
  const box = from ? scroller(from) : null
  box?.scrollTo?.({ top: 0 })
}
