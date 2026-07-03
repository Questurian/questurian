import type { AuthState } from './auth-context';
import { SESSION_DURATION_FALLBACK_MS } from './auth.constants';

export function hasActiveSession(
  token: string | null | undefined,
  expiresAt: number | null | undefined,
): boolean {
  if (!token || !expiresAt) {
    return false;
  }

  return Date.now() < expiresAt;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function decodeTokenExpiry(token: string): number | null {
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

export function resolveExpiresAt(
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

export function normalizeAuthState(
  response: unknown,
  fallbackAuth?: AuthState | null,
): AuthState | null {
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
