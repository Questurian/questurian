import type { AuthState } from './auth-context';
import {
  LOGIN_TIMEOUT_MS,
  LOGOUT_ENDPOINTS,
  PAYLOAD_API_URL,
  REVALIDATION_TIMEOUT_MS,
  SESSION_HYDRATE_REQUESTS,
  SESSION_RENEW_REQUESTS,
  SESSION_RESTORE_TIMEOUT_MS,
} from './auth.constants';
import { normalizeAuthState } from './auth-state';

export type PayloadHealthResult = {
  isConnected: boolean;
  connectionError: string | null;
};

type SessionRequest = { endpoint: string; method: string };

async function requestSession(
  requests: readonly SessionRequest[],
  fallbackAuth?: AuthState | null,
): Promise<AuthState | null> {
  for (const request of requests) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), SESSION_RESTORE_TIMEOUT_MS);

    try {
      // No `Authorization` header, for the same reason `logoutPayloadUser`
      // sends none: `extractJWT` returns the *first* token it finds in
      // `jwtOrder` (JWT, Bearer, cookie) and verifies only that one. A stale
      // in-memory token would therefore be extracted, fail to verify, and take
      // the request down *even though the cookie beside it is still valid* —
      // turning a renewable session into a forced logout. The cookie is the
      // credential; letting anything shadow it is how it stops being one.
      const response = await fetch(`${PAYLOAD_API_URL}${request.endpoint}`, {
        method: request.method,
        mode: 'cors',
        cache: 'no-store',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        continue;
      }

      const restoredState = normalizeAuthState(await response.json(), fallbackAuth);
      if (restoredState) {
        return restoredState;
      }
    } catch {
      // Try the next compatible auth endpoint.
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return null;
}

// Hydrates the session with a fresh user from the database (/me first), so
// role changes made in Payload apply on the next app load.
export function hydratePayloadSession(
  fallbackAuth?: AuthState | null,
): Promise<AuthState | null> {
  return requestSession(SESSION_HYDRATE_REQUESTS, fallbackAuth);
}

// Renews a session nearing expiry (refresh-token first).
export function renewPayloadSession(
  fallbackAuth?: AuthState | null,
): Promise<AuthState | null> {
  return requestSession(SESSION_RENEW_REQUESTS, fallbackAuth);
}

export async function checkPayloadHealth(): Promise<PayloadHealthResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REVALIDATION_TIMEOUT_MS);

  try {
    const response = await fetch(`${PAYLOAD_API_URL}/api/health`, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (response.ok) {
      return { isConnected: true, connectionError: null };
    }

    return { isConnected: false, connectionError: `Server returned ${response.status}` };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return { isConnected: false, connectionError: 'Connection timeout' };
      }
      if (error.message.includes('Failed to fetch')) {
        return {
          isConnected: false,
          connectionError: 'Server unreachable - CORS or network issue',
        };
      }
      return { isConnected: false, connectionError: error.message };
    }
  } finally {
    clearTimeout(timeoutId);
  }

  return { isConnected: false, connectionError: null };
}

export async function loginPayloadUser(email: string, password: string): Promise<AuthState> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LOGIN_TIMEOUT_MS);

  try {
    const response = await fetch(`${PAYLOAD_API_URL}/api/users/login`, {
      method: 'POST',
      mode: 'cors',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ email, password }),
      signal: controller.signal,
    });

    if (!response.ok) {
      let message = 'Login failed. Please check your credentials.';
      try {
        const errorData = await response.json();
        const apiMessage = errorData?.message || errorData?.errors?.[0]?.message;
        if (apiMessage) {
          message = apiMessage;
        }
      } catch {
        // Keep default message when parsing fails.
      }
      throw new Error(message);
    }

    // Only the email is carried in: Payload's login response names the `exp`
    // and the user itself, and inventing a fallback expiry here would mean
    // holding a session the server never agreed to.
    const nextState = normalizeAuthState(await response.json(), {
      expiresAt: 0,
      user: {
        id: '',
        email,
      },
    });

    if (!nextState) {
      throw new Error('Login failed - the server returned no usable session');
    }

    return nextState;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Login timeout - server is not responding');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Ends the Payload session.
 *
 * Deliberately sends no `Authorization` header. Payload clears the cookie only
 * on a 2xx, and `extractJWT` uses the *first* token it finds — so a Bearer that
 * has already expired is extracted, fails to verify, leaves `req.user` null and
 * makes `logoutOperation` throw. The cookie would then survive a "successful"
 * logout, and since the cookie is now the only thing that restores a session,
 * the next page load would silently sign the operator back in.
 *
 * The cookie is what has to be cleared, so the cookie is what identifies the
 * request.
 */
export function logoutPayloadUser(): void {
  for (const request of LOGOUT_ENDPOINTS) {
    void fetch(`${PAYLOAD_API_URL}${request.endpoint}`, {
      method: request.method,
      mode: 'cors',
      credentials: 'include',
    }).catch(() => {
      // Local logout should not depend on backend route availability.
    });
  }
}
