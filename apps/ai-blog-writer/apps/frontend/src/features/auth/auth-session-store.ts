import type { AuthState } from './auth-context';
import { LEGACY_AUTH_STORAGE_KEY } from './auth.constants';
import { hasActiveSession } from './auth-state';

/**
 * The live Staff session, held in memory for the lifetime of the page.
 *
 * This used to be `localStorage['payload_auth']`, holding the whole auth state
 * — Staff JWT included. Any XSS anywhere in this app could read a privileged
 * token out of it with one line, and the token outlived the tab, the window and
 * the browser restart.
 *
 * Nothing is written to disk now, and there is no longer a token to write. The
 * credential is the httpOnly `payload-token` cookie; what this holds is who
 * the operator is and when the session lapses. A reload starts empty and
 * rehydrates from that cookie via `/api/users/me`.
 *
 * That is the whole point of the change: an XSS payload has nothing to read
 * here. It can still *act* as the operator while the page is open — the cookie
 * rides along on any request it makes — but it cannot extract a credential and
 * use it elsewhere, later.
 *
 * Module scope rather than React state because it is read from outside the
 * component tree; `useAuthSessionState` is the only writer.
 */

let liveAuthState: AuthState | null = null;

export function setLiveAuthState(authState: AuthState | null): void {
  liveAuthState = authState;
}

export function getLiveAuthState(): AuthState | null {
  if (!liveAuthState) {
    return null;
  }

  if (!hasActiveSession(liveAuthState.expiresAt)) {
    liveAuthState = null;
    return null;
  }

  return liveAuthState;
}

/**
 * Removes the token this app used to persist.
 *
 * Without this, every operator who logged in before this change keeps a Staff
 * JWT on disk indefinitely — the code that would have cleared it on logout is
 * the code being deleted. Called once at bootstrap.
 */
export function purgeLegacyStoredAuth(): void {
  try {
    localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private mode, blocked cookies). Nothing to
    // purge in that case either.
  }
}
