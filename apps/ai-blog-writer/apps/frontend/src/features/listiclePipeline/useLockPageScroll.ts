import { useEffect } from 'react'

/** How many open pop-ups hold the page still. A count, so closing one pop-up
 *  over another does not let the page move under the one still open. */
let holders = 0
let previous = ''

/** Keep the page behind a pop-up from scrolling while it is open. The pop-up
 *  itself still scrolls when its content is taller than the screen. */
export function useLockPageScroll() {
  useEffect(() => {
    const root = document.documentElement
    if (holders === 0) {
      previous = root.style.overflow
      root.style.overflow = 'hidden'
    }
    holders += 1
    return () => {
      holders -= 1
      if (holders === 0) root.style.overflow = previous
    }
  }, [])
}
