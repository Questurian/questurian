/**
 * API error types and error classification helpers.
 */

/**
 * Custom error class for API errors that includes status code.
 */
export class APIError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'APIError';
  }
}

/**
 * Detect if an error is a service unavailability error.
 * Returns true if the error indicates the backend service is down.
 */
export function isServiceUnavailableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (
      message.includes('failed to fetch') ||
      message.includes('connection refused') ||
      message.includes('network error') ||
      message.includes('timeout')
    ) {
      return true;
    }

    if (
      message.includes('500') ||
      message.includes('502') ||
      message.includes('503') ||
      message.includes('504')
    ) {
      return true;
    }

    if (message.includes('invalid json response')) {
      return true;
    }
  }

  return false;
}
