import { useCallback, useEffect, useMemo, useState } from 'react';
import { AuthContext, type AuthState } from './auth-context';

const AUTH_STORAGE_KEY = 'payload_auth';
const DEFAULT_PAYLOAD_URL = 'http://localhost:4000';
const PAYLOAD_API_URL = import.meta.env.VITE_PAYLOAD_API_URL || DEFAULT_PAYLOAD_URL;
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;
const SESSION_DURATION_FALLBACK_MS = 7 * 24 * 60 * 60 * 1000;

const SESSION_RESTORE_REQUESTS = [
  { endpoint: '/api/users/refresh-token', method: 'POST' },
  { endpoint: '/api/users/me', method: 'GET' },
] as const;

const LOGOUT_ENDPOINTS = [
  { endpoint: '/api/users/logout', method: 'POST' },
] as const;

function hasActiveSession(token: string | null | undefined, expiresAt: number | null | undefined): boolean {
  if (!token || !expiresAt) {
    return false;
  }

  return Date.now() < expiresAt;
}

function shouldRefreshSession(token: string | null | undefined, expiresAt: number | null | undefined): boolean {
  if (!token || !expiresAt) {
    return true;
  }

  return Date.now() >= expiresAt - EXPIRY_BUFFER_MS;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function decodeTokenExpiry(token: string): number | null {
  try {
    const [, base64Url] = token.split('.');
    if (!base64Url) {
      return null;
    }

    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((char) => `%${(`00${char.charCodeAt(0).toString(16)}`).slice(-2)}`)
        .join(''),
    );
    const decoded = JSON.parse(jsonPayload) as { exp?: unknown };
    const exp = readNumber(decoded.exp);

    return exp ? exp * 1000 : null;
  } catch {
    return null;
  }
}

function resolveExpiresAt(
  source: Record<string, unknown>,
  token: string,
  fallbackExpiresAt?: number | null,
): number {
  const numericExpiresAt = readNumber(source.expiresAt);
  if (numericExpiresAt) {
    return numericExpiresAt;
  }

  const numericExp = readNumber(source.exp);
  if (numericExp) {
    return numericExp * 1000;
  }

  const stringExpiresAt = readString(source.expiresAt);
  if (stringExpiresAt) {
    const timestamp = Date.parse(stringExpiresAt);
    if (!Number.isNaN(timestamp)) {
      return timestamp;
    }
  }

  const tokenExpiry = decodeTokenExpiry(token);
  if (tokenExpiry) {
    return tokenExpiry;
  }

  if (fallbackExpiresAt && fallbackExpiresAt > Date.now()) {
    return fallbackExpiresAt;
  }

  return Date.now() + SESSION_DURATION_FALLBACK_MS;
}

function normalizeAuthState(response: unknown, fallbackAuth?: AuthState | null): AuthState | null {
  if (!isRecord(response)) {
    return null;
  }

  const userSource = isRecord(response.user)
    ? response.user
    : isRecord(response.doc)
      ? response.doc
      : null;
  if (!userSource) {
    return null;
  }

  const token =
    readString(response.token)
    || readString(response.refreshedToken)
    || readString(response.accessToken)
    || readString(response.jwt)
    || (fallbackAuth && hasActiveSession(fallbackAuth.token, fallbackAuth.expiresAt) ? fallbackAuth.token : null);

  if (!token) {
    return null;
  }

  const expiresAt = resolveExpiresAt(response, token, fallbackAuth?.expiresAt ?? null);
  if (!hasActiveSession(token, expiresAt)) {
    return null;
  }

  const email = readString(userSource.email) || fallbackAuth?.user.email;
  if (!email) {
    return null;
  }

  return {
    token,
    expiresAt,
    user: {
      id: String(userSource.id ?? fallbackAuth?.user.id ?? ''),
      email,
      role: readString(userSource.role) || fallbackAuth?.user.role,
      firstName: readString(userSource.firstName) || fallbackAuth?.user.firstName,
      lastName: readString(userSource.lastName) || fallbackAuth?.user.lastName,
    },
  };
}

function persistAuth(authState: AuthState): void {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authState));
}

function clearStoredAuth(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

function readStoredAuth(): AuthState | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const stored: AuthState = JSON.parse(raw);
    if (!hasActiveSession(stored?.token, stored?.expiresAt)) {
      clearStoredAuth();
      return null;
    }

    return stored;
  } catch {
    clearStoredAuth();
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
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

  const restoreSession = useCallback(async (fallbackAuth?: AuthState | null): Promise<AuthState | null> => {
    for (const request of SESSION_RESTORE_REQUESTS) {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 8000);

      try {
        const headers: Record<string, string> = {
          Accept: 'application/json',
        };

        if (fallbackAuth?.token && hasActiveSession(fallbackAuth.token, fallbackAuth.expiresAt)) {
          headers.Authorization = `Bearer ${fallbackAuth.token}`;
        }

        const response = await fetch(`${PAYLOAD_API_URL}${request.endpoint}`, {
          method: request.method,
          mode: 'cors',
          cache: 'no-store',
          credentials: 'include',
          headers,
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
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const hydrateAuth = async () => {
      const storedAuth = readStoredAuth();
      let nextState = storedAuth;

      if (!storedAuth || shouldRefreshSession(storedAuth.token, storedAuth.expiresAt)) {
        nextState = await restoreSession(storedAuth);
      }

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
  }, [applyAuthState, restoreSession]);

  // Check connection to Payload CMS
  useEffect(() => {
    const checkConnection = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

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
          setIsConnected(true);
          setConnectionError(null);
        } else {
          setIsConnected(false);
          setConnectionError(`Server returned ${response.status}`);
        }
      } catch (error) {
        setIsConnected(false);
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            setConnectionError('Connection timeout');
          } else if (error.message.includes('Failed to fetch')) {
            setConnectionError('Server unreachable - CORS or network issue');
          } else {
            setConnectionError(error.message);
          }
        }
      } finally {
        clearTimeout(timeoutId);
      }
    };

    checkConnection();
    const intervalId = setInterval(checkConnection, 30000);

    return () => clearInterval(intervalId);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

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

      const nextState = normalizeAuthState(await response.json(), {
        token: '',
        expiresAt: Date.now() + SESSION_DURATION_FALLBACK_MS,
        user: {
          id: '',
          email,
        },
      });

      if (!nextState) {
        throw new Error('Login failed - no token received');
      }

      applyAuthState(nextState);
      setIsConnected(true);
      setIsRestoringSession(false);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Login timeout - server is not responding');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }, [applyAuthState]);

  const logout = useCallback(() => {
    const token = authState?.token ?? null;
    applyAuthState(null);
    setIsRestoringSession(false);

    for (const request of LOGOUT_ENDPOINTS) {
      void fetch(`${PAYLOAD_API_URL}${request.endpoint}`, {
        method: request.method,
        mode: 'cors',
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      }).catch(() => {
        // Local logout should not depend on backend route availability.
      });
    }
  }, [applyAuthState, authState?.token]);

  useEffect(() => {
    if (!authState?.token || !authState?.expiresAt) {
      return;
    }

    const remainingMs = authState.expiresAt - EXPIRY_BUFFER_MS - Date.now();
    const refreshSession = async () => {
      setIsRestoringSession(true);
      const restoredState = await restoreSession(authState);
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
  }, [applyAuthState, authState, restoreSession]);

  const value = useMemo(() => {
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

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
