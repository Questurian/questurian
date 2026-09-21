/**
 * Whether a navigation the reader started is still on its way.
 *
 * Two sources feed it, both driven by the framework's own transition state
 * rather than timers:
 * - links report `useLinkStatus().pending` while they stay mounted;
 * - `NavigationFeedback` (mounted once at the root, never unmounted) owns a
 *   transition for navigations whose source disappears on click — menus that
 *   close themselves, nested author bylines, search submission.
 *
 * `<html data-navigating>` is set the moment either source turns on, without
 * waiting for a React render; the blue line and the screen-reader status hang
 * off that attribute and the subscription below.
 */

type NavigateOptions = { replace?: boolean; scroll?: boolean }
type Navigator = (href: string, options?: NavigateOptions) => void

let pendingLinks = 0
let transitionPending = false
let navigator: Navigator | null = null
const listeners = new Set<() => void>()

function isActive(): boolean {
  return pendingLinks > 0 || transitionPending
}

let lastActive = false
function publish(): void {
  const active = isActive()
  if (active === lastActive) return
  lastActive = active
  if (typeof document !== 'undefined') {
    document.documentElement.toggleAttribute('data-navigating', active)
  }
  for (const listener of listeners) listener()
}

export function subscribeNavigationFeedback(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function isNavigationPending(): boolean {
  return lastActive
}

/** Marks one link as pending; call the returned function when it settles. */
export function reportPendingLink(): () => void {
  pendingLinks += 1
  publish()
  let settled = false
  return () => {
    if (settled) return
    settled = true
    pendingLinks -= 1
    publish()
  }
}

export function setTransitionPending(pending: boolean): void {
  transitionPending = pending
  publish()
}

export function registerNavigator(next: Navigator): () => void {
  navigator = next
  return () => {
    if (navigator === next) navigator = null
  }
}

/**
 * Navigates inside the root-owned transition, so the feedback outlives the
 * element that was clicked. Returns false when no owner is mounted; the caller
 * then navigates the ordinary way.
 */
export function navigateWithFeedback(href: string, options?: NavigateOptions): boolean {
  if (!navigator) return false
  navigator(href, options)
  return true
}
