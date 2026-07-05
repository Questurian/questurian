import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AuthContextValue, AuthState } from './auth-context';
import { EXPIRY_BUFFER_MS } from './auth.constants';
import { hasActiveSession } from './auth-state';
import { clearStoredAuth, persistAuth, readStoredAuth } from './auth-storage';
import {
  checkPayloadHealth,
  hydratePayloadSession,
  loginPayloadUser,
  logoutPayloadUser,
  renewPayloadSession,
} from './payload-auth-client';

export function useAuthSessionState(): AuthContextValue {
  const [authState, setAuthState] = useState<AuthState | null>(() => readStoredAuth());
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const applyAuthState = useCallback((nextState: AuthState | null) => {
    if (nextState) {
      persistAuth(nextState);
    } else {
      clearStoredAuth();
    }

    setAuthState(nextState);
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const hydrateAuth = async () => {
      const storedAuth = readStoredAuth();
      // Always revalidate against the server so role changes made in Payload
      // (e.g. writer -> editor promotion) take effect without a re-login.
      const nextState = await hydratePayloadSession(storedAuth);

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
    const token = authState?.token ?? null;
    applyAuthState(null);
    setIsRestoringSession(false);
    logoutPayloadUser(token);
  }, [applyAuthState, authState?.token]);

  useEffect(() => {
    if (!authState?.token || !authState?.expiresAt) {
      return;
    }

    const remainingMs = authState.expiresAt - EXPIRY_BUFFER_MS - Date.now();
    const refreshSession = async () => {
      setIsRestoringSession(true);
      const restoredState = await renewPayloadSession(authState);
      if (restoredState) {
        applyAuthState(restoredState);
      } else if (!hasActiveSession(authState.token, authState.expiresAt)) {
        applyAuthState(null);
      }
      setIsRestoringSession(false);
    };

    if (remainingMs <= 0) {
      void refreshSession();
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void refreshSession();
    }, remainingMs);

    return () => window.clearTimeout(timeoutId);
  }, [applyAuthState, authState]);

  return useMemo(() => {
    const token = authState?.token ?? null;
    const expiresAt = authState?.expiresAt ?? null;
    const user = authState?.user ?? null;
    const isAuthenticated = hasActiveSession(token, expiresAt);

    return {
      token,
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
