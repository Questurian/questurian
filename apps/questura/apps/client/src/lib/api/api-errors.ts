/**
 * API error types and error classification helpers.
 *
 * `APIError` is `RequestError` (`request-policy.ts`): every failure carries a
 * status, a category and any `Retry-After`, so callers branch on those rather
 * than on message text.
 */

import { isTemporaryFailure, RequestError } from './request-policy';

export { RequestError as APIError } from './request-policy';
export type { RequestErrorCategory } from './request-policy';

/**
 * True when the backend could not answer — network failure, timeout, a
 * challenge page, overload or a server error — as opposed to answering "no".
 */
export function isServiceUnavailableError(error: unknown): boolean {
  if (error instanceof RequestError) return isTemporaryFailure(error);

  // Errors thrown by something other than `apiRequest` (a bare fetch).
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes('failed to fetch') || message.includes('network error') || message.includes('timeout');
  }

  return false;
}
