import { createContext } from 'react';

export interface User {
  id: string;
  email: string;
  role?: string;
  firstName?: string;
  lastName?: string;
}

export interface AuthState {
  token: string;
  expiresAt: number;
  user: User;
}

export interface AuthContextValue {
  token: string | null;
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
