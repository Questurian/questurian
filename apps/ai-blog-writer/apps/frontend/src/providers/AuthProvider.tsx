import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const AUTH_STORAGE_KEY = 'payload_auth';
const DEFAULT_PAYLOAD_URL = 'http://localhost:4000';
const PAYLOAD_API_URL = import.meta.env.VITE_PAYLOAD_API_URL || DEFAULT_PAYLOAD_URL;
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

interface User {
  id: string;
  email: string;
  role?: string;
  firstName?: string;
  lastName?: string;
}

interface AuthState {
  token: string;
  expiresAt: number;
  user: User;
}

interface AuthContextValue {
  token: string | null;
  expiresAt: number | null;
  user: User | null;
  isAuthenticated: boolean;
  isConnected: boolean;
  connectionError: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

function isTokenValid(token: string | null | undefined, expiresAt: number | null | undefined): boolean {
  if (!token || !expiresAt) {
    return false;
  }
  return Date.now() < expiresAt - EXPIRY_BUFFER_MS;
}

function readStoredAuth(): AuthState | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const stored: AuthState = JSON.parse(raw);
    if (!isTokenValid(stored?.token, stored?.expiresAt)) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
    return stored;
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState<AuthState | null>(() => readStoredAuth());
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Check connection to Payload CMS
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(`${PAYLOAD_API_URL}/api/health`, {
          method: 'GET',
          mode: 'cors',
          credentials: 'omit',
          headers: {
            'Accept': 'application/json',
          },
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
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
      }
    };

    // Check immediately and then every 30 seconds
    checkConnection();
    const intervalId = setInterval(checkConnection, 30000);

    return () => clearInterval(intervalId);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(`${PAYLOAD_API_URL}/api/auth/login`, {
        method: 'POST',
        mode: 'cors',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ email, password }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

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

      const data = await response.json();
      
      // Handle the response format from the Questura auth endpoint
      // Response: { token: string, user: User }
      if (!data.token) {
        throw new Error(data.message || 'Login failed - no token received');
      }

      // Extract expiration from JWT token (exp is in seconds)
      let expiresAt: number;
      try {
        const base64Url = data.token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
          atob(base64)
            .split('')
            .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        );
        const decoded = JSON.parse(jsonPayload);
        expiresAt = decoded.exp ? decoded.exp * 1000 : Date.now() + 7 * 24 * 60 * 60 * 1000;
      } catch {
        // Fallback to 7 days if decoding fails
        expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
      }

      const nextState: AuthState = {
        token: data.token,
        expiresAt,
        user: {
          id: String(data.user?.id || ''),
          email: data.user?.email || email,
          role: data.user?.role,
          firstName: data.user?.firstName,
          lastName: data.user?.lastName,
        },
      };
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextState));
      setAuthState(nextState);
      setIsConnected(true);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Login timeout - server is not responding');
      }
      throw error;
    }
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
      isConnected,
      connectionError,
      login,
      logout,
    };
  }, [authState, isConnected, connectionError, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
