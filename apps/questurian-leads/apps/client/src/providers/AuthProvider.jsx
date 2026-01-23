import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const AUTH_STORAGE_KEY = 'payload_auth';
const DEFAULT_PAYLOAD_URL = 'http://localhost:4000';
const PAYLOAD_API_URL = import.meta.env.VITE_PAYLOAD_API_URL || DEFAULT_PAYLOAD_URL;
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

function isTokenValid(token, expiresAt) {
  if (!token || !expiresAt) {
    return false;
  }
  return Date.now() < expiresAt - EXPIRY_BUFFER_MS;
}

function readStoredAuth() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const stored = JSON.parse(raw);
    if (!isTokenValid(stored?.token, stored?.expiresAt)) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
    return stored;
  } catch (error) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [authState, setAuthState] = useState(() => readStoredAuth());

  const login = useCallback(async (email, password) => {
    const response = await fetch(`${PAYLOAD_API_URL}/api/users/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      let message = 'Login failed. Please check your credentials.';
      try {
        const errorData = await response.json();
        const apiMessage = errorData?.errors?.[0]?.message;
        if (apiMessage) {
          message = apiMessage;
        }
      } catch (error) {
        // Keep default message when parsing fails.
      }
      throw new Error(message);
    }

    const data = await response.json();
    const nextState = {
      token: data.token,
      expiresAt: data.exp * 1000,
      user: data.user,
    };
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextState));
    setAuthState(nextState);
    return data;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setAuthState(null);
  }, []);

  useEffect(() => {
    if (!authState?.token || !authState?.expiresAt) {
      return;
    }

    const remainingMs = authState.expiresAt - EXPIRY_BUFFER_MS - Date.now();
    if (remainingMs <= 0) {
      logout();
      return;
    }

    const timeoutId = window.setTimeout(() => logout(), remainingMs);
    return () => window.clearTimeout(timeoutId);
  }, [authState, logout]);

  const value = useMemo(() => {
    const token = authState?.token ?? null;
    const expiresAt = authState?.expiresAt ?? null;
    const user = authState?.user ?? null;
    const isAuthenticated = isTokenValid(token, expiresAt);

    return {
      token,
      expiresAt,
      user,
      isAuthenticated,
      login,
      logout,
    };
  }, [authState, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
