import { createContext } from 'react';

export interface User {
  id: string;
  email: string;
  role?: string;
  firstName?: string;
  lastName?: string;
}

/**
 * The live Staff session as this app knows it.
 *
 * Deliberately holds no token. The credential is the httpOnly `payload-token`
 * cookie, which no script can read; what the app needs is only who the
 * operator is and when the session lapses. `expiresAt` comes from the `exp`
 * every Payload session endpoint returns (`login`, `refresh-token`, `me`), not
 * from decoding a JWT this app no longer has.
 */
export interface AuthState {
  expiresAt: number;
  user: User;
}

export interface AuthContextValue {
  expiresAt: number | null;
  user: User | null;
  isAuthenticated: boolean;
  isRestoringSession: boolean;
  isConnected: boolean;
  connectionError: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
