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
 * Nothing is written to disk now. A reload starts with no session and
 * rehydrates from the httpOnly `payload-token` cookie Payload already sets on
 * login (`/api/users/me` returns the user *and* the current token, so the
 * cookie is sufficient to restore a session). The token still exists in JS
 * while the page is open — the FastAPI backend reads it from an
 * `Authorization` header, and that is a separate change — but it is no longer
 * sitting at rest behind a well-known key.
 *
 * Module scope rather than React state because `apiFetch` needs to read it from
 * outside the component tree; `useAuthSessionState` is the only writer.
 */

let liveAuthState: AuthState | null = null;

export function setLiveAuthState(authState: AuthState | null): void {
  liveAuthState = authState;
}

export function getLiveAuthState(): AuthState | null {
  if (!liveAuthState) {
    return null;
  }

  if (!hasActiveSession(liveAuthState.token, liveAuthState.expiresAt)) {
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
