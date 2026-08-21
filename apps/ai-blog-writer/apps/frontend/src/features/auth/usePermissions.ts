import { useEffect, useMemo, useState } from 'react';
import { useAuth } from './useAuth';
import { fetchAccessPermissions, type AccessResult } from './permissions-client';

export type Permissions = {
  /** Can publish and update published Payload articles. */
  canManagePublished: boolean;
  /** Can create Staff identities and promote writers (admins only). */
  canManageUsers: boolean;
  /**
   * Can open the Author Directory and edit someone else's Author (ADR-0011:
   * admins reach every Author, editors reach writers and orphan bylines).
   *
   * Deliberately not derived from `authors.update`: an editor and a writer
   * both come back from /api/access as `{ permission: true, where: {...} }`,
   * so that response cannot tell this surface's two audiences apart. It is
   * taken from `canManagePublished` instead -- strict `true` on
   * `articles.update` for editor and admin, a `where` for a writer -- which
   * keeps ADR-0023's "derive from /api/access, not from a role literal" rule
   * without a second request. If the two ever need to diverge, this needs its
   * own signal rather than a role check.
   */
  canEditOtherAuthors: boolean;
  role: string | null;
  isLoading: boolean;
};

// Shared across all consumers so six components on one page trigger a single
// /api/access request per signed-in operator.
//
// Keyed by Staff id rather than by token: the credential is now an httpOnly
// cookie this code cannot read, and the identity is what the answer actually
// depends on. A session renewal used to mint a new token and therefore a new
// cache key, silently re-fetching; keying on identity means the entry survives
// renewal, which is the correct lifetime for "what may this person do".
const accessCache = new Map<string, Promise<AccessResult | null>>();

function getAccessForStaff(staffId: string): Promise<AccessResult | null> {
  let cached = accessCache.get(staffId);
  if (!cached) {
    cached = fetchAccessPermissions();
    accessCache.set(staffId, cached);
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
  const { user, isAuthenticated } = useAuth();
  // The id, not the object: `user` is a fresh identity on every session
  // renewal, and depending on it would re-run this effect and flip `isLoading`
  // for a render in every consumer for no change in who is signed in.
  const staffId = user?.id;
  const [access, setAccess] = useState<AccessResult | null>(null);
  const [isLoading, setIsLoading] = useState(isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated || !staffId) {
      setAccess(null);
      setIsLoading(false);
      return;
    }

    let isCancelled = false;
    setIsLoading(true);

    void getAccessForStaff(staffId).then((result) => {
      if (isCancelled) {
        return;
      }
      setAccess(result);
      setIsLoading(false);
    });

    return () => {
      isCancelled = true;
    };
  }, [isAuthenticated, staffId]);

  return useMemo(() => {
    const articlesUpdate = access?.collections?.articles?.update;
    const canManagePublished = access
      // Strict `true` means unrestricted update access (editors/admins).
      // Writers get `{ permission: true, where: {...} }`, which must not count.
      ? articlesUpdate === true
      // While loading or if /api/access is unreachable, fall back to the
      // role so the UI does not regress when the endpoint is unavailable.
      : roleAllowsManagePublished(user?.role);

    // Payload only lets admins create users, so users.create === true is the
    // /api/access signal for the staff-management surface (ADR-0023).
    const canManageUsers = access
      ? access.collections?.users?.create === true
      : user?.role === 'admin';

    return {
      canManagePublished,
      canManageUsers,
      canEditOtherAuthors: canManagePublished,
      role: user?.role ?? null,
      isLoading,
    };
  }, [access, isLoading, user?.role]);
}
