import { PAYLOAD_API_URL, REVALIDATION_TIMEOUT_MS } from './auth.constants';

/**
 * Sanitized permissions from Payload's GET /api/access.
 *
 * Payload 3 sanitizes the result: an unrestricted allowed operation is the
 * literal `true`, a query-constrained operation is `{ permission: true,
 * where: {...} }`, and denied operations are removed entirely.
 */
export type CollectionOperationAccess =
  | true
  | { permission: boolean; where?: Record<string, unknown> };

export type AccessResult = {
  canAccessAdmin?: boolean;
  collections?: Record<
    string,
    Partial<Record<'create' | 'read' | 'update' | 'delete', CollectionOperationAccess>>
  >;
};

export async function fetchAccessPermissions(): Promise<AccessResult | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REVALIDATION_TIMEOUT_MS);

  try {
    const response = await fetch(`${PAYLOAD_API_URL}/api/access`, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const result: unknown = await response.json();
    if (typeof result !== 'object' || result === null) {
      return null;
    }

    return result as AccessResult;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
