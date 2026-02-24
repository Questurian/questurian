import { PasswordResetRequestError } from '../hooks/usePasswordResetRequest';
import { VerifyCodeError } from '../hooks/usePasswordResetVerify';

interface RequestErrorOptions {
  supportNoLocalPassword?: boolean;
}

export function mapRequestResetError(
  error: unknown,
  fallbackMessage: string,
  options?: RequestErrorOptions
): string {
  if (error instanceof PasswordResetRequestError) {
    if (options?.supportNoLocalPassword && error.code === 'NO_LOCAL_PASSWORD') {
      return error.message;
    }
    return error.message || fallbackMessage;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallbackMessage;
}

export function mapVerifyCodeError(error: unknown): { fieldError?: string; generalError?: string } {
  if (error instanceof VerifyCodeError) {
    switch (error.errorCode) {
      case 'INVALID_REQUEST':
        return { fieldError: 'Please provide both email and code.' };
      case 'INVALID_CONFIRMATION':
        return { generalError: 'The code is invalid or has expired. Please request a new code.' };
      case 'INTERNAL_SERVER_ERROR':
        return { generalError: 'Something went wrong. Please try again.' };
      default:
        return { generalError: error.message || 'Failed to verify code. Please try again.' };
    }
  }

  if (error instanceof Error) {
    return { generalError: error.message };
  }

  return { generalError: 'Failed to verify code. Please try again.' };
}

export function mapResetPasswordError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Failed to reset password. Please try again.';
}

export function shouldReturnToEmailStep(errorMessage: string): boolean {
  return errorMessage.includes('expired') || errorMessage.includes('invalid');
}

export function mapAutoLoginError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Failed to log in after password reset.';
}
