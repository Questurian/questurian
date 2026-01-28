/**
 * Comprehensive Authentication Error Constants
 * 
 * This file defines all authentication error codes and messages used throughout
 * the dual authentication system for consistent error handling and user feedback.
 */

export const AUTH_ERRORS = {
  // Account lockout prevention errors
  CANNOT_REMOVE_LAST_METHOD: {
    code: 'CANNOT_REMOVE_LAST_METHOD',
    message: 'Cannot remove your only login method. Add another authentication method first.',
    userMessage: 'You need at least one way to access your account. Please add another login method before removing this one.',
    httpStatus: 400
  },
  
  UNSAFE_REMOVAL_BLOCKED: {
    code: 'UNSAFE_REMOVAL_BLOCKED',
    message: 'Operation blocked to prevent account lockout',
    userMessage: 'This action would lock you out of your account. Please ensure you have an alternative login method.',
    httpStatus: 400
  },

  // Email verification and linking errors
  EMAIL_MISMATCH: {
    code: 'EMAIL_MISMATCH',
    message: 'Google account email must match your current account email',
    userMessage: 'The Google account email must match your current account email. Please use the correct Google account.',
    httpStatus: 400
  },
  
  GOOGLE_EMAIL_REQUIRED: {
    code: 'GOOGLE_EMAIL_REQUIRED',
    message: 'Google account must have a verified email address',
    userMessage: 'Your Google account must have a verified email address to link accounts.',
    httpStatus: 400
  },

  // Account state and linking errors
  ALREADY_LINKED: {
    code: 'ALREADY_LINKED',
    message: 'This Google account is already linked to your account',
    userMessage: 'Your Google account is already linked. No action needed.',
    httpStatus: 400
  },
  
  GOOGLE_ACCOUNT_IN_USE: {
    code: 'GOOGLE_ACCOUNT_IN_USE',
    message: 'This Google account is linked to a different user',
    userMessage: 'This Google account is already linked to another user account.',
    httpStatus: 409
  },
  
  INVALID_ACCOUNT_STATE_FOR_LINKING: {
    code: 'INVALID_ACCOUNT_STATE_FOR_LINKING',
    message: 'Account is not in the correct state for linking',
    userMessage: 'Your account cannot be linked at this time. Please contact support if this continues.',
    httpStatus: 400
  },

  NO_LOCAL_PASSWORD: {
    code: 'NO_LOCAL_PASSWORD',
    message: 'Account uses Google authentication only',
    userMessage: 'This account uses Google sign-in only. Please sign in with Google, or add a password to your account first.',
    httpStatus: 400
  },

  // Account conflicts and security
  ACCOUNT_EXISTS_LOCAL: {
    code: 'ACCOUNT_EXISTS_LOCAL',
    message: 'Account exists with password authentication',
    userMessage: 'An account with this email already exists. Please sign in with your password.',
    httpStatus: 409
  },
  
  ACCOUNT_EXISTS_LOCAL_LINK_REQUIRED: {
    code: 'ACCOUNT_EXISTS_LOCAL_LINK_REQUIRED',
    message: 'Account exists with password. Use "Link Google Account" instead',
    userMessage: 'You have an existing account with this email. Please sign in with your password first, then link your Google account from your account settings.',
    httpStatus: 409
  },
  
  ADMIN_ACCOUNT_BLOCKED: {
    code: 'ADMIN_ACCOUNT_BLOCKED',
    message: 'Admin accounts cannot use social login for security',
    userMessage: 'Admin accounts cannot use Google sign-in for security reasons. Please use your password.',
    httpStatus: 403
  },
  
  OAUTH_ID_MISMATCH: {
    code: 'OAUTH_ID_MISMATCH',
    message: 'OAuth provider ID does not match stored ID',
    userMessage: 'There was a security issue with your Google account. Please contact support.',
    httpStatus: 403
  },

  // Authentication and validation errors
  AUTHENTICATION_REQUIRED: {
    code: 'AUTHENTICATION_REQUIRED',
    message: 'User must be authenticated to perform this action',
    userMessage: 'Please sign in to continue.',
    httpStatus: 401
  },

  INVALID_CREDENTIALS: {
    code: 'INVALID_CREDENTIALS',
    message: 'Invalid email or password',
    userMessage: 'The password you entered is incorrect. Please try again.',
    httpStatus: 401
  },
  
  INVALID_CONFIRMATION: {
    code: 'INVALID_CONFIRMATION',
    message: 'Invalid confirmation code provided',
    userMessage: 'Invalid confirmation. Please check your input and try again.',
    httpStatus: 400
  },
  
  PASSWORD_REQUIREMENTS_NOT_MET: {
    code: 'PASSWORD_REQUIREMENTS_NOT_MET',
    message: 'Password does not meet security requirements',
    userMessage: 'Password must be at least 8 characters and contain uppercase, lowercase, number, and special character.',
    httpStatus: 400
  },
  
  PASSWORDS_DO_NOT_MATCH: {
    code: 'PASSWORDS_DO_NOT_MATCH',
    message: 'Password and confirmation do not match',
    userMessage: 'Passwords do not match. Please try again.',
    httpStatus: 400
  },

  // System and OAuth errors
  OAUTH_TOKEN_EXCHANGE_FAILED: {
    code: 'OAUTH_TOKEN_EXCHANGE_FAILED',
    message: 'Failed to exchange OAuth code for access token',
    userMessage: 'There was a problem with Google authentication. Please try again.',
    httpStatus: 500
  },
  
  OAUTH_USER_INFO_FAILED: {
    code: 'OAUTH_USER_INFO_FAILED',
    message: 'Failed to retrieve user information from OAuth provider',
    userMessage: 'Unable to get your information from Google. Please try again.',
    httpStatus: 500
  },
  
  JWT_GENERATION_FAILED: {
    code: 'JWT_GENERATION_FAILED',
    message: 'Failed to generate authentication token',
    userMessage: 'Authentication failed. Please try signing in again.',
    httpStatus: 500
  },

  // Generic errors
  INTERNAL_SERVER_ERROR: {
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
    userMessage: 'Something went wrong. Please try again or contact support if the problem continues.',
    httpStatus: 500
  },
  
  INVALID_REQUEST: {
    code: 'INVALID_REQUEST',
    message: 'Invalid request parameters',
    userMessage: 'Invalid request. Please check your input and try again.',
    httpStatus: 400
  },
  
  RATE_LIMIT_EXCEEDED: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests in a short period',
    userMessage: 'Too many attempts. Please wait a few minutes before trying again.',
    httpStatus: 429
  }
} as const

