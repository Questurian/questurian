import type { AuthState } from './auth-context';

export function hasActiveSession(expiresAt: number | null | undefined): boolean {
  if (!expiresAt) {
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

/**
 * When the session lapses, according to the server.
 *
 * Every Payload session endpoint returns `exp` — `loginOperation`,
 * `refreshOperation` and `meOperation` all set it — so this does not need the
 * which is the point: the app no longer has one to decode.
 *
 * Returns null when the server named no expiry, and the caller treats that as
 * "no session". The previous code decoded the JWT and, failing that, invented
 * seven days. That was already wrong — `payload-token` lives two hours — and
 * without a token to decode it would now be the *common* path rather than the
 * unreachable one. A session whose end is unknown is not a session worth
 * holding: the cookie will be rejected at that point anyway, so guessing long
 * only delays the discovery.
 */
export function resolveExpiresAt(
  source: Record<string, unknown>,
  fallbackExpiresAt?: number | null,
): number | null {
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

  if (fallbackExpiresAt && fallbackExpiresAt > Date.now()) {
    return fallbackExpiresAt;
  }

  return null;
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

  const expiresAt = resolveExpiresAt(response, fallbackAuth?.expiresAt ?? null);
  if (!hasActiveSession(expiresAt)) {
    return null;
  }

  const email = readString(userSource.email) || fallbackAuth?.user.email;
  if (!email) {
    return null;
  }

  return {
    expiresAt: expiresAt as number,
    user: {
      id: String(userSource.id ?? fallbackAuth?.user.id ?? ''),
      email,
      // The server response is authoritative for identity-derived fields.
      // Falling back to the stored role would keep a stale role alive across
      // sessions (e.g. after a writer -> editor promotion).
      role: readString(userSource.role) ?? undefined,
      firstName: readString(userSource.firstName) ?? undefined,
      lastName: readString(userSource.lastName) ?? undefined,
    },
  };
}
