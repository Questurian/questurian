/**
 * Security validation utilities
 */

import type { User } from '@/lib/user/types';

/**
 * Validates a redirect path to prevent open redirect vulnerabilities
 * Only allows relative paths starting with /
 */
export function isValidRedirectPath(path: string): boolean {
  if (!path) return false;

  // Only allow relative paths starting with /
  if (!path.startsWith('/')) return false;

  // Prevent protocol redirects (http://, https://, //)
  if (path.includes('://')) return false;
  if (path.startsWith('//')) return false;

  // Additional safety: reject paths with common redirect bypasses
  if (path.toLowerCase().includes('javascript:')) return false;
  if (path.toLowerCase().includes('data:')) return false;

  return true;
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
