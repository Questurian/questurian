import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AuthContextValue, AuthState } from './auth-context';
import { EXPIRY_BUFFER_MS } from './auth.constants';
import { hasActiveSession } from './auth-state';
import { clearPermissionsCache } from './usePermissions';
import { getLiveAuthState, setLiveAuthState } from './auth-session-store';
import {
  checkPayloadHealth,
  hydratePayloadSession,
  loginPayloadUser,
  logoutPayloadUser,
  renewPayloadSession,
} from './payload-auth-client';

export function useAuthSessionState(): AuthContextValue {
  const [authState, setAuthState] = useState<AuthState | null>(() => getLiveAuthState());
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const applyAuthState = useCallback((nextState: AuthState | null) => {
    // The store is read from outside the component tree, so it is updated
    // synchronously rather than waiting for a re-render.
    setLiveAuthState(nextState);
    setAuthState(nextState);
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const hydrateAuth = async () => {
      // After a reload there is nothing in memory, and the httpOnly
      // `payload-token` cookie is the only thing that can restore the session.
      // On a remount within the same page the live state serves as a fallback.
      // Either way this revalidates against the server, so role changes made in
      // Payload (e.g. writer -> editor promotion) apply without a re-login.
      const nextState = await hydratePayloadSession(getLiveAuthState());

      if (isCancelled) {
        return;
      }

      applyAuthState(nextState);
      if (nextState) {
        setIsConnected(true);
      }
      setIsRestoringSession(false);
    };

    void hydrateAuth();

    return () => {
      isCancelled = true;
    };
  }, [applyAuthState]);

  useEffect(() => {
    let isCancelled = false;

    const checkConnection = async () => {
      const result = await checkPayloadHealth();
      if (isCancelled) {
        return;
      }
      setIsConnected(result.isConnected);
      setConnectionError(result.connectionError);
    };

    void checkConnection();
    const intervalId = setInterval(checkConnection, 30000);

    return () => {
      isCancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const nextState = await loginPayloadUser(email, password);
    applyAuthState(nextState);
    setIsConnected(true);
    setIsRestoringSession(false);
  }, [applyAuthState]);

  const logout = useCallback(() => {
    applyAuthState(null);
    setIsRestoringSession(false);
    // The access cache is module-scoped and keyed by Staff id, so it outlives
    // both the component tree and a session renewal. Without this, signing out
    // and signing in as someone else on the same page load would serve the
    // previous operator's permissions. `clearPermissionsCache` was exported but
    // never called from app code — flagged as pre-existing on PR #221, and now
    // load-bearing because the cache no longer turns over with the token.
    clearPermissionsCache();
    logoutPayloadUser();
  }, [applyAuthState]);

  useEffect(() => {
    if (!authState?.expiresAt) {
      return;
    }

    // The hydrate effect above has always had this guard; the renewal effect
    // did not, which was a real bug rather than an asymmetry: logging out
    // while `/api/users/refresh-token` was in flight applied the renewed
    // session on top of the logout and signed the operator back in, in both
    // the UI and the module store. Flagged as pre-existing on PR #221 and
    // fixed here because this effect is being rewritten anyway.
    let isCancelled = false;

    const remainingMs = authState.expiresAt - EXPIRY_BUFFER_MS - Date.now();
    const refreshSession = async () => {
      setIsRestoringSession(true);
      const restoredState = await renewPayloadSession(authState);

      if (isCancelled) {
        return;
      }

      if (restoredState) {
        applyAuthState(restoredState);
      } else if (!hasActiveSession(authState.expiresAt)) {
        applyAuthState(null);
      }
      setIsRestoringSession(false);
    };

    if (remainingMs <= 0) {
      void refreshSession();
      return () => {
        isCancelled = true;
      };
    }

    const timeoutId = window.setTimeout(() => {
      void refreshSession();
    }, remainingMs);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [applyAuthState, authState]);

  return useMemo(() => {
    const expiresAt = authState?.expiresAt ?? null;
    const user = authState?.user ?? null;
    const isAuthenticated = hasActiveSession(expiresAt);

    return {
      expiresAt,
      user,
      isAuthenticated,
      isRestoringSession,
      isConnected,
      connectionError,
      login,
      logout,
    };
  }, [authState, connectionError, isConnected, isRestoringSession, login, logout]);
}
