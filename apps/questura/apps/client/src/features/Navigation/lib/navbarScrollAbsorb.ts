/**
 * The navbar normally collapses from the real scroll position and never takes
 * input away from the page (#589). The map layouts are the one place where the
 * old behaviour was wanted: there the first slice of wheel travel is spent
 * collapsing the header instead of moving the page, because the sticky map
 * column has to resize before the list starts scrolling under it.
 *
 * A map layout claims that behaviour for as long as it is mounted. The count
 * exists so two overlapping claims (a client navigation mounting the next map
 * page before the previous one unmounts) cannot switch it off early.
 */

type AbsorbListener = (enabled: boolean) => void

let claims = 0
const listeners = new Set<AbsorbListener>()

function broadcast(): void {
  const enabled = claims > 0
  for (const listener of listeners) listener(enabled)
}

/** Turn wheel absorption on while the caller is mounted. Returns the release. */
export function claimNavbarScrollAbsorb(): () => void {
  claims += 1
  if (claims === 1) broadcast()

  let released = false
  return () => {
    if (released) return
    released = true
    claims -= 1
    if (claims === 0) broadcast()
  }
}

/** Subscribe to the flag. Fires immediately with the current value. */
export function subscribeNavbarScrollAbsorb(listener: AbsorbListener): () => void {
  listeners.add(listener)
  listener(claims > 0)
  return () => {
    listeners.delete(listener)
  }
}
