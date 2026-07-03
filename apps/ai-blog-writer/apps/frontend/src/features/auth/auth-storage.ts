import type { AuthState } from './auth-context';
import { AUTH_STORAGE_KEY } from './auth.constants';
import { hasActiveSession } from './auth-state';

export function persistAuth(authState: AuthState): void {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authState));
}

export function clearStoredAuth(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

export function readStoredAuth(): AuthState | null {
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
