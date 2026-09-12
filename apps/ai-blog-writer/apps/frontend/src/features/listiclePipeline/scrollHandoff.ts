/**
 * A box that scrolls inside a page that scrolls, without the box keeping the
 * wheel once it has run out.
 *
 * Browsers latch a wheel gesture to the element it started on. Scroll a card
 * to its end and the rest of that same gesture goes nowhere: the card cannot
 * move and the page is not asked. The operator has to stop, scroll again, and
 * only then does the page move -- which on a board of forty cards happens on
 * nearly every card they pass.
 *
 * So the card hands over whatever it cannot use. A movement the card has room
 * for is left to the browser; a movement past its end scrolls the card to that
 * end and gives the remainder to the page, in the same gesture.
 */

/** How much of a movement a box cannot use, given where it is. Zero means
 *  the box takes all of it. */
export function leftoverDelta(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
  delta: number,
): number {
  if (delta > 0) {
    const room = Math.max(0, scrollHeight - clientHeight - scrollTop)
    return delta > room ? delta - room : 0
  }
  if (delta < 0) {
    const room = Math.max(0, scrollTop)
    return -delta > room ? delta + room : 0
  }
  return 0
}

const LINE_HEIGHT_PX = 16

/** The nearest ancestor that actually scrolls, or null for the page itself. */
function scrollParent(from: HTMLElement): HTMLElement | null {
  let node = from.parentElement
  while (node && node !== document.body && node !== document.documentElement) {
    const overflow = getComputedStyle(node).overflowY
    if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node
    }
    node = node.parentElement
  }
  return null
}

/** Pass the part of each wheel movement this box cannot use to whatever
 *  scrolls around it. Returns the cleanup. */
export function handOffWheel(box: HTMLElement): () => void {
  const onWheel = (event: WheelEvent) => {
    // Pinch-zoom arrives as a wheel with ctrl held, and sideways movement is
    // not this box's to give away.
    if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return
    const scale =
      event.deltaMode === 1 ? LINE_HEIGHT_PX : event.deltaMode === 2 ? box.clientHeight : 1
    const delta = event.deltaY * scale
    const leftover = leftoverDelta(box.scrollTop, box.clientHeight, box.scrollHeight, delta)
    if (leftover === 0) return
    event.preventDefault()
    box.scrollTop += delta - leftover
    const parent = scrollParent(box)
    if (parent) parent.scrollTop += leftover
    else window.scrollBy(0, leftover)
  }
  // Not passive: the browser has to be told not to spend this movement on a
  // box that is already at its end.
  box.addEventListener('wheel', onWheel, { passive: false })
  return () => box.removeEventListener('wheel', onWheel)
}