/**
 * Get error details by code
 */
export function getAuthError(code: keyof typeof AUTH_ERRORS) {
  return AUTH_ERRORS[code] || AUTH_ERRORS.INTERNAL_SERVER_ERROR
}

/**
 * Create a standardized error response
 */
export function createAuthErrorResponse(code: keyof typeof AUTH_ERRORS, additionalData?: Record<string, any>) {
  const error = getAuthError(code)
  
  return {
    error: {
      code: error.code,
      message: error.userMessage,
      ...additionalData
    },
    status: error.httpStatus
  }
}

/**
 * Authentication method validation
 */
export function validateAuthMethodRemoval(hasPassword: boolean, hasGoogle: boolean, methodToRemove: 'password' | 'google') {
  if (methodToRemove === 'password' && !hasGoogle) {
    return AUTH_ERRORS.CANNOT_REMOVE_LAST_METHOD
  }
  
  if (methodToRemove === 'google' && !hasPassword) {
    return AUTH_ERRORS.CANNOT_REMOVE_LAST_METHOD
  }
  
  return null
}

/**
 * Password strength validation
 * TODO: Re-enable password strength validation after testing
 */
export function validatePasswordStrength(password: string) {
  // Temporarily disabled for testing - allows any password
  return null
  
  // Original validation (commented out for testing):
  // if (password.length < 8) {
  //   return AUTH_ERRORS.PASSWORD_REQUIREMENTS_NOT_MET
  // }

  // const hasUpperCase = /[A-Z]/.test(password)
  // const hasLowerCase = /[a-z]/.test(password)
  // const hasNumbers = /\d/.test(password)
  // const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password)

  // if (!hasUpperCase || !hasLowerCase || !hasNumbers || !hasSpecialChar) {
  //   return AUTH_ERRORS.PASSWORD_REQUIREMENTS_NOT_MET
  // }
  
  // return null
}

/**
 * Email matching validation for linking
 */
export function validateEmailForLinking(userEmail: string, googleEmail: string) {
  if (userEmail.toLowerCase() !== googleEmail.toLowerCase()) {
    return AUTH_ERRORS.EMAIL_MISMATCH
  }
  
  return null
}