import { useEffect, useMemo, useState } from 'react';
import { useAuth } from './useAuth';
import { fetchAccessPermissions, type AccessResult } from './permissions-client';

export type Permissions = {
  /** Can publish and update published Payload articles. */
  canManagePublished: boolean;
  role: string | null;
  isLoading: boolean;
};

// Shared across all consumers so six components on one page trigger a single
// /api/access request per token.
const accessCache = new Map<string, Promise<AccessResult | null>>();

function getAccessForToken(token: string): Promise<AccessResult | null> {
  let cached = accessCache.get(token);
  if (!cached) {
    cached = fetchAccessPermissions(token);
    accessCache.set(token, cached);
  }
  return cached;
}

export function clearPermissionsCache(): void {
  accessCache.clear();
}

function roleAllowsManagePublished(role: string | undefined | null): boolean {
  return role === 'admin' || role === 'editor';
}

export function usePermissions(): Permissions {
  const { token, user } = useAuth();
  const [access, setAccess] = useState<AccessResult | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(token));

  useEffect(() => {
    if (!token) {
      setAccess(null);
      setIsLoading(false);
      return;
    }

    let isCancelled = false;
    setIsLoading(true);

    void getAccessForToken(token).then((result) => {
      if (isCancelled) {
        return;
      }
      setAccess(result);
      setIsLoading(false);
    });

    return () => {
      isCancelled = true;
    };
  }, [token]);

  return useMemo(() => {
    const articlesUpdate = access?.collections?.articles?.update;
    const canManagePublished = access
      // Strict `true` means unrestricted update access (editors/admins).
      // Writers get `{ permission: true, where: {...} }`, which must not count.
      ? articlesUpdate === true
      // While loading or if /api/access is unreachable, fall back to the
      // role so the UI does not regress when the endpoint is unavailable.
      : roleAllowsManagePublished(user?.role);

    return {
      canManagePublished,
      role: user?.role ?? null,
      isLoading,
    };
  }, [access, isLoading, user?.role]);
}
