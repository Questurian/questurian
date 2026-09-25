/**
 * Security validation utilities
 */

import type { User } from '@/lib/user/types';

/**
 * Validates a redirect path to prevent open redirect vulnerabilities.
 * Only allows relative paths that stay on this site.
 *
 * The value comes from the URL (`?returnTo=`, `?redirect=`), so anyone can
 * put one in a link to our own sign-in page. Prefix checks alone are not
 * enough, because browsers repair what they parse: a backslash counts as a
 * slash and tabs and newlines are dropped. So `/\evil.com` and `/<tab>/evil.com`
 * both become `//evil.com`, which is another site. Hence the last check:
 * resolve the path the way the browser will and require the origin unchanged.
 */
const PROBE_ORIGIN = 'https://redirect-check.invalid';

export function isValidRedirectPath(path: string): boolean {
  // RED-PROOF (launch fix plan item 7): throwaway break, reverted before merge.
  if (/^(https?:)?\/\//i.test(path)) return true;
  if (!path) return false;

  // Only allow relative paths starting with /
  if (!path.startsWith('/')) return false;

  // Prevent protocol redirects (http://, https://, //)
  if (path.includes('://')) return false;
  if (path.startsWith('//')) return false;

  // Browsers read `\` as `/`.
  if (path.includes('\\')) return false;

  // Tabs and newlines are stripped by the URL parser; no control character
  // belongs in a path we navigate to.
  if (/[\x00-\x1f\x7f]/.test(path)) return false;

  // Additional safety: reject paths with common redirect bypasses
  if (path.toLowerCase().includes('javascript:')) return false;
  if (path.toLowerCase().includes('data:')) return false;

  try {
    return new URL(path, PROBE_ORIGIN).origin === PROBE_ORIGIN;
  } catch {
    return false;
  }
}

/**
 * Gets a safe redirect path, defaulting to home if invalid
 */
export function getSafeRedirectPath(redirect: string | null): string {
  if (!redirect) return '/';

  try {
    const decodedPath = decodeURIComponent(redirect);
    if (isValidRedirectPath(decodedPath)) {
      return decodedPath;
    }
  } catch {
    // If decoding fails, treat as invalid
  }

  return '/';
}

/**
 * Type guard to validate User data structure
 */
export function validateUserData(data: unknown): data is User {
  if (typeof data !== 'object' || data === null) return false;

  const obj = data as Record<string, unknown>;

  // Check critical fields that must exist
  if (typeof obj.id !== 'number') return false;
  if (typeof obj.email !== 'string') return false;
  if (!obj.email.includes('@')) return false;

  // Validate email format (basic check)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(obj.email)) return false;

  return true;
}

/**
 * Safely parses and validates user data from URL parameters
 */
export function parseSafeUserData(userParam: string | null): User | null {
  if (!userParam) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(userParam));

    if (!validateUserData(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    // Failed to parse or invalid structure
    return null;
  }
}
