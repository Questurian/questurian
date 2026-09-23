/**
 * A pre-paint guess at who is reading, so the navbar's Sign in and Subscribe
 * controls can paint in the same frame as the rest of the page.
 *
 * Public pages are statically cached, so the real answer (`/api/me`) only
 * arrives after hydration. Until then the navbar renders both controls, and an
 * inline `<head>` script (below) stamps `<html data-identity>` from the last
 * answer this browser saw. CSS hides whichever control that reader would not
 * get, but only while the control is marked `data-pending`; once `/api/me`
 * answers, React alone decides and a stale hint is corrected.
 *
 * No hint (first visit, private window, storage blocked) means anonymous,
 * which is right for most traffic. It is a display hint only: nothing gates
 * on it, and it holds no personal value.
 *
 * Dependency-free so node:test can run it.
 */

export type IdentityHint = 'anon' | 'user' | 'member'

export const IDENTITY_HINT_KEY = 'qv-hint'

type HintStorage = Pick<Storage, 'getItem' | 'setItem'>

function defaultStorage(): HintStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function hintFromResponse(response: {
  authenticated: boolean
  principal: { membership?: { active?: boolean } } | null
}): IdentityHint {
  if (!response.authenticated || !response.principal) return 'anon'
  return response.principal.membership?.active === true ? 'member' : 'user'
}

export function readHint(storage: HintStorage | null = defaultStorage()): IdentityHint {
  try {
    const value = storage?.getItem(IDENTITY_HINT_KEY)
    return value === 'user' || value === 'member' ? value : 'anon'
  } catch {
    return 'anon'
  }
}

export function writeHint(hint: IdentityHint, storage: HintStorage | null = defaultStorage()): void {
  try {
    storage?.setItem(IDENTITY_HINT_KEY, hint)
  } catch {
    // Storage blocked or full: the next page falls back to anonymous.
  }
}

/**
 * Runs in `<head>` before first paint. Keep it tiny and in step with
 * `readHint`: only `user` and `member` set the attribute, anything else leaves
 * the page anonymous.
 */
export const IDENTITY_HINT_SCRIPT = `try{var h=localStorage.getItem("${IDENTITY_HINT_KEY}");if(h==="user"||h==="member")document.documentElement.dataset.identity=h}catch(e){}`
